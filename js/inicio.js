import { supabase } from "./supabase-config.js";

const contagemEl = document.getElementById("busca-contagem");

async function carregarContagem() {
  const { count } = await supabase
    .from("solucoes")
    .select("*", { count: "exact", head: true });

  contagemEl.textContent = `${(count || 0).toLocaleString("pt-BR")} soluções cadastradas`;
}

carregarContagem();

const ordenarBtn = document.getElementById("ordenar-btn");
const ordenarTexto = document.getElementById("ordenar-texto");

let ordenacao = "recentes";

ordenarBtn.addEventListener("click", () => {
  ordenacao = ordenacao === "recentes" ? "antigas" : "recentes";
  ordenarTexto.textContent = ordenacao === "recentes" ? "Mais recentes" : "Mais antigas";
});

const visualizacaoGradeBtn = document.getElementById("visualizacao-grade");
const visualizacaoListaBtn = document.getElementById("visualizacao-lista");

function definirVisualizacao(modo) {
  localStorage.setItem("visualizacao", modo);
  visualizacaoGradeBtn.classList.toggle("visualizacao-btn--ativo", modo === "grade");
  visualizacaoListaBtn.classList.toggle("visualizacao-btn--ativo", modo === "lista");
}

visualizacaoGradeBtn.addEventListener("click", () => definirVisualizacao("grade"));
visualizacaoListaBtn.addEventListener("click", () => definirVisualizacao("lista"));

definirVisualizacao(localStorage.getItem("visualizacao") || "grade");
