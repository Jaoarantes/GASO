import { supabase } from "./supabase-config.js";

const listaEl = document.getElementById("solucoes-lista");
const vazioEl = document.getElementById("solucoes-vazio");
const avisoEditadoEl = document.getElementById("aviso-editado");

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

function criarCard(id, dados) {
  const card = document.createElement("a");
  card.className = "solucao-card";
  card.href = `solucao.html?id=${id}`;

  card.innerHTML = `
    <h2 class="solucao-card__titulo">${dados.titulo || "Sem título"}</h2>
    <p class="solucao-card__erro">${dados.erro || ""}</p>
    <div class="solucao-card__meta">
      <span>${dados.autor || "Autor não informado"}</span>
      <span>${formatarData(dados.criado_em)}</span>
    </div>
  `;

  return card;
}

async function carregarSolucoes() {
  const { data, error } = await supabase
    .from("solucoes")
    .select("*")
    .order("criado_em", { ascending: false });

  if (error || !data || data.length === 0) {
    vazioEl.hidden = false;
    return;
  }

  data.forEach((solucao) => {
    listaEl.appendChild(criarCard(solucao.id, solucao));
  });
}

carregarSolucoes();
