import { TABELAS_API_URL, TABELAS_API_KEY } from "../config/tabelas-api-config.js";
import { supabase } from "../config/supabase-config.js";

function configurada() {
  return Boolean(TABELAS_API_URL && TABELAS_API_KEY);
}

function urlDoEditor() {
  return TABELAS_API_URL.replace(/tabelas\.php$/, "sql-editor.php");
}

const editorArea = document.getElementById("sql-editor-area");
const resultadoEl = document.getElementById("sql-resultado");
const resultadoVazioEl = document.getElementById("sql-resultado-vazio");
const executarBtn = document.getElementById("sql-toolbar-executar-btn");
const scriptBtn = document.getElementById("sql-toolbar-script-btn");

const editor = window.CodeMirror.fromTextArea(editorArea, {
  mode: "text/x-sql",
  lineNumbers: true,
  lineWrapping: false
});

function mostrarMensagemResultado(texto, tipo) {
  resultadoEl.innerHTML = "";
  const p = document.createElement("p");
  p.className = tipo === "erro" ? "sql-resultado-erro" : "sql-resultado-status";
  p.textContent = texto;
  resultadoEl.appendChild(p);
}

function mostrarTabelaResultado(colunas, linhas) {
  resultadoEl.innerHTML = "";

  if (linhas.length === 0) {
    mostrarMensagemResultado("0 linhas retornadas.", "status");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "colunas-tabela-wrapper";

  const tabela = document.createElement("table");
  tabela.className = "colunas-tabela";

  const thead = document.createElement("thead");
  const trCabecalho = document.createElement("tr");
  colunas.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    trCabecalho.appendChild(th);
  });
  thead.appendChild(trCabecalho);

  const tbody = document.createElement("tbody");
  linhas.forEach((linha) => {
    const tr = document.createElement("tr");
    colunas.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = linha[c] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  tabela.appendChild(thead);
  tabela.appendChild(tbody);
  wrapper.appendChild(tabela);

  resultadoEl.appendChild(wrapper);
}

async function executarNoBackend(sql) {
  const resposta = await fetch(urlDoEditor(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": TABELAS_API_KEY
    },
    body: JSON.stringify({ sql })
  });

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(dados.erro || `Resposta ${resposta.status}`);
  }

  return dados;
}

async function executar(sql) {
  if (!configurada()) {
    mostrarMensagemResultado("Endpoint de busca de tabelas ainda não configurado (public/js/config/tabelas-api-config.js).", "erro");
    return;
  }

  executarBtn.disabled = true;
  mostrarMensagemResultado("Executando...", "status");

  try {
    const dados = await executarNoBackend(sql);
    if (dados.tipo === "select") {
      mostrarTabelaResultado(dados.colunas || [], dados.linhas || []);
    } else {
      const n = dados.linhasAfetadas || 0;
      mostrarMensagemResultado(`Comando executado com sucesso — ${n} linha(s) afetada(s).`, "status");
    }
  } catch (erro) {
    console.error("Erro ao executar SQL:", erro);
    mostrarMensagemResultado(erro.message || "Não foi possível executar o comando.", "erro");
  } finally {
    executarBtn.disabled = false;
  }
}

// ── Confirmação para comandos não-SELECT ────────────────────────────────
const confirmarOverlay = document.getElementById("confirmar-overlay");
const confirmarMensagemEl = document.getElementById("confirmar-mensagem");
const confirmarPreviewEl = document.getElementById("confirmar-preview");
const confirmarCancelarBtn = document.getElementById("confirmar-cancelar-btn");
const confirmarExecutarBtn = document.getElementById("confirmar-executar-btn");

let sqlPendente = null;

function ehSelect(sql) {
  return /^\s*select\b/i.test(sql);
}

function abrirConfirmacao(sql) {
  sqlPendente = sql;
  confirmarMensagemEl.textContent = "Isso vai executar este comando no banco de produção. Essa ação não pode ser desfeita.";
  confirmarPreviewEl.textContent = sql;
  confirmarOverlay.hidden = false;
}

function fecharConfirmacao() {
  confirmarOverlay.hidden = true;
  sqlPendente = null;
}

confirmarCancelarBtn.addEventListener("click", fecharConfirmacao);
confirmarOverlay.addEventListener("click", (event) => {
  if (event.target === confirmarOverlay) fecharConfirmacao();
});
confirmarExecutarBtn.addEventListener("click", () => {
  const sql = sqlPendente;
  fecharConfirmacao();
  if (sql) executar(sql);
});

executarBtn.addEventListener("click", () => {
  const sql = editor.getValue().trim();
  if (!sql) {
    mostrarMensagemResultado("Escreva um comando SQL antes de executar.", "erro");
    return;
  }
  if (ehSelect(sql)) {
    executar(sql);
  } else {
    abrirConfirmacao(sql);
  }
});

// ── Painel "SQL Script" ──────────────────────────────────────────────────
const scriptPainelOverlay = document.getElementById("script-painel-overlay");
const scriptPainelBusca = document.getElementById("script-painel-busca");
const scriptPainelLista = document.getElementById("script-painel-lista");
const scriptPainelFecharBtn = document.getElementById("script-painel-fechar-btn");

let scriptsCarregados = [];

function renderizarScripts(scripts) {
  scriptPainelLista.innerHTML = "";

  if (scripts.length === 0) {
    scriptPainelLista.innerHTML = `<p class="solucoes-vazio">Nenhum script encontrado.</p>`;
    return;
  }

  scripts.forEach((script) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "script-painel-item";

    const titulo = document.createElement("span");
    titulo.className = "script-painel-item__titulo";
    titulo.textContent = script.titulo || "Sem título";

    const descricao = document.createElement("span");
    descricao.className = "script-painel-item__descricao";
    descricao.textContent = script.erro || "";

    item.appendChild(titulo);
    item.appendChild(descricao);

    item.addEventListener("click", () => {
      editor.setValue(script.codigo || "");
      fecharScriptPainel();
    });
    scriptPainelLista.appendChild(item);
  });
}

async function carregarScripts() {
  scriptPainelLista.innerHTML = `<p class="solucoes-vazio">Carregando...</p>`;
  const { data, error } = await supabase
    .from("solucoes")
    .select("id,titulo,erro,codigo")
    .eq("tipo", "script")
    .order("titulo");

  if (error) {
    console.error("Erro ao carregar scripts salvos:", error);
    scriptPainelLista.innerHTML = `<p class="solucoes-vazio">Não foi possível carregar os scripts salvos.</p>`;
    return;
  }

  scriptsCarregados = data || [];
  renderizarScripts(scriptsCarregados);
}

function abrirScriptPainel() {
  scriptPainelOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  scriptPainelBusca.value = "";
  carregarScripts();
}

function fecharScriptPainel() {
  scriptPainelOverlay.hidden = true;
  document.body.style.overflow = "";
}

scriptBtn.addEventListener("click", abrirScriptPainel);
scriptPainelFecharBtn.addEventListener("click", fecharScriptPainel);
scriptPainelOverlay.addEventListener("click", (event) => {
  if (event.target === scriptPainelOverlay) fecharScriptPainel();
});

scriptPainelBusca.addEventListener("input", () => {
  const termo = scriptPainelBusca.value.trim().toLowerCase();
  const filtrados = termo
    ? scriptsCarregados.filter((s) => (s.titulo || "").toLowerCase().includes(termo))
    : scriptsCarregados;
  renderizarScripts(filtrados);
});
