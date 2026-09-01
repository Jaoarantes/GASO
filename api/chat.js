// api/chat.js — endpoint do chat com IA (function serverless da Vercel, Node.js).
//
// Fluxo:
//   1. Pra cada um dos 5 documentos do ERP, confere se ja tem uma referencia
//      valida no Supabase (tabela chat_arquivos). Se nao tiver (ou tiver
//      vencido), baixa o .docx do Supabase Storage, extrai o texto (mammoth)
//      e sobe esse texto pro Gemini File API — guarda a referencia devolvida
//      (expira em ~48h) pra reusar nas proximas perguntas, sem reprocessar
//      tudo de novo.
//   2. Chama o Gemini (generateContent) com os 5 arquivos referenciados +
//      a pergunta do usuario, pedindo pra responder so com base neles.
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

  try {
    const supabase = supabaseAdmin();
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);

    const arquivos = await Promise.all(
      DOCUMENTOS.map((doc) => obterArquivoGemini(fileManager, supabase, doc))
    );

    const model = genAI.getGenerativeModel({ model: MODELO });

    const partesArquivos = arquivos.map((a) => ({
      fileData: { mimeType: a.mimeType, fileUri: a.uri }
    }));

    const partesImagem = temImagem
      ? [{ inlineData: { mimeType: imagem.mimeType, data: imagem.data } }]
      : [];

    const resultado = await model.generateContent([
      ...partesArquivos,
      ...partesImagem,
      {
        text: "Você é um assistente de suporte da Base de Soluções da Gasômetro Madeiras."
          + " Responda em português, de forma direta, com base apenas nos documentos anexados"
          + " (páginas do ERP: Financeiro, Materiais, Compras, Vendas, Configurações)."
          + " Se a resposta não estiver nos documentos, diga claramente que não encontrou"
          + " essa informação, em vez de inventar."
          + (temImagem ? " O usuário também anexou uma imagem (pode ser um print de tela, erro ou tabela) — analise-a e leve em conta na resposta." : "")
          + "\n\nPergunta: " + (pergunta || "Descreva o que você vê na imagem anexada e ajude com base nela.")
      }
    ]);

    const resposta = resultado.response.text();
    res.status(200).json({ resposta });
  } catch (erro) {
    console.error("Erro no chat:", erro);
    res.status(500).json({ erro: "Não foi possível responder agora." });
  }
}
