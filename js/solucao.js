import { supabase } from "./supabase-config.js";

const conteudoEl = document.getElementById("solucao-conteudo");

function formatarData(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString("pt-BR");
}

function renderizarGaleria(imagens) {
  if (!imagens || imagens.length === 0) return "";

  const itens = imagens
    .map((img) => `
      <img class="solucao-passo__imagem" src="${img.url}" alt="${img.nome || "Imagem do passo"}">
    `)
    .join("");

  return `<div class="solucao-passo__galeria">${itens}</div>`;
}

function renderizarPassos(passos) {
  if (!passos || passos.length === 0) {
    return "<p>Nenhum passo cadastrado.</p>";
  }

  return passos
    .map((passo) => `
      <div class="solucao-passo">
        <div class="solucao-passo__header">
          <span class="passo__numero">${passo.ordem}</span>
          <h3 class="solucao-passo__acao">${passo.acao || ""}</h3>
        </div>
        <p class="solucao-passo__como">${passo.comoFazer || ""}</p>
        ${renderizarGaleria(passo.imagens)}
      </div>
    `)
    .join("");
}

function renderizarAnexos(anexos) {
  if (!anexos || anexos.length === 0) return "";

  const itens = anexos
    .map((anexo) => `<li><a href="${anexo.url}" target="_blank" rel="noopener">${anexo.nome}</a></li>`)
    .join("");

  return `
    <div class="form-group form-group--full">
      <label class="form-label">Anexos</label>
      <ul class="solucao-anexos">${itens}</ul>
    </div>
  `;
}

function renderizarSolucao(dados) {
  conteudoEl.innerHTML = `
    <div class="form-card">
      <div class="solucao-detalhe__header">
        <h1 class="page__title">${dados.titulo || "Sem título"}</h1>
        <a class="btn-secundario" href="nova-solucao.html?id=${dados.id}">Editar solução</a>
      </div>

      <div class="form-group">
        <label class="form-label">Autor</label>
        <p>${dados.autor || "Não informado"}</p>
      </div>

      <div class="form-group">
        <label class="form-label">Data</label>
        <p>${formatarData(dados.criado_em)}</p>
      </div>

      <div class="form-group form-group--full">
        <label class="form-label">Erro</label>
        <p>${dados.erro || ""}</p>
      </div>

      <div class="form-group form-group--full">
        <label class="form-label">Passo a passo</label>
        <div class="solucao-passos">${renderizarPassos(dados.passos)}</div>
      </div>

      ${renderizarAnexos(dados.anexos)}
    </div>
  `;
}

const lightboxEl = document.getElementById("lightbox");
const lightboxImgEl = document.getElementById("lightbox-img");

function abrirLightbox(url, alt) {
  lightboxImgEl.src = url;
  lightboxImgEl.alt = alt || "Imagem ampliada";
  lightboxEl.hidden = false;
  document.body.style.overflow = "hidden";
}

function fecharLightbox() {
  lightboxEl.hidden = true;
  lightboxImgEl.src = "";
  document.body.style.overflow = "";
}

conteudoEl.addEventListener("click", (event) => {
  if (event.target.classList.contains("solucao-passo__imagem")) {
    abrirLightbox(event.target.src, event.target.alt);
  }
});

lightboxEl.addEventListener("click", (event) => {
  if (event.target === lightboxEl) {
    fecharLightbox();
  }
});

async function carregarSolucao() {
  const id = new URLSearchParams(window.location.search).get("id");

  if (!id) {
    conteudoEl.innerHTML = "<p>Solução não encontrada.</p>";
    return;
  }

  const { data, error } = await supabase
    .from("solucoes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    conteudoEl.innerHTML = "<p>Solução não encontrada.</p>";
    return;
  }

  renderizarSolucao(data);
}

carregarSolucao();
