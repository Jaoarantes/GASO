import { auth, db, storage } from "./firebase-config.js";
import {
  collection,
  addDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

const form = document.getElementById("nova-solucao-form");
const tituloInput = document.getElementById("titulo");
const erroInput = document.getElementById("erro");
const anexosInput = document.getElementById("anexos");
const anexosBtn = document.getElementById("anexos-btn");
const anexosLista = document.getElementById("anexos-lista");
const autorInput = document.getElementById("autor");
const statusEl = document.getElementById("form-status");
const submitBtn = document.getElementById("form-submit");
const passosContainer = document.getElementById("passos-container");
const addPassoBtn = document.getElementById("add-passo");

function mostrarStatus(mensagem, tipo) {
  statusEl.textContent = mensagem;
  statusEl.className = "form-status" + (tipo ? ` form-status--${tipo}` : "");
}

function renumerarPassos() {
  passosContainer.querySelectorAll(".passo").forEach((passoEl, indice) => {
    passoEl.querySelector(".passo__numero").textContent = indice + 1;
  });
}

function ajustarAltura(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function atualizarListaImagens(zonaEl) {
  const listaEl = zonaEl.querySelector(".passo__imagem-lista");
  const imagens = zonaEl._imagens;

  listaEl.innerHTML = "";
  imagens.forEach((arquivo, indice) => {
    const item = document.createElement("div");
    item.className = "passo__imagem-item";

    const preview = document.createElement("img");
    preview.className = "passo__imagem-preview";
    preview.src = URL.createObjectURL(arquivo);
    preview.alt = arquivo.name || `Imagem ${indice + 1}`;

    const removerBtn = document.createElement("button");
    removerBtn.type = "button";
    removerBtn.className = "passo__imagem-item-remover";
    removerBtn.setAttribute("aria-label", "Remover imagem");
    removerBtn.textContent = "×";
    removerBtn.addEventListener("click", () => {
      imagens.splice(indice, 1);
      atualizarListaImagens(zonaEl);
    });

    item.appendChild(preview);
    item.appendChild(removerBtn);
    listaEl.appendChild(item);
  });
}

function adicionarImagens(zonaEl, novosArquivos) {
  zonaEl._imagens.push(...novosArquivos);
  atualizarListaImagens(zonaEl);
}

function criarPasso() {
  const passoEl = document.createElement("div");
  passoEl.className = "passo";
  passoEl.innerHTML = `
    <div class="passo__header">
      <span class="passo__numero"></span>
      <button class="passo__remover" type="button">Remover</button>
    </div>
    <div class="passo__campo">
      <label class="form-label">Ação</label>
      <input class="form-input passo__acao" type="text" placeholder="Ex: Baixar o documento">
    </div>
    <div class="passo__campo">
      <label class="form-label">Como fazer</label>
      <textarea class="form-textarea passo__como" rows="3" placeholder="Descreva como realizar essa ação"></textarea>
    </div>
    <div class="passo__campo">
      <label class="form-label">Imagens</label>
      <div class="passo__imagem-zone">
        <button class="btn-secundario passo__imagem-btn" type="button">Adicionar imagem</button>
        <div class="passo__imagem-lista"></div>
        <input class="passo__imagem-input" type="file" accept="image/*" multiple hidden>
      </div>
    </div>
  `;

  const zonaEl = passoEl.querySelector(".passo__imagem-zone");
  const inputImagemEl = passoEl.querySelector(".passo__imagem-input");
  const selecionarBtn = passoEl.querySelector(".passo__imagem-btn");
  zonaEl._imagens = [];
  atualizarListaImagens(zonaEl);

  const comoInput = passoEl.querySelector(".passo__como");
  comoInput.addEventListener("input", () => ajustarAltura(comoInput));

  comoInput.addEventListener("paste", (event) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    adicionarImagens(zonaEl, [item.getAsFile()]);
  });

  selecionarBtn.addEventListener("click", () => inputImagemEl.click());

  inputImagemEl.addEventListener("change", () => {
    adicionarImagens(zonaEl, Array.from(inputImagemEl.files));
    inputImagemEl.value = "";
  });

  passoEl.querySelector(".passo__remover").addEventListener("click", () => {
    passoEl.remove();
    renumerarPassos();
  });

  passosContainer.insertBefore(passoEl, addPassoBtn);
  renumerarPassos();
}

addPassoBtn.addEventListener("click", criarPasso);
criarPasso();

anexosBtn.addEventListener("click", () => anexosInput.click());

anexosInput.addEventListener("change", () => {
  const arquivos = Array.from(anexosInput.files);
  anexosLista.textContent = arquivos.length > 0
    ? arquivos.map((arquivo) => arquivo.name).join(", ")
    : "Nenhum arquivo selecionado";
});

async function enviarArquivo(solucaoId, nomeArquivo, arquivo) {
  const arquivoRef = ref(storage, `solucoes/${solucaoId}/${nomeArquivo}`);
  await uploadBytes(arquivoRef, arquivo);
  return getDownloadURL(arquivoRef);
}

async function montarPassos(solucaoId) {
  const passosEl = Array.from(passosContainer.querySelectorAll(".passo"));
  const passos = [];

  for (let i = 0; i < passosEl.length; i++) {
    const passoEl = passosEl[i];
    const zonaEl = passoEl.querySelector(".passo__imagem-zone");
    const arquivosImagem = zonaEl._imagens || [];

    const imagens = [];
    for (let j = 0; j < arquivosImagem.length; j++) {
      const arquivo = arquivosImagem[j];
      const nomeArquivo = `passo-${i + 1}-${j + 1}-${arquivo.name || "colada.png"}`;
      const url = await enviarArquivo(solucaoId, nomeArquivo, arquivo);
      imagens.push({ nome: arquivo.name || nomeArquivo, url });
    }

    passos.push({
      ordem: i + 1,
      acao: passoEl.querySelector(".passo__acao").value.trim(),
      comoFazer: passoEl.querySelector(".passo__como").value.trim(),
      imagens
    });
  }

  return passos;
}

async function enviarAnexos(solucaoId, arquivos) {
  const anexos = [];

  for (const arquivo of arquivos) {
    const url = await enviarArquivo(solucaoId, arquivo.name, arquivo);
    anexos.push({ nome: arquivo.name, url });
  }

  return anexos;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  mostrarStatus("", null);
  submitBtn.disabled = true;
  submitBtn.textContent = "Salvando...";

  try {
    const docRef = await addDoc(collection(db, "solucoes"), {
      titulo: tituloInput.value.trim(),
      erro: erroInput.value.trim(),
      autor: autorInput.value.trim(),
      passos: [],
      anexos: [],
      criadoPor: auth.currentUser.uid,
      criadoEm: serverTimestamp()
    });

    mostrarStatus("Enviando imagens dos passos...", null);
    const passos = await montarPassos(docRef.id);

    const arquivos = Array.from(anexosInput.files);
    let anexos = [];
    if (arquivos.length > 0) {
      mostrarStatus("Enviando anexos...", null);
      anexos = await enviarAnexos(docRef.id, arquivos);
    }

    await updateDoc(docRef, { passos, anexos });

    mostrarStatus("Solução salva com sucesso.", "sucesso");
    form.reset();
    anexosLista.textContent = "Nenhum arquivo selecionado";
    passosContainer.querySelectorAll(".passo").forEach((passoEl) => passoEl.remove());
    criarPasso();
  } catch (erro) {
    mostrarStatus("Não foi possível salvar a solução. Tente novamente.", "erro");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar solução";
  }
});
