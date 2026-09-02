// api/chat.js — endpoint do chat com IA (function serverless da Vercel, Node.js).
//
// Fluxo:
//   1. Pra cada um dos 5 documentos do ERP, confere se ja tem uma referencia
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
const MODELO = "gemini-3.6-flash";

// Nome de cada documento (chave no cache) -> nome exato do arquivo no bucket.
// Se voce subir os .docx com nomes diferentes, ajusta aqui.
const DOCUMENTOS = [
  { nome: "financeiro", arquivo: "SISTEMA ERP - FINANCEIRO.docx" },
  { nome: "materiais", arquivo: "SISTEMA ERP - MATERIAIS.docx" },
  { nome: "compras", arquivo: "SISTEMA ERP - COMPRAS.docx" },
  { nome: "vendas", arquivo: "SISTEMA ERP - VENDAS.docx" },
  { nome: "configuracoes", arquivo: "SISTEMA ERP - CONFIGURACOES.docx" }
];

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
    return "O limite de uso gratuito do Gemini foi atingido nesse minuto. Espera um pouco e tenta de novo.";
  }
  if (status === 503) {
    return "O Gemini está sobrecarregado no momento (instabilidade do lado do Google, não é nada daqui). Tenta de novo em alguns segundos.";
  }
  if (typeof status === "number" && status >= 500) {
    return `O servidor do Gemini teve um problema (erro ${status}). Tenta de novo em instantes.`;
  }
  if (typeof erro?.message === "string" && erro.message.startsWith("Falha ao baixar")) {
    return "Não consegui acessar um dos documentos do ERP agora. Tenta de novo em instantes.";
  }

  return "Não foi possível responder agora.";
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
  const imagem = req.body?.imagem;
  const temImagem = imagem?.data && imagem?.mimeType;

  if (!pergunta && !temImagem) {
    res.status(400).json({ erro: "Envie uma pergunta ou uma imagem." });
    return;
  }

  // Historico enviado pelo navegador (perguntas/respostas anteriores dessa
  // mesma conversa), pra o COLA lembrar do que ja foi falado. Limita a 12
  // trocas mais recentes pra nao deixar a requisicao gigante.
  const historico = Array.isArray(req.body?.historico)
    ? req.body.historico
        .filter((t) => t && typeof t.pergunta === "string" && typeof t.resposta === "string")
        .slice(-12)
    : [];

  try {
    const supabase = supabaseAdmin();
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);

    const [arquivos, solucoesRelevantes] = await Promise.all([
      Promise.all(DOCUMENTOS.map((doc) => obterArquivoGemini(fileManager, supabase, doc))),
      buscarSolucoesRelevantes(supabase, pergunta)
    ]);

    const model = genAI.getGenerativeModel({
      model: MODELO,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 8192
      }
    });

    const partesArquivos = arquivos.map((a) => ({
      fileData: { mimeType: a.mimeType, fileUri: a.uri }
    }));

    const partesImagem = temImagem
      ? [{ inlineData: { mimeType: imagem.mimeType, data: imagem.data } }]
      : [];

    const instrucaoSistema = "Você é o COLA, assistente de suporte da Base de Soluções da Gasômetro"
      + " Madeiras, especialista no ERP NL Gestão."
      + " Antes de responder, revise com atenção o conteúdo completo dos 5 documentos anexados"
      + " (Financeiro, Materiais, Compras, Vendas, Configurações) — não se baseie só no início"
      + " de cada um, procure em todos, inclusive quando a resposta exigir cruzar informação"
      + " de mais de um documento ou de mais de uma seção do mesmo documento."
      + " Responda em português, com a resposta mais completa e precisa possível: inclua o"
      + " caminho de navegação exato, números de página/objeto, nomes de campos e o passo a"
      + " passo, sempre que essas informações existirem nos documentos. Se houver mais de uma"
      + " forma de fazer o que foi perguntado, liste todas. Não seja superficial nem genérico."
      + " Se a resposta não estiver nos documentos mesmo depois dessa revisão cuidadosa, diga"
      + " claramente que não encontrou essa informação, em vez de inventar."
      + " Essa é uma conversa contínua — leve em conta as perguntas e respostas anteriores pra"
      + " entender o contexto (ex.: \"e o segundo passo?\", \"detalha mais isso\"), sem esquecer"
      + " do que já foi dito antes."
      + " Quando a pergunta atual vier acompanhada de soluções já cadastradas na Base de Soluções"
      + " do site (marcadas como \"SOLUÇÕES JÁ CADASTRADAS...\"), priorize essa informação — foi"
      + " escrita por alguém da equipe descrevendo um caso real, então normalmente é mais precisa"
      + " e específica que os documentos gerais do ERP. Cite o título da solução usada.";

    const chat = model.startChat({
      history: [
        { role: "user", parts: [...partesArquivos, { text: instrucaoSistema }] },
        { role: "model", parts: [{ text: "Entendido. Revisei os 5 documentos do ERP e vou manter o contexto da nossa conversa. Pode perguntar." }] },
        ...historico.flatMap((t) => [
          { role: "user", parts: [{ text: t.pergunta }] },
          { role: "model", parts: [{ text: t.resposta }] }
        ])
      ]
    });

    const partesSolucoes = solucoesRelevantes.length
      ? [{ text: "=== SOLUÇÕES JÁ CADASTRADAS NO SITE RELACIONADAS A ESSA PERGUNTA ===\n\n" + solucoesRelevantes.join("\n\n---\n\n") }]
      : [];

    const resultado = await chat.sendMessage([
      ...partesImagem,
      ...partesSolucoes,
      {
        text: (temImagem ? "O usuário anexou uma imagem (pode ser um print de tela, erro ou tabela) — analise-a com atenção e cruze com os documentos antes de responder.\n\n" : "")
          + (pergunta || "Descreva o que você vê na imagem anexada e ajude com base nela.")
      }
    ]);

    const resposta = resultado.response.text();
    res.status(200).json({ resposta });
  } catch (erro) {
    console.error("Erro no chat:", erro);
    res.status(500).json({ erro: mensagemErroAmigavel(erro) });
  }
}
