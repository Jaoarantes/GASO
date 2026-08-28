import { supabase } from "./supabase-config.js";

const contagemEl = document.getElementById("busca-contagem");

async function carregarContagem() {
  const { count } = await supabase
    .from("solucoes")
    .select("*", { count: "exact", head: true });

  contagemEl.textContent = `${(count || 0).toLocaleString("pt-BR")} soluções cadastradas`;
}

carregarContagem();
