import { TABELAS_API_URL, TABELAS_API_KEY } from "../config/tabelas-api-config.js";

const contagemEl = document.getElementById("busca-contagem");
const buscaInput = document.getElementById("busca-input");
const grade = document.getElementById("tabelas-grade");
const vazioEl = document.getElementById("tabelas-vazio");

const filtroModulo = document.getElementById("filtro-modulo");
const filtroTipo = document.getElementById("filtro-tipo");

const modoTabelaBtn = document.getElementById("modo-tabela");
const modoTermosBtn = document.getElementById("modo-termos");

const TAMANHO_MINIMO_TERMO = 3;

let modoBusca = "termos";

function aplicarModoBusca(modo) {
  modoBusca = modo;
  modoTabelaBtn.classList.toggle("modo-busca-btn--ativo", modo === "tabela");
  modoTermosBtn.classList.toggle("modo-busca-btn--ativo", modo === "termos");
  buscaInput.placeholder = modo === "tabela"
    ? "Digite o nome exato da tabela..."
    : "Busque por termos, ex: notas, pedidos...";
  buscar();
}

modoTabelaBtn.addEventListener("click", () => aplicarModoBusca("tabela"));
modoTermosBtn.addEventListener("click", () => aplicarModoBusca("termos"));

function configurada() {
  return Boolean(TABELAS_API_URL && TABELAS_API_KEY);
}

async function chamarApi(params) {
  const url = new URL(TABELAS_API_URL);
  Object.entries(params).forEach(([chave, valor]) => {
    if (valor) url.searchParams.set(chave, valor);
  });

  const resposta = await fetch(url, {
    headers: { "X-API-Key": TABELAS_API_KEY }
  });

  if (!resposta.ok) {
    throw new Error(`Resposta ${resposta.status}`);
  }

  return resposta.json();
}

function preencherSelect(selectEl, valores) {
  const primeiraOpcao = selectEl.querySelector("option");
  selectEl.innerHTML = "";
  selectEl.appendChild(primeiraOpcao);

  valores.forEach((valor) => {
    const opcao = document.createElement("option");
    opcao.value = valor;
    opcao.textContent = valor;
    selectEl.appendChild(opcao);
  });
}

function normalizarTexto(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
}

const TIPO_TABELA_INFO = [
  { chave: "CADASTRO/BASE", cor: "var(--tabela-cadastro-cor)", fundo: "var(--tabela-cadastro-fundo)" },
  { chave: "TRABALHO/TEMPORARIA", cor: "var(--tabela-trabalho-cor)", fundo: "var(--tabela-trabalho-fundo)" },
  { chave: "SISTEMA (ORACLE/APEX)", cor: "var(--tabela-sistema-cor)", fundo: "var(--tabela-sistema-fundo)" },
  { chave: "DIVERSOS/NAO PADRONIZADO", cor: "var(--tabela-diversos-cor)", fundo: "var(--tabela-diversos-fundo)" }
];

function obterTipoTabelaInfo(tipo) {
  const chaveNormalizada = normalizarTexto(tipo);
  const encontrado = TIPO_TABELA_INFO.find((item) => item.chave === chaveNormalizada);
  return encontrado || { cor: "var(--cor-texto-suave)", fundo: "var(--cor-bloco-meta)" };
}

async function carregarFiltros() {
  try {
    const dados = await chamarApi({ acao: "filtros" });
    preencherSelect(filtroModulo, dados.modulos || []);
    preencherSelect(filtroTipo, dados.tipos || []);
  } catch (erro) {
    console.error("Erro ao carregar filtros:", erro);
  }
}

function criarCard(tabela) {
  const card = document.createElement("div");
  card.className = "solucao-card";

  const tipoInfo = obterTipoTabelaInfo(tabela.tipo);

  const tagsHtml = [tabela.modulo, tabela.tipo]
    .filter(Boolean)
    .map((tag) => `<span class="solucao-card__tag">${tag}</span>`)
    .join("");

  card.innerHTML = `
    <div class="solucao-card__topo">
      <span class="tipo-pill" style="background-color: ${tipoInfo.fundo}; color: ${tipoInfo.cor};">${tabela.tipo || "—"}</span>
    </div>

    <h3 class="solucao-card__titulo">${tabela.tabela || "Sem nome"}</h3>
    <p class="solucao-card__descricao">${tabela.descricao || "Sem descrição cadastrada no Oracle."}</p>

    <div class="solucao-card__tags">${tagsHtml}</div>
  `;

  return card;
}

function renderizarResultados(tabelas) {
  grade.innerHTML = "";

  if (tabelas.length === 0) {
    vazioEl.hidden = false;
  } else {
    vazioEl.hidden = true;
    tabelas.forEach((tabela) => grade.appendChild(criarCard(tabela)));
  }
}

function mostrarMensagem(mensagem) {
  grade.innerHTML = "";
  vazioEl.textContent = mensagem;
  vazioEl.hidden = false;
}

async function buscar() {
  if (!configurada()) {
    mostrarMensagem("Endpoint de busca de tabelas ainda não configurado (public/js/config/tabelas-api-config.js).");
    return;
  }

  const termoBusca = buscaInput.value.trim();
  const modulo = filtroModulo.value;
  const tipo = filtroTipo.value;

  if (modoBusca === "tabela") {
    if (termoBusca === "") {
      mostrarMensagem("Digite o nome exato da tabela para buscar.");
      contagemEl.textContent = "";
      return;
    }
  } else {
    const termosValidos = termoBusca.split(/\s+/).filter((t) => t.length >= TAMANHO_MINIMO_TERMO);

    if (termoBusca === "" && !modulo && !tipo) {
      mostrarMensagem("Digite algo ou selecione um filtro para buscar.");
      contagemEl.textContent = "";
      return;
    }

    if (termoBusca !== "" && termosValidos.length === 0 && !modulo && !tipo) {
      mostrarMensagem(`Digite termos com pelo menos ${TAMANHO_MINIMO_TERMO} letras.`);
      contagemEl.textContent = "";
      return;
    }
  }

  contagemEl.textContent = "Buscando...";

  try {
    const tabelas = await chamarApi({ acao: "buscar", modo: modoBusca, q: termoBusca, modulo, tipo });
    contagemEl.textContent = `${tabelas.length.toLocaleString("pt-BR")} tabelas encontradas`;
    renderizarResultados(tabelas);
  } catch (erro) {
    console.error("Erro ao buscar tabelas:", erro);
    contagemEl.textContent = "";
    mostrarMensagem("Não foi possível buscar as tabelas. Verifique a conexão com o servidor.");
  }
}

let buscaTimer = null;

buscaInput.addEventListener("input", () => {
  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(buscar, 300);
});

buscaInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    clearTimeout(buscaTimer);
    buscar();
  }
});

filtroModulo.addEventListener("change", buscar);
filtroTipo.addEventListener("change", buscar);

carregarFiltros();
mostrarMensagem("Digite algo ou selecione um filtro para buscar.");
