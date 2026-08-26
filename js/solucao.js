import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const conteudoEl = document.getElementById("solucao-conteudo");

function formatarData(timestamp) {
  if (!timestamp) return "";
  return timestamp.toDate().toLocaleDateString("pt-BR");
}

function renderizarGaleria(imagens) {
  if (!imagens || imagens.length === 0) return "";

  const itens = imagens
    .map((img) => `
      <a href="${img.url}" target="_blank" rel="noopener">
        <img class="solucao-passo__imagem" src="${img.url}" alt="${img.nome || "Imagem do passo"}">
      </a>
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
      <h1 class="page__title">${dados.titulo || "Sem título"}</h1>

      <div class="form-group">
        <label class="form-label">Autor</label>
        <p>${dados.autor || "Não informado"}</p>
      </div>

      <div class="form-group">
        <label class="form-label">Data</label>
        <p>${formatarData(dados.criadoEm)}</p>
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

async function carregarSolucao() {
  const id = new URLSearchParams(window.location.search).get("id");

  if (!id) {
    conteudoEl.innerHTML = "<p>Solução não encontrada.</p>";
    return;
  }

  const snapshot = await getDoc(doc(db, "solucoes", id));

  if (!snapshot.exists()) {
    conteudoEl.innerHTML = "<p>Solução não encontrada.</p>";
    return;
  }

  renderizarSolucao(snapshot.data());
}

carregarSolucao();
