import { supabase } from "./supabase-config.js";

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

function comLimiteDeTempo(promessa, segundos) {
  return Promise.race([
    promessa,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Tempo esgotado ao enviar arquivo.")), segundos * 1000);
    })
  ]);
}

async function enviarArquivo(solucaoId, nomeArquivo, arquivo) {
  const caminho = `${solucaoId}/${nomeArquivo}`;

  const { error } = await comLimiteDeTempo(
    supabase.storage.from("solucoes").upload(caminho, arquivo),
    15
  );
  if (error) throw error;

  const { data } = supabase.storage.from("solucoes").getPublicUrl(caminho);
  return data.publicUrl;
}

async function montarPassos(solucaoId) {
  const passosEl = Array.from(passosContainer.querySelectorAll(".passo"));

  return Promise.all(passosEl.map(async (passoEl, i) => {
    const zonaEl = passoEl.querySelector(".passo__imagem-zone");
    const arquivosImagem = zonaEl._imagens || [];

    const imagens = await Promise.all(arquivosImagem.map(async (arquivo, j) => {
      const nomeArquivo = `passo-${i + 1}-${j + 1}-${arquivo.name || "colada.png"}`;
      const url = await enviarArquivo(solucaoId, nomeArquivo, arquivo);
      return { nome: arquivo.name || nomeArquivo, url };
    }));

    return {
      ordem: i + 1,
      acao: passoEl.querySelector(".passo__acao").value.trim(),
      comoFazer: passoEl.querySelector(".passo__como").value.trim(),
      imagens
    };
  }));
}

async function enviarAnexos(solucaoId, arquivos) {
  return Promise.all(arquivos.map(async (arquivo) => {
    const url = await enviarArquivo(solucaoId, arquivo.name, arquivo);
    return { nome: arquivo.name, url };
  }));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  mostrarStatus("", null);
  submitBtn.disabled = true;
  submitBtn.textContent = "Salvando...";

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const solucaoId = crypto.randomUUID();

    const arquivos = Array.from(anexosInput.files);

    const [passos, anexos] = await Promise.all([
      montarPassos(solucaoId),
      enviarAnexos(solucaoId, arquivos)
    ]);

    const { error } = await supabase.from("solucoes").insert({
      id: solucaoId,
      titulo: tituloInput.value.trim(),
      erro: erroInput.value.trim(),
      autor: autorInput.value.trim(),
      passos,
      anexos,
      criado_por: user.id
    });

    if (error) throw error;

    window.location.href = "solucoes.html";
    return;
  } catch (erro) {
    mostrarStatus("Não foi possível salvar a solução. Tente novamente.", "erro");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar solução";
  }
});
