import { TABELAS_API_URL, TABELAS_API_KEY } from "../config/tabelas-api-config.js";

const contagemEl = document.getElementById("busca-contagem");
const buscaInput = document.getElementById("busca-input");
const grade = document.getElementById("tabelas-grade");
const vazioEl = document.getElementById("tabelas-vazio");

const filtroModulo = document.getElementById("filtro-modulo");
const filtroTipo = document.getElementById("filtro-tipo");

let tabelasTodas = [];

function normalizar(texto) {
  return (texto || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function preencherFiltroDinamico(selectEl, valores) {
  const valorAtual = selectEl.value;
  const primeiraOpcao = selectEl.querySelector("option");
  selectEl.innerHTML = "";
  selectEl.appendChild(primeiraOpcao);

  Array.from(new Set(valores.filter(Boolean))).sort().forEach((valor) => {
    const opcao = document.createElement("option");
    opcao.value = valor;
    opcao.textContent = valor;
    selectEl.appendChild(opcao);
  });

  selectEl.value = valorAtual;
}

function criarCard(tabela) {
  const card = document.createElement("div");
  card.className = "solucao-card";

  const tagsHtml = [tabela.modulo, tabela.tipo]
    .filter(Boolean)
    .map((tag) => `<span class="solucao-card__tag">${tag}</span>`)
    .join("");

  card.innerHTML = `
    <div class="solucao-card__topo">
      <span class="tipo-pill" style="background-color: var(--cor-bloco-meta); color: var(--cor-texto-suave);">${tabela.tipo || "—"}</span>
    </div>

    <h3 class="solucao-card__titulo">${tabela.tabela || "Sem nome"}</h3>
    <p class="solucao-card__descricao">${tabela.descricao || "Sem descrição cadastrada no Oracle."}</p>

    <div class="solucao-card__tags">${tagsHtml}</div>
  `;

  return card;
}

function tabelaCorresponde(tabela, termos) {
  const nome = normalizar(tabela.tabela);
  const descricao = normalizar(tabela.descricao);
  return termos.every((termo) => nome.includes(termo) || descricao.includes(termo));
}

function calcularRelevancia(tabela, termos) {
  const nome = normalizar(tabela.tabela);
  return termos.every((termo) => nome.includes(termo)) ? 0 : 1;
}

function renderizarLista() {
  const termo = normalizar(buscaInput.value.trim());
  const termos = termo.split(/\s+/).filter(Boolean);
  const modulo = filtroModulo.value;
  const tipo = filtroTipo.value;

  let filtradas = tabelasTodas.filter((tabela) => {
    if (modulo && tabela.modulo !== modulo) return false;
    if (tipo && tabela.tipo !== tipo) return false;
    if (termos.length > 0 && !tabelaCorresponde(tabela, termos)) return false;
    return true;
  });

  filtradas = filtradas
    .map((tabela) => ({ tabela, relevancia: calcularRelevancia(tabela, termos) }))
    .sort((a, b) => a.relevancia - b.relevancia || a.tabela.tabela.localeCompare(b.tabela.tabela))
    .map((item) => item.tabela);

  grade.innerHTML = "";

  if (filtradas.length === 0) {
    vazioEl.textContent = tabelasTodas.length === 0
      ? "Nenhuma tabela carregada."
      : "Nenhuma tabela encontrada para essa busca.";
    vazioEl.hidden = false;
  } else {
    vazioEl.hidden = true;
    filtradas.forEach((tabela) => grade.appendChild(criarCard(tabela)));
  }
}

async function carregarTabelas() {
  if (!TABELAS_API_URL || !TABELAS_API_KEY) {
    contagemEl.textContent = "";
    vazioEl.textContent = "Endpoint de busca de tabelas ainda não configurado (public/js/config/tabelas-api-config.js).";
    vazioEl.hidden = false;
    return;
  }

  contagemEl.textContent = "Carregando tabelas...";

  try {
    const resposta = await fetch(TABELAS_API_URL, {
      headers: { "X-API-Key": TABELAS_API_KEY }
    });

    if (!resposta.ok) {
      throw new Error(`Resposta ${resposta.status}`);
    }

    const dados = await resposta.json();
    tabelasTodas = Array.isArray(dados) ? dados : [];

    contagemEl.textContent = `${tabelasTodas.length.toLocaleString("pt-BR")} tabelas encontradas no banco`;

    preencherFiltroDinamico(filtroModulo, tabelasTodas.map((t) => t.modulo));
    preencherFiltroDinamico(filtroTipo, tabelasTodas.map((t) => t.tipo));

    renderizarLista();
  } catch (erro) {
    console.error("Erro ao carregar tabelas:", erro);
    contagemEl.textContent = "";
    vazioEl.textContent = "Não foi possível carregar as tabelas. Verifique a conexão com o servidor.";
    vazioEl.hidden = false;
  }
}

buscaInput.addEventListener("input", renderizarLista);
filtroModulo.addEventListener("change", renderizarLista);
filtroTipo.addEventListener("change", renderizarLista);

carregarTabelas();
