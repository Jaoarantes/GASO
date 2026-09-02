import { TABELAS_API_URL, TABELAS_API_KEY } from "../config/tabelas-api-config.js";
import { supabase } from "../config/supabase-config.js";
import { exportarExcel, exportarCsv, exportarSql } from "./novo-sql-export.js";

const ICONE_CADEADO_FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const ICONE_CADEADO_ABERTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
const ICONE_PROXIMA_PAGINA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const ICONE_ULTIMA_PAGINA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/></svg>';
const ICONE_POST_CHANGES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const ICONE_EXPORT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/></svg>';
const ICONE_EXPANDIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const ICONE_RECOLHER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v4a2 2 0 0 1-2 2H3"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/><path d="M9 21v-4a2 2 0 0 0-2-2H3"/><path d="M15 21v-4a2 2 0 0 1 2-2h4"/></svg>';
const ICONE_LAPIS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

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

let estadoResultado = null; // { sql, colunas, tiposColuna, linhas, pagina, temProximaPagina, editavel, tabela }
let controladorMenuExport = null; // AbortController do listener global de fechar o menu de export

let modoEdicao = false;
let pendenciasEdicao = new Map(); // chave: `${rowid}::${coluna}` -> { rowid, coluna, valorNovo, valorAntigo }

function chavePendencia(rowid, coluna) {
  return `${rowid}::${coluna}`;
}

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

function criarAreaErroPostChanges() {
  const el = document.createElement("p");
  el.className = "sql-resultado-erro sql-resultado-erro-post";
  el.id = "resultado-post-erro";
  el.hidden = true;
  return el;
}

function mostrarErroPostChanges(texto) {
  const el = document.getElementById("resultado-post-erro");
  if (!el) return;
  if (texto) {
    el.textContent = texto;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function criarBarraFerramentas() {
  const barra = document.createElement("div");
  barra.className = "sql-resultado-barra";

  const cadeadoBtn = document.createElement("button");
  cadeadoBtn.type = "button";
  cadeadoBtn.className = "painel__icone-btn";
  cadeadoBtn.id = "resultado-cadeado-btn";
  cadeadoBtn.innerHTML = ICONE_CADEADO_FECHADO;
  if (!estadoResultado.editavel) {
    cadeadoBtn.disabled = true;
    cadeadoBtn.title = "Edição disponível apenas para SELECT de uma única tabela.";
  } else {
    cadeadoBtn.title = modoEdicao ? "Desabilitar edição" : "Habilitar edição";
    cadeadoBtn.innerHTML = modoEdicao ? ICONE_CADEADO_ABERTO : ICONE_CADEADO_FECHADO;
  }

  const proximaBtn = document.createElement("button");
  proximaBtn.type = "button";
  proximaBtn.className = "painel__icone-btn";
  proximaBtn.id = "resultado-proxima-btn";
  proximaBtn.title = "Próxima página";
  proximaBtn.innerHTML = ICONE_PROXIMA_PAGINA;
  proximaBtn.disabled = !estadoResultado.temProximaPagina;

  const ultimaBtn = document.createElement("button");
  ultimaBtn.type = "button";
  ultimaBtn.className = "painel__icone-btn";
  ultimaBtn.id = "resultado-ultima-btn";
  ultimaBtn.title = "Última página";
  ultimaBtn.innerHTML = ICONE_ULTIMA_PAGINA;

  const postBtn = document.createElement("button");
  postBtn.type = "button";
  postBtn.className = "painel__icone-btn";
  postBtn.id = "resultado-post-btn";
  postBtn.title = "Gravar alterações";
  postBtn.innerHTML = ICONE_POST_CHANGES;

  const exportWrapper = document.createElement("div");
  exportWrapper.className = "sql-resultado-export-wrapper";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "painel__icone-btn";
  exportBtn.id = "resultado-export-btn";
  exportBtn.title = "Exportar";
  exportBtn.innerHTML = ICONE_EXPORT;

  const exportMenu = document.createElement("div");
  exportMenu.className = "sql-resultado-export-menu";
  exportMenu.hidden = true;

  const itemExcel = document.createElement("button");
  itemExcel.type = "button";
  itemExcel.className = "sql-resultado-export-item";
  itemExcel.textContent = "Excel (.xlsx)";
  itemExcel.addEventListener("click", () => {
    exportarExcel(estadoResultado);
    exportMenu.hidden = true;
  });

  const itemCsv = document.createElement("button");
  itemCsv.type = "button";
  itemCsv.className = "sql-resultado-export-item";
  itemCsv.textContent = "CSV";
  itemCsv.addEventListener("click", () => {
    exportarCsv(estadoResultado);
    exportMenu.hidden = true;
  });

  exportMenu.appendChild(itemExcel);
  exportMenu.appendChild(itemCsv);

  if (estadoResultado.editavel) {
    const itemSql = document.createElement("button");
    itemSql.type = "button";
    itemSql.className = "sql-resultado-export-item";
    itemSql.textContent = "SQL (.sql)";
    itemSql.addEventListener("click", () => {
      exportarSql(estadoResultado);
      exportMenu.hidden = true;
    });
    exportMenu.appendChild(itemSql);
  }

  exportBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    exportMenu.hidden = !exportMenu.hidden;
  });

  // criarBarraFerramentas() roda de novo a cada SELECT (re-execução da
  // query); sem abortar o listener anterior, cada barra nova acumularia
  // mais um listener de clique "fantasma" no document (o menu antigo já
  // nem está mais no DOM, mas o listener continuaria vivo).
  if (controladorMenuExport) {
    controladorMenuExport.abort();
  }
  controladorMenuExport = new AbortController();
  document.addEventListener(
    "click",
    () => { exportMenu.hidden = true; },
    { signal: controladorMenuExport.signal }
  );

  exportWrapper.appendChild(exportBtn);
  exportWrapper.appendChild(exportMenu);

  const expandirBtn = document.createElement("button");
  expandirBtn.type = "button";
  expandirBtn.className = "painel__icone-btn";
  expandirBtn.id = "resultado-expandir-btn";
  expandirBtn.title = "Expandir";
  expandirBtn.innerHTML = ICONE_EXPANDIR;

  barra.appendChild(cadeadoBtn);
  barra.appendChild(proximaBtn);
  barra.appendChild(ultimaBtn);
  barra.appendChild(postBtn);
  barra.appendChild(exportWrapper);
  barra.appendChild(expandirBtn);

  let telaCheiaAtiva = false;

  expandirBtn.addEventListener("click", () => {
    telaCheiaAtiva = !telaCheiaAtiva;
    resultadoEl.classList.toggle("sql-resultado--expandido", telaCheiaAtiva);
    expandirBtn.innerHTML = telaCheiaAtiva ? ICONE_RECOLHER : ICONE_EXPANDIR;
    expandirBtn.title = telaCheiaAtiva ? "Recolher" : "Expandir";
  });

  function trocarPagina(opcoes) {
    const ir = () => executar(estadoResultado.sql, opcoes);

    if (pendenciasEdicao.size > 0) {
      abrirConfirmacaoGenerica(
        "Há alterações não gravadas nesta página. Trocar de página descarta essas alterações (elas não são enviadas ao banco). Deseja continuar?",
        [...pendenciasEdicao.values()].map((a) => `${a.coluna}: "${a.valorAntigo}" → "${a.valorNovo}"`).join("\n"),
        () => {
          pendenciasEdicao.clear();
          ir();
        }
      );
      return;
    }

    ir();
  }

  proximaBtn.addEventListener("click", () => {
    trocarPagina({ pagina: estadoResultado.pagina + 1 });
  });

  ultimaBtn.addEventListener("click", () => {
    trocarPagina({ ultimaPagina: true });
  });

  cadeadoBtn.addEventListener("click", () => {
    if (!estadoResultado.editavel) return;
    modoEdicao = !modoEdicao;
    cadeadoBtn.innerHTML = modoEdicao ? ICONE_CADEADO_ABERTO : ICONE_CADEADO_FECHADO;
    cadeadoBtn.title = modoEdicao ? "Desabilitar edição" : "Habilitar edição";
    atualizarTabela();
  });

  postBtn.addEventListener("click", () => {
    if (pendenciasEdicao.size === 0) return;

    const alteracoes = [...pendenciasEdicao.values()];
    const preview = alteracoes
      .map((a) => `${estadoResultado.tabela}.${a.coluna} (rowid ${a.rowid}): "${a.valorAntigo}" → "${a.valorNovo}"`)
      .join("\n");

    abrirConfirmacaoGenerica(
      `Isso vai gravar ${alteracoes.length} alteração(ões) na tabela ${estadoResultado.tabela}, no banco de produção. Essa ação não pode ser desfeita.`,
      preview,
      () => enviarPostChanges(alteracoes)
    );
  });

  postBtn.disabled = pendenciasEdicao.size === 0;

  return barra;
}

let ordemColuna = null; // { coluna: string, asc: boolean } | null
let linhasExibidas = []; // cópia de estadoResultado.linhas, possivelmente reordenada

function compararValores(a, b, coluna) {
  const va = a[coluna];
  const vb = b[coluna];
  if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : -1;
  if (vb === null || vb === undefined) return 1;

  const na = Number(va);
  const nb = Number(vb);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== "") {
    return na - nb;
  }

  const da = Date.parse(va);
  const db = Date.parse(vb);
  if (!Number.isNaN(da) && !Number.isNaN(db)) {
    return da - db;
  }

  return String(va).localeCompare(String(vb), "pt-BR");
}

function linhasOrdenadas() {
  if (!ordemColuna) return estadoResultado.linhas;
  const copia = [...estadoResultado.linhas];
  copia.sort((a, b) => {
    const cmp = compararValores(a, b, ordemColuna.coluna.toLowerCase());
    return ordemColuna.asc ? cmp : -cmp;
  });
  return copia;
}

function alternarOrdenacao(coluna) {
  if (!ordemColuna || ordemColuna.coluna !== coluna) {
    ordemColuna = { coluna, asc: true };
  } else if (ordemColuna.asc) {
    ordemColuna = { coluna, asc: false };
  } else {
    ordemColuna = null;
  }
  atualizarTabela();
}

function construirTabela() {
  const tabela = document.createElement("table");
  tabela.className = "colunas-tabela";

  const thead = document.createElement("thead");
  const trCabecalho = document.createElement("tr");
  estadoResultado.colunas.forEach((c) => {
    const th = document.createElement("th");
    th.className = "coluna-th-ordenavel";
    th.textContent = c;
    const seta = document.createElement("span");
    seta.className = "coluna-ordem-seta";
    seta.dataset.campo = c;
    if (ordemColuna && ordemColuna.coluna === c) {
      seta.textContent = ordemColuna.asc ? "↑" : "↓";
    }
    th.appendChild(seta);
    th.addEventListener("click", () => alternarOrdenacao(c));
    trCabecalho.appendChild(th);
  });
  thead.appendChild(trCabecalho);

  const tbody = document.createElement("tbody");
  linhasExibidas = linhasOrdenadas();
  linhasExibidas.forEach((linha) => {
    const tr = document.createElement("tr");
    const rowid = linha.gaso_rowid;
    estadoResultado.colunas.forEach((c) => {
      const td = document.createElement("td");
      td.dataset.coluna = c;

      const chave = chavePendencia(rowid, c);
      const pendencia = pendenciasEdicao.get(chave);
      const valorAtual = pendencia ? pendencia.valorNovo : (linha[c] ?? "");

      const span = document.createElement("span");
      span.className = "celula-valor";
      span.textContent = valorAtual;
      td.appendChild(span);

      if (pendencia) {
        td.classList.add("celula-alterada");
      }

      if (modoEdicao && estadoResultado.editavel && rowid) {
        const lapis = document.createElement("button");
        lapis.type = "button";
        lapis.className = "celula-editar-btn";
        lapis.title = "Editar";
        lapis.innerHTML = ICONE_LAPIS;
        lapis.addEventListener("click", () => iniciarEdicaoCelula(td, rowid, c, valorAtual));
        td.appendChild(lapis);
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  tabela.appendChild(thead);
  tabela.appendChild(tbody);
  return tabela;
}

function atualizarTabela() {
  const wrapper = document.getElementById("sql-resultado-tabela-wrapper");
  if (!wrapper) return;
  wrapper.innerHTML = "";
  wrapper.appendChild(construirTabela());
}

function iniciarEdicaoCelula(td, rowid, coluna, valorAtual) {
  td.innerHTML = "";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "celula-editar-input";
  input.value = valorAtual;
  td.appendChild(input);
  input.focus();
  input.select();

  const confirmar = () => {
    const valorNovo = input.value;
    const chave = chavePendencia(rowid, coluna);
    const valorOriginal = linhasExibidas.find((l) => l.gaso_rowid === rowid)?.[coluna] ?? "";

    if (valorNovo === String(valorOriginal)) {
      pendenciasEdicao.delete(chave);
    } else {
      pendenciasEdicao.set(chave, { rowid, coluna, valorNovo, valorAntigo: valorOriginal });
    }
    atualizarBotaoPostChanges();
    atualizarTabela();
  };

  const cancelar = () => {
    atualizarTabela();
  };

  input.addEventListener("blur", confirmar);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      input.removeEventListener("blur", confirmar);
      cancelar();
    }
  });
}

function atualizarBotaoPostChanges() {
  const postBtn = document.getElementById("resultado-post-btn");
  if (postBtn) postBtn.disabled = pendenciasEdicao.size === 0;
}

async function enviarPostChanges(alteracoes) {
  mostrarErroPostChanges(null);

  try {
    const resposta = await fetch(urlDoEditor(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TABELAS_API_KEY
      },
      body: JSON.stringify({
        tipo: "update-lote",
        tabela: estadoResultado.tabela,
        alteracoes: alteracoes.map(({ rowid, coluna, valorNovo }) => ({ rowid, coluna, valorNovo }))
      })
    });

    const dados = await resposta.json();
    if (!resposta.ok) {
      throw new Error(dados.erro || `Resposta ${resposta.status}`);
    }

    pendenciasEdicao.clear();
    await executar(estadoResultado.sql, { pagina: estadoResultado.pagina });
  } catch (erro) {
    console.error("Erro ao gravar alterações:", erro);
    mostrarErroPostChanges(erro.message || "Não foi possível gravar as alterações.");
  }
}

function mostrarTabelaResultado(dados) {
  resultadoEl.innerHTML = "";

  estadoResultado = {
    sql: dados.sql,
    colunas: dados.colunas || [],
    tiposColuna: dados.tiposColuna || {},
    linhas: dados.linhas || [],
    pagina: dados.pagina || 1,
    temProximaPagina: Boolean(dados.temProximaPagina),
    editavel: Boolean(dados.editavel),
    tabela: dados.tabela || null,
  };

  if (estadoResultado.linhas.length === 0 && estadoResultado.pagina === 1) {
    mostrarMensagemResultado("0 linhas retornadas.", "status");
    estadoResultado = null;
    return;
  }

  const barra = criarBarraFerramentas();
  resultadoEl.appendChild(barra);

  const erroPost = criarAreaErroPostChanges();
  resultadoEl.appendChild(erroPost);

  const wrapper = document.createElement("div");
  wrapper.className = "colunas-tabela-wrapper sql-resultado-tabela-wrapper";
  wrapper.id = "sql-resultado-tabela-wrapper";

  wrapper.appendChild(construirTabela());
  resultadoEl.appendChild(wrapper);
}

async function executarNoBackend(sql, opcoes = {}) {
  const resposta = await fetch(urlDoEditor(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": TABELAS_API_KEY
    },
    body: JSON.stringify({ sql, ...opcoes })
  });

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(dados.erro || `Resposta ${resposta.status}`);
  }

  return dados;
}

async function executar(sql, opcoes = {}) {
  if (!configurada()) {
    mostrarMensagemResultado("Endpoint de busca de tabelas ainda não configurado (public/js/config/tabelas-api-config.js).", "erro");
    return;
  }

  executarBtn.disabled = true;
  mostrarMensagemResultado("Executando...", "status");

  try {
    const dados = await executarNoBackend(sql, opcoes);
    if (dados.tipo === "select") {
      ordemColuna = null;
      mostrarTabelaResultado({ ...dados, sql });
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

let confirmacaoPendenteCallback = null;

function ehSelect(sql) {
  // Ignora comentários (--, /* */) antes de checar, para não pedir
  // confirmação indevida num SELECT que só tem comentários explicativos
  // no início (padrão comum nos scripts salvos) — mesmo ajuste feito no
  // backend (server/api/sql-editor.php, remover_comentarios_sql).
  const semComentarios = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return /^\s*select\b/i.test(semComentarios);
}

function abrirConfirmacaoGenerica(mensagem, preview, callback) {
  confirmacaoPendenteCallback = callback;
  confirmarMensagemEl.textContent = mensagem;
  confirmarPreviewEl.textContent = preview;
  confirmarOverlay.hidden = false;
}

function fecharConfirmacao() {
  confirmarOverlay.hidden = true;
  confirmacaoPendenteCallback = null;
}

confirmarCancelarBtn.addEventListener("click", fecharConfirmacao);
confirmarOverlay.addEventListener("click", (event) => {
  if (event.target === confirmarOverlay) fecharConfirmacao();
});
confirmarExecutarBtn.addEventListener("click", () => {
  const callback = confirmacaoPendenteCallback;
  fecharConfirmacao();
  if (callback) callback();
});

function abrirConfirmacao(sql) {
  abrirConfirmacaoGenerica(
    "Isso vai executar este comando no banco de produção. Essa ação não pode ser desfeita.",
    sql,
    () => executar(sql)
  );
}

function prosseguirComExecucao(sql) {
  if (ehSelect(sql)) {
    executar(sql);
  } else {
    abrirConfirmacao(sql);
  }
}

executarBtn.addEventListener("click", () => {
  const sql = editor.getValue().trim();
  if (!sql) {
    mostrarMensagemResultado("Escreva um comando SQL antes de executar.", "erro");
    return;
  }

  if (pendenciasEdicao.size > 0) {
    abrirConfirmacaoGenerica(
      "Há alterações não gravadas na página atual. Executar uma nova consulta descarta essas alterações (elas não são enviadas ao banco). Deseja continuar?",
      [...pendenciasEdicao.values()].map((a) => `${a.coluna}: "${a.valorAntigo}" → "${a.valorNovo}"`).join("\n"),
      () => {
        pendenciasEdicao.clear();
        prosseguirComExecucao(sql);
      }
    );
    return;
  }

  prosseguirComExecucao(sql);
});

// ── Painel "SQL Script" ──────────────────────────────────────────────────
// Dois estados: "categorias" (grade de categorias) e "categoria" (lista de
// scripts de uma categoria). A busca se comporta diferente em cada estado:
// na tela de categorias ela busca por título em TODOS os scripts; dentro de
// uma categoria ela filtra só os scripts daquela categoria.
const scriptPainelOverlay = document.getElementById("script-painel-overlay");
const scriptPainelBusca = document.getElementById("script-painel-busca");
const scriptPainelLista = document.getElementById("script-painel-lista");
const scriptPainelFecharBtn = document.getElementById("script-painel-fechar-btn");
const scriptPainelVoltarBtn = document.getElementById("script-painel-voltar-btn");
const scriptPainelTituloEl = document.getElementById("script-painel-titulo");

let scriptsCarregados = [];
let categoriaAtual = null;

function categoriasUnicas() {
  const nomes = scriptsCarregados
    .map((s) => s.categoria)
    .filter(Boolean);
  return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function renderizarItensScript(scripts) {
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

function renderizarCategorias(categorias) {
  scriptPainelLista.innerHTML = "";

  if (categorias.length === 0) {
    scriptPainelLista.innerHTML = `<p class="solucoes-vazio">Nenhuma categoria encontrada.</p>`;
    return;
  }

  categorias.forEach((categoria) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "script-painel-item";

    const titulo = document.createElement("span");
    titulo.className = "script-painel-item__titulo";
    titulo.textContent = categoria;

    item.appendChild(titulo);
    item.addEventListener("click", () => abrirCategoria(categoria));
    scriptPainelLista.appendChild(item);
  });
}

function mostrarTelaCategorias() {
  categoriaAtual = null;
  scriptPainelVoltarBtn.hidden = true;
  scriptPainelTituloEl.textContent = "SQL Script";
  scriptPainelBusca.value = "";
  scriptPainelBusca.placeholder = "Buscar por título...";
  renderizarCategorias(categoriasUnicas());
}

function abrirCategoria(categoria) {
  categoriaAtual = categoria;
  scriptPainelVoltarBtn.hidden = false;
  scriptPainelTituloEl.textContent = categoria;
  scriptPainelBusca.value = "";
  scriptPainelBusca.placeholder = "Buscar por título...";
  renderizarItensScript(scriptsCarregados.filter((s) => s.categoria === categoria));
}

async function carregarScripts() {
  scriptPainelLista.innerHTML = `<p class="solucoes-vazio">Carregando...</p>`;
  const { data, error } = await supabase
    .from("solucoes")
    .select("id,titulo,erro,codigo,categoria")
    .eq("tipo", "script")
    .order("titulo");

  if (error) {
    console.error("Erro ao carregar scripts salvos:", error);
    scriptPainelLista.innerHTML = `<p class="solucoes-vazio">Não foi possível carregar os scripts salvos.</p>`;
    return;
  }

  scriptsCarregados = data || [];
  mostrarTelaCategorias();
}

function abrirScriptPainel() {
  scriptPainelOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  carregarScripts();
}

function fecharScriptPainel() {
  scriptPainelOverlay.hidden = true;
  document.body.style.overflow = "";
}

scriptBtn.addEventListener("click", abrirScriptPainel);
scriptPainelFecharBtn.addEventListener("click", fecharScriptPainel);
scriptPainelVoltarBtn.addEventListener("click", mostrarTelaCategorias);
scriptPainelOverlay.addEventListener("click", (event) => {
  if (event.target === scriptPainelOverlay) fecharScriptPainel();
});

scriptPainelBusca.addEventListener("input", () => {
  const termo = scriptPainelBusca.value.trim().toLowerCase();

  if (categoriaAtual) {
    const scriptsDaCategoria = scriptsCarregados.filter((s) => s.categoria === categoriaAtual);
    const filtrados = termo
      ? scriptsDaCategoria.filter((s) => (s.titulo || "").toLowerCase().includes(termo))
      : scriptsDaCategoria;
    renderizarItensScript(filtrados);
    return;
  }

  if (!termo) {
    renderizarCategorias(categoriasUnicas());
    return;
  }

  const resultados = scriptsCarregados.filter((s) => (s.titulo || "").toLowerCase().includes(termo));
  renderizarItensScript(resultados);
});
