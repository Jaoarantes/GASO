import { supabase } from "./supabase-config.js";

const solucaoIdEdicao = new URLSearchParams(window.location.search).get("id");

const form = document.getElementById("nova-solucao-form");
const pageTitleEl = document.getElementById("page-titulo");
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

function criarItemImagem(src, alt, aoRemover) {
  const item = document.createElement("div");
  item.className = "passo__imagem-item";

  const preview = document.createElement("img");
  preview.className = "passo__imagem-preview";
  preview.src = src;
  preview.alt = alt || "Imagem";

  const removerBtn = document.createElement("button");
  removerBtn.type = "button";
  removerBtn.className = "passo__imagem-item-remover";
  removerBtn.setAttribute("aria-label", "Remover imagem");
  removerBtn.textContent = "×";
  removerBtn.addEventListener("click", aoRemover);

  item.appendChild(preview);
  item.appendChild(removerBtn);
  return item;
}

function atualizarListaImagens(zonaEl) {
  const listaEl = zonaEl.querySelector(".passo__imagem-lista");
  listaEl.innerHTML = "";

  zonaEl._imagensExistentes.forEach((imagem, indice) => {
    listaEl.appendChild(criarItemImagem(imagem.url, imagem.nome, () => {
      zonaEl._imagensExistentes.splice(indice, 1);
      atualizarListaImagens(zonaEl);
    }));
  });

  zonaEl._imagensNovas.forEach((arquivo, indice) => {
    listaEl.appendChild(criarItemImagem(URL.createObjectURL(arquivo), arquivo.name, () => {
      zonaEl._imagensNovas.splice(indice, 1);
      atualizarListaImagens(zonaEl);
    }));
  });
}

function adicionarImagens(zonaEl, novosArquivos) {
  zonaEl._imagensNovas.push(...novosArquivos);
  atualizarListaImagens(zonaEl);
}

function criarPasso(dadosIniciais = {}) {
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

  const acaoInput = passoEl.querySelector(".passo__acao");
  const comoInput = passoEl.querySelector(".passo__como");
  acaoInput.value = dadosIniciais.acao || "";
  comoInput.value = dadosIniciais.comoFazer || "";

  const zonaEl = passoEl.querySelector(".passo__imagem-zone");
  const inputImagemEl = passoEl.querySelector(".passo__imagem-input");
  const selecionarBtn = passoEl.querySelector(".passo__imagem-btn");
  zonaEl._imagensExistentes = dadosIniciais.imagens ? [...dadosIniciais.imagens] : [];
  zonaEl._imagensNovas = [];
  atualizarListaImagens(zonaEl);

  comoInput.addEventListener("input", () => ajustarAltura(comoInput));
  if (dadosIniciais.comoFazer) {
    requestAnimationFrame(() => ajustarAltura(comoInput));
  }

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

addPassoBtn.addEventListener("click", () => criarPasso());
criarPasso();

let anexosExistentes = [];
let anexosNovos = [];

function criarTagAnexo(nome, aoRemover) {
  const tag = document.createElement("span");
  tag.className = "anexo-tag";
  tag.append(nome);

  const removerBtn = document.createElement("button");
  removerBtn.type = "button";
  removerBtn.className = "anexo-tag__remover";
  removerBtn.setAttribute("aria-label", "Remover anexo");
  removerBtn.textContent = "×";
  removerBtn.addEventListener("click", aoRemover);

  tag.appendChild(removerBtn);
  return tag;
}

function atualizarAnexosLista() {
  anexosLista.innerHTML = "";

  if (anexosExistentes.length === 0 && anexosNovos.length === 0) {
    anexosLista.textContent = "Nenhum arquivo selecionado";
    return;
  }

  anexosExistentes.forEach((anexo, indice) => {
    anexosLista.appendChild(criarTagAnexo(anexo.nome, () => {
      anexosExistentes.splice(indice, 1);
      atualizarAnexosLista();
    }));
  });

  anexosNovos.forEach((arquivo, indice) => {
    anexosLista.appendChild(criarTagAnexo(arquivo.name, () => {
      anexosNovos.splice(indice, 1);
      atualizarAnexosLista();
    }));
  });
}

atualizarAnexosLista();

anexosBtn.addEventListener("click", () => anexosInput.click());

anexosInput.addEventListener("change", () => {
  anexosNovos.push(...Array.from(anexosInput.files));
  anexosInput.value = "";
  atualizarAnexosLista();
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
    const novasImagens = zonaEl._imagensNovas || [];

    const imagensEnviadas = await Promise.all(novasImagens.map(async (arquivo, j) => {
      const nomeArquivo = `passo-${i + 1}-${j + 1}-${Date.now()}-${arquivo.name || "colada.png"}`;
      const url = await enviarArquivo(solucaoId, nomeArquivo, arquivo);
      return { nome: arquivo.name || nomeArquivo, url };
    }));

    const imagens = [...(zonaEl._imagensExistentes || []), ...imagensEnviadas];

    return {
      ordem: i + 1,
      acao: passoEl.querySelector(".passo__acao").value.trim(),
      comoFazer: passoEl.querySelector(".passo__como").value.trim(),
      imagens
    };
  }));
}

async function enviarAnexos(solucaoId, arquivos) {
  return Promise.all(arquivos.map(async (arquivo, indice) => {
    const nomeArquivo = `${Date.now()}-${indice + 1}-${arquivo.name}`;
    const url = await enviarArquivo(solucaoId, nomeArquivo, arquivo);
    return { nome: arquivo.name, url };
  }));
}

async function carregarParaEdicao() {
  const { data, error } = await supabase
    .from("solucoes")
    .select("*")
    .eq("id", solucaoIdEdicao)
    .single();

  if (error || !data) {
    mostrarStatus("Não foi possível carregar a solução para edição.", "erro");
    return;
  }

  tituloInput.value = data.titulo || "";
  autorInput.value = data.autor || "";
  erroInput.value = data.erro || "";

  passosContainer.querySelectorAll(".passo").forEach((el) => el.remove());
  (data.passos || []).forEach((passo) => criarPasso(passo));
  if (!passosContainer.querySelector(".passo")) {
    criarPasso();
  }

  anexosExistentes = data.anexos ? [...data.anexos] : [];
  atualizarAnexosLista();

  pageTitleEl.textContent = "Editar Solução";
  submitBtn.textContent = "Salvar alterações";
}

if (solucaoIdEdicao) {
  carregarParaEdicao();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  mostrarStatus("", null);
  submitBtn.disabled = true;
  submitBtn.textContent = solucaoIdEdicao ? "Salvando alterações..." : "Salvando...";

  try {
    const solucaoId = solucaoIdEdicao || crypto.randomUUID();

    const [passos, anexosEnviados] = await Promise.all([
      montarPassos(solucaoId),
      enviarAnexos(solucaoId, anexosNovos)
    ]);

    const anexos = [...anexosExistentes, ...anexosEnviados];

    const dadosSolucao = {
      titulo: tituloInput.value.trim(),
      erro: erroInput.value.trim(),
      autor: autorInput.value.trim(),
      passos,
      anexos
    };

    let erroSalvar;
    if (solucaoIdEdicao) {
      ({ error: erroSalvar } = await supabase.from("solucoes").update(dadosSolucao).eq("id", solucaoIdEdicao));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error: erroSalvar } = await supabase.from("solucoes").insert({
        id: solucaoId,
        ...dadosSolucao,
        criado_por: user.id
      }));
    }

    if (erroSalvar) throw erroSalvar;

    window.location.href = solucaoIdEdicao ? "solucoes.html?editado=1" : "solucoes.html";
    return;
  } catch (erro) {
    console.error("Erro ao salvar solução:", erro);
    mostrarStatus("Não foi possível salvar a solução. Tente novamente.", "erro");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = solucaoIdEdicao ? "Salvar alterações" : "Salvar solução";
  }
});
