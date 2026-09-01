import { supabase } from "../config/supabase-config.js";

const contagemEl = document.getElementById("busca-contagem");
const buscaInput = document.getElementById("busca-input");
const grade = document.getElementById("solucoes-grade");
const vazioEl = document.getElementById("solucoes-vazio");

const filtroTipo = document.getElementById("filtro-tipo");
const filtroCategoria = document.getElementById("filtro-categoria");
const filtroCriticidade = document.getElementById("filtro-criticidade");
const filtroAutor = document.getElementById("filtro-autor");
const filtroPeriodo = document.getElementById("filtro-periodo");

const filtrosAplicadosEl = document.getElementById("filtros-aplicados");
const filtrosChipsEl = document.getElementById("filtros-aplicados-chips");
const filtrosLimparBtn = document.getElementById("filtros-limpar");

const ordenarBtn = document.getElementById("ordenar-btn");
const ordenarTexto = document.getElementById("ordenar-texto");

const visualizacaoGradeBtn = document.getElementById("visualizacao-grade");
const visualizacaoListaBtn = document.getElementById("visualizacao-lista");

let solucoesTodas = [];
let ordenacao = "recentes";

function aplicarVisualizacao(modo) {
  localStorage.setItem("visualizacao", modo);
  grade.classList.toggle("solucoes-grade--lista", modo === "lista");
  visualizacaoGradeBtn.classList.toggle("visualizacao-btn--ativo", modo === "grade");
  visualizacaoListaBtn.classList.toggle("visualizacao-btn--ativo", modo === "lista");
  renderizarLista();
}

visualizacaoGradeBtn.addEventListener("click", () => aplicarVisualizacao("grade"));
visualizacaoListaBtn.addEventListener("click", () => aplicarVisualizacao("lista"));

aplicarVisualizacao(localStorage.getItem("visualizacao") || "grade");

const TIPO_INFO = {
  erro: { label: "Erro", cor: "var(--tipo-erro-cor)", fundo: "var(--tipo-erro-fundo)" },
  script: { label: "Script", cor: "var(--tipo-script-cor)", fundo: "var(--tipo-script-fundo)" },
  procedimento: { label: "Procedimento", cor: "var(--tipo-procedimento-cor)", fundo: "var(--tipo-procedimento-fundo)" }
};

const CRITICIDADE_INFO = {
  baixa: { label: "Baixa", cor: "var(--prioridade-baixa)" },
  media: { label: "Média", cor: "var(--prioridade-media)" },
  alta: { label: "Alta", cor: "var(--prioridade-alta)" },
  critica: { label: "Crítica", cor: "var(--prioridade-critica)" }
};

const RISCO_INFO = {
  baixo: { label: "Baixo", cor: "#6b7280" },
  medio: { label: "Médio", cor: "#d97706" },
  alto: { label: "Alto", cor: "#dc2626" }
};

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

  const emLista = grade.classList.contains("solucoes-grade--lista");
  const tags = montarTags(solucao);
  const tagsVisiveis = emLista ? tags : tags.slice(0, 3);
  const tagsRestantes = emLista ? 0 : tags.length - tagsVisiveis.length;

  const tagsHtml = tagsVisiveis.map((tag) => `<span class="solucao-card__tag">${tag}</span>`).join("")
    + (tagsRestantes > 0 ? `<span class="solucao-card__tag solucao-card__tag--mais">+${tagsRestantes}</span>` : "");

  const criticidadeHtml = criticidadeInfo
    ? `<span class="criticidade-pill" style="color:${criticidadeInfo.cor};"><span class="criticidade-pill__ponto" style="background-color:${criticidadeInfo.cor};"></span>${criticidadeInfo.label}</span>`
    : "";

  card.innerHTML = `
    <div class="solucao-card__topo">
      <span class="tipo-pill" style="background-color:${tipoInfo.fundo}; color:${tipoInfo.cor};">${tipoInfo.label}</span>
      ${criticidadeHtml}
    </div>

    <h3 class="solucao-card__titulo">${solucao.titulo || "Sem título"}</h3>
    <p class="solucao-card__descricao">${solucao.erro || ""}</p>

    <div class="solucao-card__tags">${tagsHtml}</div>

    <div class="solucao-card__rodape">
      <span class="solucao-card__avatar">${iniciaisAutor(solucao.autor)}</span>
      <span class="solucao-card__autor">${solucao.autor || "Autor não informado"}</span>
      <span class="solucao-card__tempo">· Criada em ${formatarData(solucao.criado_em)}</span>
    </div>
  `;

  card.addEventListener("click", () => abrirPainel(solucao));

  return card;
}

const lightboxEl = document.getElementById("lightbox");
const lightboxImagemEl = document.getElementById("lightbox-imagem");

function abrirLightbox(src, alt) {
  lightboxImagemEl.src = src;
  lightboxImagemEl.alt = alt || "";
  lightboxEl.hidden = false;
}

function fecharLightbox() {
  lightboxEl.hidden = true;
  lightboxImagemEl.src = "";
}

lightboxEl.addEventListener("click", (event) => {
  if (event.target === lightboxEl) fecharLightbox();
});

const confirmarOverlay = document.getElementById("confirmar-overlay");
const confirmarCancelarBtn = document.getElementById("confirmar-cancelar");
const confirmarExcluirBtn = document.getElementById("confirmar-excluir");

let confirmarResolver = null;
let confirmarTimer = null;

function abrirConfirmacaoExclusao() {
  return new Promise((resolve) => {
    confirmarResolver = resolve;
    confirmarOverlay.hidden = false;

    clearInterval(confirmarTimer);
    let segundos = 5;
    confirmarExcluirBtn.disabled = true;
    confirmarExcluirBtn.textContent = `Aguarde ${segundos}s...`;

    confirmarTimer = setInterval(() => {
      segundos -= 1;
      if (segundos <= 0) {
        clearInterval(confirmarTimer);
        confirmarExcluirBtn.disabled = false;
        confirmarExcluirBtn.textContent = "Sim, excluir";
      } else {
        confirmarExcluirBtn.textContent = `Aguarde ${segundos}s...`;
      }
    }, 1000);
  });
}

function fecharConfirmacaoExclusao(resultado) {
  confirmarOverlay.hidden = true;
  clearInterval(confirmarTimer);
  if (confirmarResolver) {
    confirmarResolver(resultado);
    confirmarResolver = null;
  }
}

confirmarCancelarBtn.addEventListener("click", () => fecharConfirmacaoExclusao(false));
confirmarExcluirBtn.addEventListener("click", () => fecharConfirmacaoExclusao(true));
confirmarOverlay.addEventListener("click", (event) => {
  if (event.target === confirmarOverlay) fecharConfirmacaoExclusao(false);
});

const painelOverlay = document.getElementById("painel-overlay");
const painelEl = document.getElementById("painel");
const painelTipoEl = document.getElementById("painel-tipo");
const painelModuloEl = document.getElementById("painel-modulo");
const painelCorpoEl = document.getElementById("painel-corpo");
const painelErroEl = document.getElementById("painel-erro");
const painelEditarBtn = document.getElementById("painel-editar");
const painelExcluirBtn = document.getElementById("painel-excluir");
const painelExpandirBtn = document.getElementById("painel-expandir");
const painelFecharBtn = document.getElementById("painel-fechar");
const painelBaixarBtn = document.getElementById("painel-baixar-pdf");

let solucaoAberta = null;

function formatarData(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleDateString("pt-BR");
}

function renderizarGaleriaPasso(imagens) {
  if (!imagens || imagens.length === 0) return "";
  const itens = imagens.map((img) => `<img class="painel-passo__imagem" src="${img.url}" alt="${img.nome || "Imagem do passo"}">`).join("");
  return `<div class="painel-passo__galeria">${itens}</div>`;
}

function renderizarCorpoErro(solucao) {
  const passos = solucao.passos || [];
  const passosHtml = passos.length === 0
    ? "<p class=\"painel__vazio-secao\">Nenhum passo cadastrado.</p>"
    : passos.map((passo) => `
        <div class="painel-passo">
          <span class="painel-passo__numero">${passo.ordem}</span>
          <div class="painel-passo__conteudo">
            <p class="painel-passo__texto">${passo.texto || ""}</p>
            ${renderizarGaleriaPasso(passo.imagens)}
          </div>
        </div>
      `).join("");

  return `
    <div class="painel__secao">
      <span class="painel__secao-titulo">Solução</span>
      <div class="painel-passos">${passosHtml}</div>
    </div>
  `;
}

function renderizarCorpoScript(solucao) {
  const parametros = solucao.parametros || [];
  const parametrosHtml = parametros.length === 0
    ? ""
    : `
      <div class="painel__secao">
        <span class="painel__secao-titulo">Parâmetros a substituir</span>
        <div class="painel-parametros">
          ${parametros.map((p) => `
            <div class="painel-parametro">
              <code class="painel-parametro__nome">${p.nome}</code>
              <span class="painel-parametro__desc">${p.descricao}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;

  const riscoInfo = RISCO_INFO[solucao.risco];

  return `
    <div class="painel__secao">
      <span class="painel__secao-titulo">Código</span>
      <pre class="painel-codigo"><code>${(solucao.codigo || "").replace(/</g, "&lt;")}</code></pre>
    </div>

    ${parametrosHtml}

    <div class="painel__grid-2">
      <div>
        <span class="painel__campo-label">Nível de risco</span>
        <p class="painel__campo-valor" style="color:${riscoInfo?.cor || "inherit"};">${riscoInfo?.label || "Não informado"}</p>
      </div>
      <div>
        <span class="painel__campo-label">Reversível</span>
        <p class="painel__campo-valor">${solucao.reversivel ? "Sim" : "Não"}</p>
      </div>
    </div>

    ${solucao.resultado_esperado ? `
      <div class="painel__secao">
        <span class="painel__secao-titulo">Resultado esperado</span>
        <p class="painel__texto">${solucao.resultado_esperado}</p>
      </div>
    ` : ""}
  `;
}

function renderizarRelacionadasPainel(relacionadas) {
  if (!relacionadas || relacionadas.length === 0) return "";

  const itens = relacionadas
    .map((id) => solucoesTodas.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => `<button type="button" class="painel-relacionada" data-id="${s.id}">${s.titulo || "Sem título"}</button>`)
    .join("");

  if (!itens) return "";

  return `
    <div class="painel__secao">
      <span class="painel__secao-titulo">Soluções relacionadas</span>
      <div class="painel-relacionadas">${itens}</div>
    </div>
  `;
}

function renderizarAnexosPainel(anexos) {
  if (!anexos || anexos.length === 0) return "";
  const itens = anexos.map((anexo) => `<li><a href="${anexo.url}" target="_blank" rel="noopener">${anexo.nome}</a></li>`).join("");
  return `
    <div class="painel__secao">
      <span class="painel__secao-titulo">Anexos</span>
      <ul class="painel-anexos">${itens}</ul>
    </div>
  `;
}

function abrirPainel(solucao) {
  solucaoAberta = solucao;
  painelErroEl.textContent = "";

  const tipoInfo = TIPO_INFO[solucao.tipo] || { label: solucao.tipo || "—", cor: "#6b7280", fundo: "#f2f3f5" };
  const criticidadeInfo = CRITICIDADE_INFO[solucao.criticidade];
  const sintomas = solucao.sintomas || [];
  const tabelasCampos = solucao.tabelas_campos || [];

  painelTipoEl.textContent = tipoInfo.label;
  painelTipoEl.style.backgroundColor = tipoInfo.fundo;
  painelTipoEl.style.color = tipoInfo.cor;
  painelModuloEl.textContent = solucao.modulo || "";
  painelModuloEl.hidden = !solucao.modulo;

  const corpoTipo = solucao.tipo === "script" ? renderizarCorpoScript(solucao) : renderizarCorpoErro(solucao);

  painelCorpoEl.innerHTML = `
    <h2 class="painel__titulo">${solucao.titulo || "Sem título"}</h2>
    <p class="painel__descricao">${solucao.erro || ""}</p>

    <div class="painel__info-grid">
      <div>
        <span class="painel__campo-label">Prioridade</span>
        <p class="painel__campo-valor" style="color:${criticidadeInfo?.cor || "inherit"};">${criticidadeInfo?.label || "Não informado"}</p>
      </div>
      <div>
        <span class="painel__campo-label">Categoria</span>
        <p class="painel__campo-valor">${solucao.categoria || "Não informado"}</p>
      </div>
      <div>
        <span class="painel__campo-label">Autor</span>
        <p class="painel__campo-valor">${solucao.autor || "Não informado"}</p>
      </div>
      <div>
        <span class="painel__campo-label">Criado em</span>
        <p class="painel__campo-valor">${formatarData(solucao.criado_em)}</p>
      </div>
    </div>

    ${corpoTipo}

    ${sintomas.length > 0 ? `
      <div class="painel__secao">
        <span class="painel__secao-titulo">Sintomas e palavras-chave</span>
        <div class="painel-tags">${sintomas.map((t) => `<span class="solucao-card__tag">${t}</span>`).join("")}</div>
      </div>
    ` : ""}

    ${tabelasCampos.length > 0 ? `
      <div class="painel__secao">
        <span class="painel__secao-titulo">Tabelas e campos envolvidos</span>
        <div class="painel-tags">${tabelasCampos.map((t) => `<span class="solucao-card__tag">${t}</span>`).join("")}</div>
      </div>
    ` : ""}

    ${renderizarAnexosPainel(solucao.anexos)}

    ${renderizarRelacionadasPainel(solucao.relacionadas)}
  `;

  painelOverlay.hidden = false;
  document.body.style.overflow = "hidden";

  const url = new URL(window.location.href);
  url.searchParams.set("id", solucao.id);
  window.history.replaceState({}, "", url);
}

function fecharPainel() {
  painelOverlay.hidden = true;
  painelEl.classList.remove("painel--expandido");
  document.body.style.overflow = "";
  solucaoAberta = null;

  const url = new URL(window.location.href);
  url.searchParams.delete("id");
  window.history.replaceState({}, "", url);
}

painelFecharBtn.addEventListener("click", fecharPainel);

painelEditarBtn.addEventListener("click", () => {
  if (!solucaoAberta) return;
  window.location.href = `nova-solucao.html?id=${solucaoAberta.id}`;
});

painelExcluirBtn.addEventListener("click", async () => {
  if (!solucaoAberta) return;
  const confirmado = await abrirConfirmacaoExclusao();
  if (!confirmado) return;

  painelErroEl.textContent = "";
  painelExcluirBtn.disabled = true;
  const { error } = await supabase.from("solucoes").delete().eq("id", solucaoAberta.id);
  painelExcluirBtn.disabled = false;

  if (error) {
    console.error("Erro ao excluir solução:", error);
    painelErroEl.textContent = "Não foi possível excluir. Verifique as permissões da tabela no Supabase.";
    return;
  }

  const idExcluido = solucaoAberta.id;
  solucoesTodas = solucoesTodas.filter((s) => s.id !== idExcluido);
  fecharPainel();
  renderizarLista();
  contagemEl.textContent = `${solucoesTodas.length.toLocaleString("pt-BR")} soluções cadastradas`;
});

painelOverlay.addEventListener("click", (event) => {
  if (event.target === painelOverlay) fecharPainel();
});

painelExpandirBtn.addEventListener("click", () => {
  painelEl.classList.toggle("painel--expandido");
});

function nomeArquivoPdf(titulo) {
  const base = (titulo || "solucao")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `${base || "solucao"}.pdf`;
}

async function carregarImagemBase64(url) {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`Resposta ${resposta.status}`);
    const blob = await resposta.blob();
    return await new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onloadend = () => resolve(leitor.result);
      leitor.onerror = () => reject(new Error("Falha ao ler imagem"));
      leitor.readAsDataURL(blob);
    });
  } catch (erro) {
    console.error("Não foi possível carregar imagem para o PDF:", url, erro);
    return null;
  }
}

function medirImagem(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.naturalWidth || 4, altura: img.naturalHeight || 3 });
    img.onerror = () => resolve({ largura: 4, altura: 3 });
    img.src = dataUrl;
  });
}

function formatoDaDataUrl(dataUrl) {
  const match = /^data:image\/(\w+);base64,/.exec(dataUrl);
  if (!match) return "JPEG";
  const tipo = match[1].toUpperCase();
  return tipo === "JPG" ? "JPEG" : tipo;
}

async function baixarPdfSolucao(solucao) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const margem = 18;
  const larguraUtil = 210 - margem * 2;
  const corMarca = [232, 78, 14];
  const corTexto = [30, 30, 30];
  const corTextoSuave = [120, 120, 120];
  let y = 20;

  function avancar(altura) {
    y += altura;
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
  }

  function garantirEspaco(altura) {
    if (y + altura > 285) {
      doc.addPage();
      y = 20;
    }
  }

  function secaoTitulo(texto) {
    garantirEspaco(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...corMarca);
    doc.text(texto.toUpperCase(), margem, y);
    avancar(2);
    doc.setDrawColor(...corMarca);
    doc.setLineWidth(0.4);
    doc.line(margem, y, margem + larguraUtil, y);
    avancar(6);
  }

  function paragrafo(texto, tamanho = 10, fonte = "helvetica") {
    if (!texto) return;
    doc.setFont(fonte, "normal");
    doc.setFontSize(tamanho);
    doc.setTextColor(...corTexto);
    doc.splitTextToSize(texto, larguraUtil).forEach((linha) => {
      garantirEspaco(tamanho / 1.8);
      doc.text(linha, margem, y);
      avancar(tamanho / 1.8);
    });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...corTexto);
  doc.splitTextToSize(solucao.titulo || "Sem título", larguraUtil).forEach((linha) => {
    doc.text(linha, margem, y);
    avancar(8);
  });
  avancar(2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...corTextoSuave);
  doc.text(`${solucao.autor || "Autor não informado"}  ·  ${formatarData(solucao.criado_em)}`, margem, y);
  avancar(4);

  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(margem, y, margem + larguraUtil, y);
  avancar(8);

  const codigo = solucao.tipo === "script" ? solucao.codigo : solucao.codigo_erro;
  if (codigo) {
    secaoTitulo(solucao.tipo === "script" ? "Código" : "Código ou mensagem de erro");
    paragrafo(codigo, 9, "courier");
    avancar(4);
  }

  const passos = solucao.passos || [];
  if (passos.length > 0) {
    secaoTitulo("Passo a passo da solução");

    for (const passo of passos) {
      garantirEspaco(6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...corMarca);
      doc.text(`${passo.ordem}.`, margem, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...corTexto);
      const linhasTexto = doc.splitTextToSize(passo.texto || "", larguraUtil - 8);
      linhasTexto.forEach((linha, indice) => {
        garantirEspaco(5);
        doc.text(linha, margem + 8, y);
        if (indice < linhasTexto.length - 1) avancar(5);
      });
      avancar(6);

      const imagens = passo.imagens || [];
      if (imagens.length > 0) {
        let x = margem + 8;
        const larguraMaxImg = 55;
        const alturaMaxImg = 42;
        let maiorAlturaLinha = 0;

        for (const imagem of imagens) {
          const dataUrl = await carregarImagemBase64(imagem.url);
          if (!dataUrl) continue;

          const { largura, altura } = await medirImagem(dataUrl);
          let larguraImg = larguraMaxImg;
          let alturaImg = (altura / largura) * larguraImg;
          if (alturaImg > alturaMaxImg) {
            alturaImg = alturaMaxImg;
            larguraImg = (largura / altura) * alturaImg;
          }

          if (x + larguraImg > margem + larguraUtil) {
            x = margem + 8;
            avancar(maiorAlturaLinha + 4);
            maiorAlturaLinha = 0;
          }

          garantirEspaco(alturaImg + 4);

          try {
            doc.addImage(dataUrl, formatoDaDataUrl(dataUrl), x, y, larguraImg, alturaImg);
          } catch (erro) {
            console.error("Não foi possível inserir imagem no PDF:", erro);
          }

          x += larguraImg + 4;
          maiorAlturaLinha = Math.max(maiorAlturaLinha, alturaImg);
        }

        avancar(maiorAlturaLinha + 8);
      } else {
        avancar(4);
      }
    }

    avancar(2);
  }

  if ((solucao.sintomas || []).length > 0) {
    secaoTitulo("Palavras-chave");
    paragrafo(solucao.sintomas.join(", "));
    avancar(4);
  }

  if ((solucao.tabelas_campos || []).length > 0) {
    secaoTitulo("Tabelas e campos envolvidos");
    paragrafo(solucao.tabelas_campos.join(", "));
    avancar(4);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...corTextoSuave);
  doc.text("Base de Soluções — Gasômetro Madeiras", margem, 290);

  doc.save(nomeArquivoPdf(solucao.titulo));
}

painelBaixarBtn.addEventListener("click", async () => {
  if (!solucaoAberta) return;

  if (!window.jspdf) {
    console.error("Biblioteca de geração de PDF não carregou.");
    return;
  }

  const textoOriginal = painelBaixarBtn.textContent;
  painelBaixarBtn.disabled = true;
  painelBaixarBtn.textContent = "Gerando PDF...";

  try {
    await baixarPdfSolucao(solucaoAberta);
  } catch (erro) {
    console.error("Erro ao gerar PDF:", erro);
  } finally {
    painelBaixarBtn.disabled = false;
    painelBaixarBtn.textContent = textoOriginal;
  }
});

painelCorpoEl.addEventListener("click", (event) => {
  if (event.target.classList.contains("painel-passo__imagem")) {
    abrirLightbox(event.target.src, event.target.alt);
  }
  if (event.target.classList.contains("painel-relacionada")) {
    const alvo = solucoesTodas.find((s) => s.id === event.target.dataset.id);
    if (alvo) abrirPainel(alvo);
  }
});

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
  categoria: "Categoria",
  criticidade: "Prioridade",
  autor: "Autor",
  periodo: "Período"
};

function obterFiltrosAtivos() {
  return {
    tipo: filtroTipo.value,
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
    filtrosChipsEl.innerHTML = "";
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
        ? `Prioridade · ${CRITICIDADE_INFO[valor]?.label || valor}`
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
    if (filtros.categoria && solucao.categoria !== filtros.categoria) return false;
    if (filtros.criticidade && solucao.criticidade !== filtros.criticidade) return false;
    if (filtros.autor && solucao.autor !== filtros.autor) return false;

    if (filtros.periodo) {
      const diasLimite = Number(filtros.periodo);
      const diffDias = (Date.now() - new Date(solucao.criado_em).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > diasLimite) return false;
    }

    if (termo) {
      const termos = termo.split(/\s+/).filter(Boolean);
      const alvo = [
        solucao.titulo, solucao.erro, solucao.categoria, solucao.modulo,
        ...(Array.isArray(solucao.sintomas) ? solucao.sintomas : []),
        ...(Array.isArray(solucao.tabelas_campos) ? solucao.tabelas_campos : [])
      ].filter(Boolean).join(" ").toLowerCase();
      if (!termos.every((t) => alvo.includes(t))) return false;
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

  const idNaUrl = new URLSearchParams(window.location.search).get("id");
  if (idNaUrl) {
    const solucao = solucoesTodas.find((s) => s.id === idNaUrl);
    if (solucao) abrirPainel(solucao);
  }
}

carregarContagemESolucoes();
carregarSelectDaTabela("categorias", filtroCategoria);

[filtroTipo, filtroCategoria, filtroCriticidade, filtroAutor, filtroPeriodo].forEach((select) => {
  select.addEventListener("change", renderizarLista);
});

buscaInput.addEventListener("input", renderizarLista);

filtrosLimparBtn.addEventListener("click", () => {
  [filtroTipo, filtroCategoria, filtroCriticidade, filtroAutor, filtroPeriodo].forEach((select) => {
    select.value = "";
  });
  renderizarLista();
});

ordenarBtn.addEventListener("click", () => {
  ordenacao = ordenacao === "recentes" ? "antigas" : "recentes";
  ordenarTexto.textContent = ordenacao === "recentes" ? "Mais recentes" : "Mais antigas";
  renderizarLista();
});
