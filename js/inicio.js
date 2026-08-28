import { supabase } from "./supabase-config.js";

const contagemEl = document.getElementById("busca-contagem");
const buscaInput = document.getElementById("busca-input");
const grade = document.getElementById("solucoes-grade");
const vazioEl = document.getElementById("solucoes-vazio");

const filtroTipo = document.getElementById("filtro-tipo");
const filtroModulo = document.getElementById("filtro-modulo");
const filtroCategoria = document.getElementById("filtro-categoria");
const filtroCriticidade = document.getElementById("filtro-criticidade");
const filtroAutor = document.getElementById("filtro-autor");
const filtroPeriodo = document.getElementById("filtro-periodo");

const filtrosAplicadosEl = document.getElementById("filtros-aplicados");
const filtrosChipsEl = document.getElementById("filtros-aplicados-chips");
const filtrosLimparBtn = document.getElementById("filtros-limpar");

const ordenarBtn = document.getElementById("ordenar-btn");
const ordenarTexto = document.getElementById("ordenar-texto");

let solucoesTodas = [];
let ordenacao = "recentes";

const TIPO_INFO = {
  erro: { label: "Erro", cor: "#d9534f", fundo: "#fdecea" },
  script: { label: "Script", cor: "#7c5cf0", fundo: "#eee9fb" },
  procedimento: { label: "Procedimento", cor: "#2fa360", fundo: "#e5f6ea" }
};

const CRITICIDADE_INFO = {
  baixa: { label: "Baixa", cor: "#6b7280" },
  media: { label: "Média", cor: "#2563eb" },
  alta: { label: "Alta", cor: "#9c7a45" },
  critica: { label: "Crítica", cor: "#dc2626" }
};

function formatarTempoRelativo(dataIso) {
  if (!dataIso) return "";
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDias <= 0) return "hoje";
  if (diffDias === 1) return "ontem";
  return `há ${diffDias} dias`;
}

function iniciaisAutor(nome) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return ((partes[0][0] || "") + (partes[1]?.[0] || "")).toUpperCase();
}

function montarTags(solucao) {
  const tags = [];
  if (solucao.modulo) tags.push(solucao.modulo);
  if (solucao.categoria) tags.push(solucao.categoria);
  (solucao.sintomas || []).forEach((t) => t && tags.push(t));
  (solucao.tabelas_campos || []).forEach((t) => t && tags.push(t));
  return tags;
}

function criarCard(solucao) {
  const tipoInfo = TIPO_INFO[solucao.tipo] || { label: solucao.tipo || "—", cor: "#6b7280", fundo: "#f2f3f5" };
  const criticidadeInfo = CRITICIDADE_INFO[solucao.criticidade];

  const card = document.createElement("div");
  card.className = "solucao-card";

  const tags = montarTags(solucao);
  const tagsVisiveis = tags.slice(0, 3);
  const tagsRestantes = tags.length - tagsVisiveis.length;

  const tagsHtml = tagsVisiveis.map((tag) => `<span class="solucao-card__tag">${tag}</span>`).join("")
    + (tagsRestantes > 0 ? `<span class="solucao-card__tag solucao-card__tag--mais">+${tagsRestantes}</span>` : "");

  const criticidadeHtml = criticidadeInfo
    ? `<span class="criticidade-pill" style="color:${criticidadeInfo.cor};"><span class="criticidade-pill__ponto" style="background-color:${criticidadeInfo.cor};"></span>${criticidadeInfo.label}</span>`
    : "";

  card.innerHTML = `
    <div class="solucao-card__topo">
      <span class="tipo-pill" style="background-color:${tipoInfo.fundo}; color:${tipoInfo.cor};">${tipoInfo.label}</span>
      <div class="solucao-card__topo-direita">
        ${criticidadeHtml}
        <button class="favorito-btn" type="button" aria-label="Favoritar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.2.9-4.5 4.4 1.1 6.1L12 17l-5.5 3 1.1-6.1L3.1 9.5l6.2-.9z"/></svg>
        </button>
      </div>
    </div>

    <h3 class="solucao-card__titulo">${solucao.titulo || "Sem título"}</h3>
    <p class="solucao-card__descricao">${solucao.erro || ""}</p>

    <div class="solucao-card__tags">${tagsHtml}</div>

    <div class="solucao-card__rodape">
      <span class="solucao-card__avatar">${iniciaisAutor(solucao.autor)}</span>
      <span class="solucao-card__autor">${solucao.autor || "Autor não informado"}</span>
      <span class="solucao-card__tempo">· ${formatarTempoRelativo(solucao.criado_em)}</span>
    </div>
  `;

  card.querySelector(".favorito-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    event.currentTarget.classList.toggle("favorito-btn--ativo");
  });

  return card;
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

async function carregarSelectDaTabela(tabela, selectEl) {
  const { data } = await supabase.from(tabela).select("nome").order("nome");
  const primeiraOpcao = selectEl.querySelector("option");
  selectEl.innerHTML = "";
  selectEl.appendChild(primeiraOpcao);
  (data || []).forEach((registro) => {
    const opcao = document.createElement("option");
    opcao.value = registro.nome;
    opcao.textContent = registro.nome;
    selectEl.appendChild(opcao);
  });
}

const LABELS_FILTRO = {
  tipo: "Tipo",
  modulo: "Módulo",
  categoria: "Categoria",
  criticidade: "Criticidade",
  autor: "Autor",
  periodo: "Período"
};

function obterFiltrosAtivos() {
  return {
    tipo: filtroTipo.value,
    modulo: filtroModulo.value,
    categoria: filtroCategoria.value,
    criticidade: filtroCriticidade.value,
    autor: filtroAutor.value,
    periodo: filtroPeriodo.value
  };
}

function renderizarFiltrosAplicados() {
  const filtros = obterFiltrosAtivos();
  const ativos = Object.entries(filtros).filter(([, valor]) => valor);

  if (ativos.length === 0) {
    filtrosAplicadosEl.hidden = true;
    return;
  }

  filtrosAplicadosEl.hidden = false;
  filtrosChipsEl.innerHTML = "";

  ativos.forEach(([chave, valor]) => {
    const chip = document.createElement("span");
    chip.className = "filtro-chip";

    const rotulo = chave === "periodo"
      ? `Período · Últimos ${valor} dias`
      : chave === "criticidade"
        ? `Criticidade · ${CRITICIDADE_INFO[valor]?.label || valor}`
        : chave === "tipo"
          ? `Tipo · ${TIPO_INFO[valor]?.label || valor}`
          : `${LABELS_FILTRO[chave]} · ${valor}`;

    chip.textContent = rotulo;

    const removerBtn = document.createElement("button");
    removerBtn.type = "button";
    removerBtn.className = "filtro-chip__remover";
    removerBtn.setAttribute("aria-label", "Remover filtro");
    removerBtn.textContent = "×";
    removerBtn.addEventListener("click", () => {
      document.getElementById(`filtro-${chave}`).value = "";
      renderizarLista();
    });

    chip.appendChild(removerBtn);
    filtrosChipsEl.appendChild(chip);
  });
}

function renderizarLista() {
  const termo = buscaInput.value.trim().toLowerCase();
  const filtros = obterFiltrosAtivos();

  let filtradas = solucoesTodas.filter((solucao) => {
    if (filtros.tipo && solucao.tipo !== filtros.tipo) return false;
    if (filtros.modulo && solucao.modulo !== filtros.modulo) return false;
    if (filtros.categoria && solucao.categoria !== filtros.categoria) return false;
    if (filtros.criticidade && solucao.criticidade !== filtros.criticidade) return false;
    if (filtros.autor && solucao.autor !== filtros.autor) return false;

    if (filtros.periodo) {
      const diasLimite = Number(filtros.periodo);
      const diffDias = (Date.now() - new Date(solucao.criado_em).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > diasLimite) return false;
    }

    if (termo) {
      const alvo = [
        solucao.titulo, solucao.erro, solucao.categoria, solucao.modulo,
        ...(solucao.sintomas || []), ...(solucao.tabelas_campos || [])
      ].join(" ").toLowerCase();
      if (!alvo.includes(termo)) return false;
    }

    return true;
  });

  filtradas = filtradas.slice().sort((a, b) => {
    const diff = new Date(b.criado_em) - new Date(a.criado_em);
    return ordenacao === "recentes" ? diff : -diff;
  });

  grade.innerHTML = "";

  if (filtradas.length === 0) {
    vazioEl.textContent = solucoesTodas.length === 0
      ? "Nenhuma solução cadastrada ainda."
      : "Nenhuma solução encontrada para esse filtro.";
    vazioEl.hidden = false;
  } else {
    vazioEl.hidden = true;
    filtradas.forEach((solucao) => grade.appendChild(criarCard(solucao)));
  }

  renderizarFiltrosAplicados();
}

async function carregarContagemESolucoes() {
  const { data, count } = await supabase
    .from("solucoes")
    .select("*", { count: "exact" })
    .order("criado_em", { ascending: false });

  solucoesTodas = data || [];
  contagemEl.textContent = `${(count || 0).toLocaleString("pt-BR")} soluções cadastradas`;

  preencherFiltroDinamico(filtroAutor, solucoesTodas.map((s) => s.autor));

  renderizarLista();
}

carregarContagemESolucoes();
carregarSelectDaTabela("modulos", filtroModulo);
carregarSelectDaTabela("categorias", filtroCategoria);

[filtroTipo, filtroModulo, filtroCategoria, filtroCriticidade, filtroAutor, filtroPeriodo].forEach((select) => {
  select.addEventListener("change", renderizarLista);
});

buscaInput.addEventListener("input", renderizarLista);

filtrosLimparBtn.addEventListener("click", () => {
  [filtroTipo, filtroModulo, filtroCategoria, filtroCriticidade, filtroAutor, filtroPeriodo].forEach((select) => {
    select.value = "";
  });
  renderizarLista();
});

ordenarBtn.addEventListener("click", () => {
  ordenacao = ordenacao === "recentes" ? "antigas" : "recentes";
  ordenarTexto.textContent = ordenacao === "recentes" ? "Mais recentes" : "Mais antigas";
  renderizarLista();
});
