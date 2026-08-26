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
const passoAPassoInput = document.getElementById("passo-a-passo");
const anexosInput = document.getElementById("anexos");
const autorInput = document.getElementById("autor");
const statusEl = document.getElementById("form-status");
const submitBtn = document.getElementById("form-submit");

function mostrarStatus(mensagem, tipo) {
  statusEl.textContent = mensagem;
  statusEl.className = "form-status" + (tipo ? ` form-status--${tipo}` : "");
}

async function enviarAnexos(solucaoId, arquivos) {
  const anexos = [];

  for (const arquivo of arquivos) {
    const arquivoRef = ref(storage, `solucoes/${solucaoId}/${arquivo.name}`);
    await uploadBytes(arquivoRef, arquivo);
    const url = await getDownloadURL(arquivoRef);
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
      passoAPasso: passoAPassoInput.value.trim(),
      autor: autorInput.value.trim(),
      anexos: [],
      criadoPor: auth.currentUser.uid,
      criadoEm: serverTimestamp()
    });

    const arquivos = Array.from(anexosInput.files);
    if (arquivos.length > 0) {
      mostrarStatus("Enviando anexos...", null);
      const anexos = await enviarAnexos(docRef.id, arquivos);
      await updateDoc(docRef, { anexos });
    }

    mostrarStatus("Solução salva com sucesso.", "sucesso");
    form.reset();
  } catch (erro) {
    mostrarStatus("Não foi possível salvar a solução. Tente novamente.", "erro");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar solução";
  }
});
