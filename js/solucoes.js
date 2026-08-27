import { supabase } from "./supabase-config.js";

const listaEl = document.getElementById("solucoes-lista");
const vazioEl = document.getElementById("solucoes-vazio");
const avisoEditadoEl = document.getElementById("aviso-editado");
const statTotalEl = document.getElementById("stat-total");
const buscaInput = document.getElementById("busca-input");
const categoriasFiltroEl = document.getElementById("categorias-filtro");

const parametros = new URLSearchParams(window.location.search);
if (parametros.get("editado")) {
  avisoEditadoEl.textContent = "Solução editada com sucesso.";
  avisoEditadoEl.hidden = false;
  window.history.replaceState({}, "", "solucoes.html");
} else if (parametros.get("excluido")) {
  avisoEditadoEl.textContent = "Solução excluída com sucesso.";
  avisoEditadoEl.hidden = false;
  window.history.replaceState({}, "", "solucoes.html");
}

function formatarData(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString("pt-BR");
}

const CORES_CATEGORIA = [
  { bg: "#e6f0fd", fg: "#1a56c4" },
  { bg: "#eaf7ee", fg: "#1f8a3d" },
  { bg: "#f4ecfc", fg: "#7c3aed" },
  { bg: "#fdf1e2", fg: "#c2740a" },
  { bg: "#fdeaea", fg: "#c62828" },
  { bg: "#e6f7f7", fg: "#0f8a8a" }
];

function corDaCategoria(nome) {
  if (!nome) return CORES_CATEGORIA[0];
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CORES_CATEGORIA[Math.abs(hash) % CORES_CATEGORIA.length];
}

let solucoesTodas = [];
let categoriaAtiva = "";

function criarCard(id, dados) {
  const card = document.createElement("a");
  card.className = "solucao-card";
  card.href = `solucao.html?id=${id}`;

  const cor = corDaCategoria(dados.categoria);
  const categoriaTag = dados.categoria
    ? `<span class="categoria-tag" style="background-color:${cor.bg}; color:${cor.fg};">${dados.categoria}</span>`
    : "";

  card.innerHTML = `
    ${categoriaTag}
    <h2 class="solucao-card__titulo">${dados.titulo || "Sem título"}</h2>
    <p class="solucao-card__erro">${dados.erro || ""}</p>
    <div class="solucao-card__meta">
      <span>${dados.autor || "Autor não informado"}</span>
      <span>${formatarData(dados.criado_em)}</span>
    </div>
  `;

  return card;
}

function renderizarLista() {
  const termo = buscaInput.value.trim().toLowerCase();

  const filtradas = solucoesTodas.filter((solucao) => {
    const combinaCategoria = !categoriaAtiva || solucao.categoria === categoriaAtiva;
    const combinaBusca = !termo
      || (solucao.titulo || "").toLowerCase().includes(termo)
      || (solucao.erro || "").toLowerCase().includes(termo)
      || (solucao.categoria || "").toLowerCase().includes(termo);
    return combinaCategoria && combinaBusca;
  });

  listaEl.innerHTML = "";

  if (filtradas.length === 0) {
    vazioEl.textContent = solucoesTodas.length === 0
      ? "Nenhuma solução cadastrada ainda."
      : "Nenhuma solução encontrada para esse filtro.";
    vazioEl.hidden = false;
  } else {
    vazioEl.hidden = true;
  }

  filtradas.forEach((solucao) => {
    listaEl.appendChild(criarCard(solucao.id, solucao));
  });
}

function renderizarFiltrosCategoria(categorias) {
  categoriasFiltroEl.innerHTML = "";

  function criarChip(nome, valor) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "categoria-chip" + (categoriaAtiva === valor ? " categoria-chip--ativo" : "");
    chip.textContent = nome;
    chip.addEventListener("click", () => {
      categoriaAtiva = valor;
      renderizarFiltrosCategoria(categorias);
      renderizarLista();
    });
    return chip;
  }

  categoriasFiltroEl.appendChild(criarChip("Todas", ""));
  categorias.forEach((categoria) => {
    categoriasFiltroEl.appendChild(criarChip(categoria.nome, categoria.nome));
  });
}

async function carregarSolucoes() {
  const [{ data: solucoes }, { data: categorias }] = await Promise.all([
    supabase.from("solucoes").select("*").order("criado_em", { ascending: false }),
    supabase.from("categorias").select("*").order("nome")
  ]);

  solucoesTodas = solucoes || [];
  statTotalEl.textContent = solucoesTodas.length;

  renderizarFiltrosCategoria(categorias || []);
  renderizarLista();
}

buscaInput.addEventListener("input", renderizarLista);

carregarSolucoes();
