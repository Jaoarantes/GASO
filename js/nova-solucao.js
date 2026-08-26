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

function mostrarImagemNaZona(zonaEl, arquivo) {
  const preview = zonaEl.querySelector(".passo__imagem-preview");
  const dica = zonaEl.querySelector(".passo__imagem-dica");
  const icone = zonaEl.querySelector(".passo__imagem-icone");
  preview.src = URL.createObjectURL(arquivo);
  preview.hidden = false;
  icone.hidden = true;
  dica.textContent = arquivo.name || "Imagem colada";
  zonaEl._imagemArquivo = arquivo;
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
      <label class="form-label">Imagem</label>
      <div class="passo__imagem-zone" tabindex="0">
        <svg class="passo__imagem-icone" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <circle cx="8.5" cy="9.5" r="1.5"/>
          <path d="M21 15l-5-5-9 9"/>
        </svg>
        <p class="passo__imagem-dica">Cole uma imagem com Ctrl+V ou</p>
        <button class="btn-secundario passo__imagem-btn" type="button">Selecionar imagem</button>
        <img class="passo__imagem-preview" hidden alt="Prévia da imagem do passo">
        <input class="passo__imagem-input" type="file" accept="image/*" hidden>
      </div>
    </div>
  `;

  const zonaEl = passoEl.querySelector(".passo__imagem-zone");
  const inputImagemEl = passoEl.querySelector(".passo__imagem-input");
  const selecionarBtn = passoEl.querySelector(".passo__imagem-btn");

  selecionarBtn.addEventListener("click", () => inputImagemEl.click());

  inputImagemEl.addEventListener("change", () => {
    const arquivo = inputImagemEl.files[0];
    if (arquivo) mostrarImagemNaZona(zonaEl, arquivo);
  });

  zonaEl.addEventListener("paste", (event) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const arquivo = item.getAsFile();
    mostrarImagemNaZona(zonaEl, arquivo);
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
    const arquivo = zonaEl._imagemArquivo;

    let imagemUrl = null;
    if (arquivo) {
      const nomeArquivo = `passo-${i + 1}-${arquivo.name || "colada.png"}`;
      imagemUrl = await enviarArquivo(solucaoId, nomeArquivo, arquivo);
    }

    passos.push({
      ordem: i + 1,
      acao: passoEl.querySelector(".passo__acao").value.trim(),
      comoFazer: passoEl.querySelector(".passo__como").value.trim(),
      imagemUrl
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
    passosContainer.querySelectorAll(".passo").forEach((passoEl) => passoEl.remove());
    criarPasso();
  } catch (erro) {
    mostrarStatus("Não foi possível salvar a solução. Tente novamente.", "erro");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar solução";
  }
});
