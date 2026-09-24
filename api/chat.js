// api/chat.js — endpoint do chat com IA (function serverless da Vercel, Node.js).
//
// Fluxo:
//   1. Escolhe, pelas palavras da pergunta, de qual dos 5 modulos do ERP e a
//      duvida, e trabalha so com o documento daquele modulo (mandar os 5
//      somava ~800 mil tokens, mais que o triplo do teto do nivel gratuito).
//      Pra esse documento, confere se ja tem uma referencia
//      valida no Supabase (tabela chat_arquivos). Se nao tiver (ou tiver
//      vencido), baixa o .docx do Supabase Storage, extrai o texto (mammoth)
//      e sobe esse texto pro Gemini File API — guarda a referencia devolvida
//      (expira em ~48h) pra reusar nas proximas perguntas, sem reprocessar
//      tudo de novo.
//   2. Busca na tabela "solucoes" do Supabase as soluções já cadastradas no
//      site com maior relevância pra pergunta (mesmo criterio de pontuação
//      usado na busca da pagina Inicio) — só as mais relevantes, não o banco
//      inteiro, pra economizar tokens.
//   3. Chama o Gemini em modo chat (startChat), com os 5 arquivos referenciados,
//      o historico de perguntas/respostas anteriores dessa conversa (mandado
//      pelo navegador), as soluções relevantes encontradas e a pergunta atual
//      — assim ele mantem o contexto entre uma pergunta e outra em vez de
//      responder cada uma isolada.
//
// Variaveis de ambiente esperadas (Vercel > Settings > Environment Variables,
// nunca commitadas):
//   GEMINI_API_KEY       — chave da API do Gemini (aistudio.google.com/apikey)
//   SUPABASE_SERVICE_KEY — service_role key do Supabase (Settings > API),
//                          precisa pra ler o bucket de documentos sem
//                          depender de sessao de usuario.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// URL do projeto Supabase — igual a usada em public/js/config/supabase-config.js.
// Nao e segredo (fica publica no JS do navegador tambem).
const SUPABASE_URL = "https://allyziuhotptjoltdkxd.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const BUCKET = "documentos-erp";

// Modelos tentados em ordem: o primeiro e o padrao, os seguintes sao
// alternativas para quando o Google recusa o anterior por sobrecarga (503)
// ou cota (429). No nivel gratuito cada modelo tem capacidade e cota
// proprias, entao cair pro proximo costuma responder na hora — ao contrario
// de insistir no mesmo modelo, que ja disse que nao tem capacidade.
const MODELOS = [
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash"
];

// Nome de cada documento (chave no cache) -> nome exato do arquivo no bucket.
// Se voce subir os .docx com nomes diferentes, ajusta aqui.
//
// "palavras" sao os termos que indicam que a pergunta e daquele modulo. Os
// 5 documentos somados dao ~800 mil tokens, mais que o triplo do teto de 250
// mil por minuto do nivel gratuito — mandar todos era o motivo de TODA
// mensagem ser recusada. Entao so o modulo relevante a pergunta e enviado.
const DOCUMENTOS = [
  {
    nome: "financeiro",
    arquivo: "SISTEMA ERP - FINANCEIRO.docx",
    palavras: ["financeiro", "titulo", "titulos", "boleto", "banco", "bancaria", "pagar", "receber", "pagamento", "recebimento", "juros", "multa", "caixa", "conciliacao", "baixa", "cobranca", "remessa", "retorno", "cheque", "duplicata", "fluxo"]
  },
  {
    nome: "materiais",
    arquivo: "SISTEMA ERP - MATERIAIS.docx",
    palavras: ["material", "materiais", "estoque", "produto", "produtos", "inventario", "saldo", "deposito", "almoxarifado", "movimentacao", "transferencia", "lote", "unidade", "embalagem", "custo", "curva"]
  },
  {
    nome: "compras",
    arquivo: "SISTEMA ERP - COMPRAS.docx",
    palavras: ["compra", "compras", "fornecedor", "fornecedores", "cotacao", "cotacoes", "ordem de compra", "requisicao", "entrada", "recebimento de mercadoria", "nota de entrada", "xml", "importacao"]
  },
  {
    nome: "vendas",
    arquivo: "SISTEMA ERP - VENDAS.docx",
    palavras: ["venda", "vendas", "pedido", "pedidos", "cliente", "clientes", "orcamento", "faturamento", "faturar", "nota fiscal", "nfe", "nfce", "cupom", "representante", "comissao", "tabela de preco", "desconto", "entrega", "transportadora", "romaneio", "mapa"]
  },
  {
    nome: "configuracoes",
    arquivo: "SISTEMA ERP - CONFIGURACOES.docx",
    palavras: ["configuracao", "configuracoes", "configurador", "parametro", "parametros", "cadastro", "cadastrar", "usuario", "usuarios", "permissao", "permissoes", "acesso", "empresa", "unidade", "filial", "pessoa", "pessoas", "grupo", "menu", "relatorio"]
  }
];

// Quantos documentos vao junto com a pergunta. 1 de proposito: cada um tem
// ~130 a 250 mil tokens, e dois ja estourariam o teto de 250 mil por minuto.
const MAX_DOCUMENTOS_POR_PERGUNTA = 1;

// Escolhe o(s) documento(s) do modulo que a pergunta parece ser. Usa a mesma
// normalizacao sem acento do resto do projeto, entao "configuração" casa com
// "configuracao". Se nada casar, cai no primeiro da lista — melhor responder
// com o modulo errado (e o Jarvis avisar) do que nao responder nada.
function selecionarDocumentos(pergunta) {
  const texto = normalizarTextoBusca(pergunta);

  const pontuados = DOCUMENTOS.map((doc) => {
    const pontuacao = doc.palavras.reduce(
      (soma, palavra) => (texto.includes(palavra) ? soma + 1 : soma),
      0
    );
    return { doc, pontuacao };
  });

  const comMatch = pontuados
    .filter((item) => item.pontuacao > 0)
    .sort((a, b) => b.pontuacao - a.pontuacao);

  const escolhidos = comMatch.length > 0
    ? comMatch.slice(0, MAX_DOCUMENTOS_POR_PERGUNTA).map((item) => item.doc)
    : [DOCUMENTOS[0]];

  console.log(`[chat] Modulo(s) selecionado(s) para esta pergunta: ${escolhidos.map((d) => d.nome).join(", ")}${comMatch.length === 0 ? " (nenhuma palavra-chave casou — usando o padrao)" : ""}.`);

  return escolhidos;
}

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// --- Soluções cadastradas no site (tabela "solucoes" do Supabase) ---
// Mesmo criterio de relevancia usado na busca da pagina Inicio
// (public/js/pages/inicio.js), pra so mandar pro Gemini as soluções que tem
// a ver com a pergunta em vez do banco inteiro (economiza tokens).

const TAMANHO_MINIMO_TERMO_BUSCA = 3;
const MAX_SOLUCOES_NO_CONTEXTO = 5;

function normalizarTextoBusca(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function pontuarSolucaoNaBusca(solucao, termos, termoCompleto) {
  const nome = normalizarTextoBusca(solucao.titulo);
  const descricao = normalizarTextoBusca(solucao.erro);
  const outros = normalizarTextoBusca([
    solucao.categoria, solucao.modulo,
    ...(Array.isArray(solucao.sintomas) ? solucao.sintomas : []),
    ...(Array.isArray(solucao.tabelas_campos) ? solucao.tabelas_campos : [])
  ].filter(Boolean).join(" "));

  let pontuacao = 0;
  termos.forEach((termo) => {
    if (nome.includes(termo)) pontuacao += 3;
    if (descricao.includes(termo)) pontuacao += 2;
    if (outros.includes(termo)) pontuacao += 1;
  });

  if (pontuacao > 0) {
    if (nome === termoCompleto) pontuacao += 1000;
    else if (nome.startsWith(termoCompleto)) pontuacao += 500;
    else if (nome.includes(termoCompleto)) pontuacao += 100;
  }

  return pontuacao;
}

function formatarSolucaoParaContexto(s) {
  const linhas = [`### ${s.titulo || "Sem título"} (${s.tipo || "tipo não informado"})`];

  if (s.categoria) linhas.push(`Categoria: ${s.categoria}`);
  if (s.modulo) linhas.push(`Caminho/Módulo no ERP: ${s.modulo}`);
  if (s.criticidade) linhas.push(`Prioridade: ${s.criticidade}`);
  if (s.codigo_erro) linhas.push(`Código do erro: ${s.codigo_erro}`);
  if (s.erro) linhas.push(`Descrição: ${s.erro}`);
  if (Array.isArray(s.sintomas) && s.sintomas.length) linhas.push(`Sintomas/palavras-chave: ${s.sintomas.join(", ")}`);
  if (Array.isArray(s.tabelas_campos) && s.tabelas_campos.length) linhas.push(`Tabelas/campos relacionados: ${s.tabelas_campos.join(", ")}`);
  if (s.codigo) linhas.push(`Código/Script:\n${s.codigo}`);

  if (Array.isArray(s.parametros) && s.parametros.length) {
    linhas.push("Parâmetros:");
    s.parametros.forEach((p) => linhas.push(`- ${p.nome}: ${p.descricao}`));
  }

  if (Array.isArray(s.passos) && s.passos.length) {
    linhas.push("Passo a passo cadastrado:");
    [...s.passos]
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .forEach((p) => linhas.push(`${p.ordem}. ${p.texto}`));
  }

  if (s.resultado_esperado) linhas.push(`Resultado esperado: ${s.resultado_esperado}`);
  if (s.autor) linhas.push(`Cadastrado por: ${s.autor}`);

  return linhas.join("\n");
}

// Busca no Supabase as soluções cadastradas com maior relevância pra
// pergunta atual (mesma pontuação da busca da pagina Inicio) e devolve as
// N mais relevantes ja formatadas em texto, prontas pra entrar no prompt.
async function buscarSolucoesRelevantes(supabase, pergunta) {
  if (!pergunta) return [];

  const termoNormalizado = normalizarTextoBusca(pergunta);
  const termos = termoNormalizado.split(/\s+/).filter((t) => t.length >= TAMANHO_MINIMO_TERMO_BUSCA);
  if (!termos.length) return [];

  const { data, error } = await supabase
    .from("solucoes")
    .select("titulo,tipo,categoria,modulo,criticidade,codigo_erro,erro,sintomas,tabelas_campos,codigo,parametros,passos,resultado_esperado,autor");

  if (error || !data) return [];

  return data
    .map((solucao) => ({ solucao, pontuacao: pontuarSolucaoNaBusca(solucao, termos, termoNormalizado) }))
    .filter((item) => item.pontuacao > 0)
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, MAX_SOLUCOES_NO_CONTEXTO)
    .map((item) => formatarSolucaoParaContexto(item.solucao));
}

// Traduz o erro tecnico (jogado no log da Vercel, com todo o detalhe) numa
// mensagem curta e util pro usuario ver direto no chat, sem precisar abrir
// o painel da Vercel pra entender o que aconteceu.
function mensagemErroAmigavel(erro) {
  const status = erro?.status;

  if (status === 429) {
    return "A cota gratuita do Gemini acabou por agora — tentei todos os modelos disponíveis e todos recusaram. Costuma liberar no dia seguinte.";
  }
  if (status === 503) {
    return "Todos os modelos do Gemini que eu tento estão sem capacidade neste momento (limitação do lado do Google, no plano gratuito). Tenta de novo em alguns minutos.";
  }
  if (typeof status === "number" && status >= 500) {
    return `O servidor do Gemini teve um problema (erro ${status}) em todos os modelos que tentei. Tenta de novo em instantes.`;
  }
  if (typeof erro?.message === "string" && erro.message.startsWith("Falha ao baixar")) {
    return "Não consegui acessar um dos documentos do ERP agora. Tenta de novo em instantes.";
  }

  return "Não foi possível responder agora.";
}

// O motivo tecnico cru (o que o Google respondeu de fato), cortado pra caber
// na tela. Vai junto da mensagem amigavel pra dar pra diagnosticar sem abrir
// o painel da Vercel.
function detalheTecnico(erro) {
  const bruto = typeof erro?.message === "string" ? erro.message : String(erro ?? "");
  const limpo = bruto.replace(/\s+/g, " ").trim();
  return limpo.length > 300 ? `${limpo.slice(0, 300)}...` : limpo;
}

// Sobrecarga (503), cota estourada (429), modelo inexistente (404) e erros
// internos (5xx) sao problemas DAQUELE modelo — vale tentar outro. Ja um 400
// (requisicao malformada) ou 401/403 (chave) falharia igual em qualquer
// modelo, entao nesses casos nao adianta insistir.
function valeTentarOutroModelo(erro) {
  const status = erro?.status;
  if (status === 429 || status === 404) return true;
  return typeof status === "number" && status >= 500;
}

// Percorre MODELOS em ordem e devolve a resposta do primeiro que aceitar.
// Sem espera entre as tentativas de proposito: o Google recusa na hora
// quando esta sem capacidade, entao esperar so atrasa a resposta de erro
// sem aumentar a chance de sucesso (ja testado — insistir no mesmo modelo
// falhava as 3 vezes).
// Mede quantos tokens de entrada a requisicao realmente tem. O limite do
// nivel gratuito e por MINUTO (250 mil), entao se uma unica mensagem ja
// chegar perto disso ela nunca passa — e o Google responde 429 ou 503 sem
// deixar claro que o problema e tamanho, nao instabilidade.
// Best-effort: se a contagem falhar, segue o fluxo normalmente.
async function medirTokensEntrada(model, historicoChat, partes) {
  try {
    const { totalTokens } = await model.countTokens({
      contents: [...historicoChat, { role: "user", parts: partes }]
    });
    return totalTokens;
  } catch {
    return null;
  }
}

async function enviarComFallback(genAI, historicoChat, partes) {
  let ultimoErro = null;

  for (const modelo of MODELOS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelo,
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 8192
        }
      });

      if (modelo === MODELOS[0]) {
        const tokens = await medirTokensEntrada(model, historicoChat, partes);
        if (tokens !== null) {
          console.log(`[chat] Tokens de entrada desta mensagem: ${tokens} (limite gratuito: 250000 por minuto).`);
        }
      }

      const chat = model.startChat({ history: historicoChat });
      const resultado = await chat.sendMessage(partes);

      if (modelo !== MODELOS[0]) {
        console.warn(`Chat respondido pelo modelo alternativo "${modelo}" — o principal estava indisponivel.`);
      }
      return resultado;
    } catch (erro) {
      ultimoErro = erro;
      if (!valeTentarOutroModelo(erro)) throw erro;
      console.warn(`Modelo "${modelo}" indisponivel (status ${erro?.status}); tentando o proximo.`);
    }
  }

  throw ultimoErro;
}

async function extrairTextoDocx(buffer) {
  const resultado = await mammoth.extractRawText({ buffer });
  return resultado.value;
}

// Devolve { uri, mimeType } prontos pra usar no generateContent. Reusa o
// cache do Supabase se ainda for valido; senao baixa, converte e reenvia.
async function obterArquivoGemini(fileManager, supabase, doc) {
  const { data: cache } = await supabase
    .from("chat_arquivos")
    .select("*")
    .eq("nome", doc.nome)
    .maybeSingle();

  const margemSeguranca = 5 * 60 * 1000; // 5 min de folga antes de considerar vencido
  if (cache && new Date(cache.expira_em).getTime() > Date.now() + margemSeguranca) {
    return { uri: cache.gemini_uri, mimeType: "text/plain" };
  }

  const { data: arquivo, error: erroDownload } = await supabase.storage
    .from(BUCKET)
    .download(doc.arquivo);
  if (erroDownload) {
    throw new Error(`Falha ao baixar "${doc.arquivo}" do bucket ${BUCKET}: ${erroDownload.message}`);
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const texto = await extrairTextoDocx(buffer);
  console.log(`[chat] Documento "${doc.nome}": ${texto.length} caracteres extraidos (~${Math.round(texto.length / 4)} tokens).`);

  const caminhoTemp = join(tmpdir(), `${doc.nome}.txt`);
  await writeFile(caminhoTemp, texto, "utf8");

  const uploadResult = await fileManager.uploadFile(caminhoTemp, {
    mimeType: "text/plain",
    displayName: doc.nome
  });

  // Guarda com um pouco menos que 48h reais, pra nunca tentar usar uma
  // referencia que acabou de vencer.
  const expiraEm = new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString();

  await supabase.from("chat_arquivos").upsert(
    {
      nome: doc.nome,
      gemini_uri: uploadResult.file.uri,
      expira_em: expiraEm,
      atualizado_em: new Date().toISOString()
    },
    { onConflict: "nome" }
  );

  return { uri: uploadResult.file.uri, mimeType: "text/plain" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido." });
    return;
  }

  if (!GEMINI_API_KEY || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({ erro: "Chat ainda não configurado no servidor (faltam variáveis de ambiente)." });
    return;
  }

  const pergunta = (req.body?.pergunta || "").trim();

  // Aceita "imagens" (varias, formato atual) e, por compatibilidade,
  // "imagem" no singular (formato antigo do front). Limita a 3.
  const imagensBrutas = Array.isArray(req.body?.imagens)
    ? req.body.imagens
    : (req.body?.imagem ? [req.body.imagem] : []);
  const imagens = imagensBrutas.filter((img) => img?.data && img?.mimeType).slice(0, 3);
  const temImagem = imagens.length > 0;

  if (!pergunta && !temImagem) {
    res.status(400).json({ erro: "Envie uma pergunta ou uma imagem." });
    return;
  }

  // Historico enviado pelo navegador (perguntas/respostas anteriores dessa
  // mesma conversa), pra o Jarvis lembrar do que ja foi falado.
  //
  // Limitado com folga de proposito: cada resposta antiga pode ter milhares
  // de tokens, e o historico inteiro e REENVIADO em toda mensagem nova. Com
  // 12 trocas completas a conversa ia inchando ate a requisicao estourar o
  // teto de tokens por minuto do nivel gratuito — o que o Google recusa com
  // 429 ou 503, sem dizer que o motivo e tamanho. 4 trocas, com as respostas
  // resumidas, dao contexto suficiente pra perguntas de continuidade
  // ("e o segundo passo?") sem inflar a requisicao.
  const LIMITE_TROCAS = 4;
  const LIMITE_CARACTERES_RESPOSTA = 1200;

  const historico = Array.isArray(req.body?.historico)
    ? req.body.historico
        .filter((t) => t && typeof t.pergunta === "string" && typeof t.resposta === "string")
        .slice(-LIMITE_TROCAS)
        .map((t) => ({
          pergunta: t.pergunta,
          resposta: t.resposta.length > LIMITE_CARACTERES_RESPOSTA
            ? `${t.resposta.slice(0, LIMITE_CARACTERES_RESPOSTA)}...`
            : t.resposta
        }))
    : [];

  try {
    const supabase = supabaseAdmin();
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);

    const documentosEscolhidos = selecionarDocumentos(pergunta);

    const [arquivos, solucoesRelevantes] = await Promise.all([
      Promise.all(documentosEscolhidos.map((doc) => obterArquivoGemini(fileManager, supabase, doc))),
      buscarSolucoesRelevantes(supabase, pergunta)
    ]);

    const partesArquivos = arquivos.map((a) => ({
      fileData: { mimeType: a.mimeType, fileUri: a.uri }
    }));

    const partesImagem = imagens.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data }
    }));

    const nomesModulos = documentosEscolhidos.map((d) => d.nome).join(", ");

    const instrucaoSistema = "Você é o Jarvis, assistente de suporte da Base de Soluções da Gasômetro"
      + " Madeiras, especialista no ERP NL Gestão."
      + ` Em anexo está a documentação do módulo: ${nomesModulos}. Ela foi escolhida`
      + " automaticamente pelas palavras da pergunta, entre os 5 módulos existentes"
      + " (Financeiro, Materiais, Compras, Vendas, Configurações)."
      + " Antes de responder, revise com atenção o conteúdo completo do documento anexado —"
      + " não se baseie só no início dele, procure no documento todo, inclusive quando a"
      + " resposta exigir cruzar informação de mais de uma seção."
      + " Se ficar claro que a resposta pertence a um módulo diferente do que foi anexado,"
      + " diga isso ao usuário e peça que ele cite o módulo na pergunta (ex.: \"como faço X"
      + " em Compras?\"), em vez de tentar adivinhar."
      + " Responda em português, com a resposta mais completa e precisa possível: inclua o"
      + " caminho de navegação exato, números de página/objeto, nomes de campos e o passo a"
      + " passo, sempre que essas informações existirem nos documentos. Se houver mais de uma"
      + " forma de fazer o que foi perguntado, liste todas. Não seja superficial nem genérico."
      + " Se a resposta não estiver nos documentos mesmo depois dessa revisão cuidadosa, diga"
      + " claramente que não encontrou essa informação, em vez de inventar."
      + " Essa é uma conversa contínua — leve em conta as perguntas e respostas anteriores pra"
      +" entender o contexto (ex.: \"e o segundo passo?\", \"detalha mais isso\"), sem esquecer"
      + " do que já foi dito antes."
      + " Quando a pergunta atual vier acompanhada de soluções já cadastradas na Base de Soluções"
      + " do site (marcadas como \"SOLUÇÕES JÁ CADASTRADAS...\"), priorize essa informação — foi"
      + " escrita por alguém da equipe descrevendo um caso real, então normalmente é mais precisa"
      + " e específica que os documentos gerais do ERP. Cite o título da solução usada.";

    const historicoChat = [
      { role: "user", parts: [...partesArquivos, { text: instrucaoSistema }] },
      { role: "model", parts: [{ text: `Entendido. Revisei a documentação do módulo ${nomesModulos} e vou manter o contexto da nossa conversa. Pode perguntar.` }] },
      ...historico.flatMap((t) => [
        { role: "user", parts: [{ text: t.pergunta }] },
        { role: "model", parts: [{ text: t.resposta }] }
      ])
    ];

    const partesSolucoes = solucoesRelevantes.length
      ? [{ text: "=== SOLUÇÕES JÁ CADASTRADAS NO SITE RELACIONADAS A ESSA PERGUNTA ===\n\n" + solucoesRelevantes.join("\n\n---\n\n") }]
      : [];

    const resultado = await enviarComFallback(genAI, historicoChat, [
      ...partesImagem,
      ...partesSolucoes,
      {
        text: (temImagem
          ? `O usuário anexou ${imagens.length > 1 ? `${imagens.length} imagens` : "uma imagem"} (podem ser prints de tela, erros ou tabelas) — analise cada uma com atenção e cruze com os documentos antes de responder.\n\n`
          : "")
          + (pergunta || "Descreva o que você vê na(s) imagem(ns) anexada(s) e ajude com base nela(s).")
      }
    ]);

    const resposta = resultado.response.text();
    res.status(200).json({ resposta });
  } catch (erro) {
    console.error("Erro no chat:", erro);
    res.status(500).json({
      erro: mensagemErroAmigavel(erro),
      detalhe: detalheTecnico(erro)
    });
  }
}
