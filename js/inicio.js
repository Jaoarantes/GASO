import { supabase } from "./supabase-config.js";

const contagemEl = document.getElementById("busca-contagem");
const buscaInput = document.getElementById("busca-input");

async function carregarContagem() {
  const { count } = await supabase
    .from("solucoes")
    .select("*", { count: "exact", head: true });

  contagemEl.textContent = `${(count || 0).toLocaleString("pt-BR")} soluções cadastradas`;
}

carregarContagem();

document.addEventListener("keydown", (event) => {
  const teclaK = event.key.toLowerCase() === "k";
  if ((event.metaKey || event.ctrlKey) && teclaK) {
    event.preventDefault();
    buscaInput.focus();
  }
});
