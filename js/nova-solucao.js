const tipoCards = document.querySelectorAll(".tipo-card");
const registroVazio = document.getElementById("registro-vazio");
const registroCampos = document.getElementById("registro-campos");

function ativarCampoTags(containerId, inputId) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);

  function adicionarTag(texto) {
    const valor = texto.trim();
    if (!valor) return;

    const tag = document.createElement("span");
    tag.className = "tag-chip";
    tag.append(valor);

    const removerBtn = document.createElement("button");
    removerBtn.type = "button";
    removerBtn.className = "tag-chip__remover";
    removerBtn.setAttribute("aria-label", "Remover");
    removerBtn.textContent = "×";
    removerBtn.addEventListener("click", () => tag.remove());

    tag.appendChild(removerBtn);
    container.insertBefore(tag, input);
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      adicionarTag(input.value);
      input.value = "";
    }
  });
}

function ajustarAltura(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

let passoArrastando = null;

function renumerarPassos() {
  document.querySelectorAll(".passo-card").forEach((card, indice) => {
    card.querySelector(".passo-card__numero").textContent = indice + 1;
  });
}

const MAX_IMAGENS_POR_PASSO = 3;

function atualizarImagensDoPasso(card) {
  const imagensArea = card.querySelector(".passo-card__imagens");
  const anexarBtn = card.querySelector(".passo-card__anexar");
  const imagens = card._imagens;

  imagensArea.innerHTML = "";
  imagensArea.hidden = imagens.length === 0;

  imagens.forEach((arquivo, indice) => {
    const item = document.createElement("div");
    item.className = "passo-card__imagem-item";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(arquivo);
    img.alt = `Imagem ${indice + 1} do passo`;

    const removerBtn = document.createElement("button");
    removerBtn.type = "button";
    removerBtn.className = "passo-card__imagem-remover";
    removerBtn.setAttribute("aria-label", "Remover imagem");
    removerBtn.textContent = "×";
    removerBtn.addEventListener("click", () => {
      imagens.splice(indice, 1);
      atualizarImagensDoPasso(card);
    });

    item.appendChild(img);
    item.appendChild(removerBtn);
    imagensArea.appendChild(item);
  });

  const atingiuLimite = imagens.length >= MAX_IMAGENS_POR_PASSO;
  anexarBtn.disabled = atingiuLimite;
  anexarBtn.lastChild.textContent = atingiuLimite ? " Máximo de 3 imagens" : " Anexar imagem";
}

function adicionarImagensAoPasso(card, novosArquivos) {
  for (const arquivo of novosArquivos) {
    if (card._imagens.length >= MAX_IMAGENS_POR_PASSO) break;
    card._imagens.push(arquivo);
  }
  atualizarImagensDoPasso(card);
}

function criarPassoCard() {
  const card = document.createElement("div");
  card.className = "passo-card";
  card.draggable = true;
  card._imagens = [];
  card.innerHTML = `
    <div class="passo-card__topo">
      <span class="passo-card__handle" title="Arraste para reordenar">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>
      </span>
      <textarea class="passo-card__texto" rows="1" placeholder="Descreva esse passo... (cole uma imagem com Ctrl+V)"></textarea>
    </div>
    <div class="passo-card__rodape">
      <span class="passo-card__numero"></span>
      <button class="passo-card__anexar" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg><span> Anexar imagem</span>
      </button>
      <button class="passo-card__remover" type="button">Remover passo</button>
      <input class="passo-card__input-imagem" type="file" accept="image/*" multiple hidden>
    </div>
    <div class="passo-card__imagens" hidden></div>
  `;

  const textarea = card.querySelector(".passo-card__texto");
  textarea.addEventListener("input", () => ajustarAltura(textarea));

  textarea.addEventListener("paste", (event) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    adicionarImagensAoPasso(card, [item.getAsFile()]);
  });

  const anexarBtn = card.querySelector(".passo-card__anexar");
  const inputImagem = card.querySelector(".passo-card__input-imagem");

  anexarBtn.addEventListener("click", () => inputImagem.click());

  inputImagem.addEventListener("change", () => {
    adicionarImagensAoPasso(card, Array.from(inputImagem.files));
    inputImagem.value = "";
  });

  atualizarImagensDoPasso(card);

  card.querySelector(".passo-card__remover").addEventListener("click", () => {
    card.remove();
    renumerarPassos();
  });

  card.addEventListener("dragstart", () => {
    passoArrastando = card;
    card.classList.add("passo-card--arrastando");
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("passo-card--arrastando");
    passoArrastando = null;
    renumerarPassos();
  });

  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!passoArrastando || passoArrastando === card) return;
    const rect = card.getBoundingClientRect();
    const depois = event.clientY - rect.top > rect.height / 2;
    card.parentElement.insertBefore(passoArrastando, depois ? card.nextSibling : card);
  });

  return card;
}

function ativarPassoAPasso() {
  const lista = document.getElementById("passos-lista");
  const addBtn = document.getElementById("add-passo");

  function adicionarPasso() {
    lista.appendChild(criarPassoCard());
    renumerarPassos();
  }

  addBtn.addEventListener("click", adicionarPasso);
  adicionarPasso();
}

function criarCamposErro() {
  registroCampos.innerHTML = `
    <div class="campo-titulo">
      <input class="campo-titulo-input" type="text" placeholder="Erro ORA-01722 ao faturar pedido com desconto">
    </div>

    <div class="campo-grupo">
      <label class="campo-label">O que este registro resolve</label>
      <textarea class="campo-textarea" rows="3" placeholder="Conversão inválida no campo de desconto quando o pedido tem parcelamento. Ajuste de máscara na rotina de faturamento."></textarea>
    </div>

    <div class="campo-grupo">
      <label class="campo-label">Sintomas e palavras-chave</label>
      <div class="tags-campo" id="tags-campo">
        <input class="tags-input" type="text" id="tags-input" placeholder="adicionar...">
      </div>
    </div>

    <div class="campo-grupo">
      <label class="campo-label">Código ou mensagem de erro</label>
      <input class="campo-input campo-input--codigo" type="text" placeholder="ORA-01722: invalid number">
    </div>

    <div class="passo-a-passo">
      <div class="passo-a-passo__cabecalho">
        <span class="passo-a-passo__titulo">Passo a passo da solução</span>
        <span class="passo-a-passo__dica">arraste para reordenar</span>
      </div>

      <div class="passos-lista" id="passos-lista"></div>

      <button class="btn-adicionar-passo" type="button" id="add-passo">+ Adicionar passo</button>
    </div>

    <div class="campo-grupo">
      <label class="campo-label">Tabelas e campos envolvidos</label>
      <div class="tags-campo" id="tabelas-campo">
        <input class="tags-input tags-input--mono" type="text" id="tabelas-input" placeholder="adicionar...">
      </div>
    </div>
  `;

  ativarCampoTags("tags-campo", "tags-input");
  ativarCampoTags("tabelas-campo", "tabelas-input");
  ativarPassoAPasso();
}

function criarCamposEmConstrucao(titulo) {
  registroCampos.innerHTML = `<p class="campo-em-construcao">Campos de "${titulo}" — em construção.</p>`;
}

const TITULOS_TIPO = {
  erro: "Erro / Correção",
  script: "Script / SQL",
  procedimento: "Procedimento"
};

tipoCards.forEach((card) => {
  card.addEventListener("click", () => {
    tipoCards.forEach((c) => c.classList.remove("tipo-card--ativo"));
    card.classList.add("tipo-card--ativo");

    const tipo = card.dataset.tipo;
    registroVazio.hidden = true;
    registroCampos.hidden = false;

    if (tipo === "erro") {
      criarCamposErro();
    } else {
      criarCamposEmConstrucao(TITULOS_TIPO[tipo]);
    }
  });
});

const criticidadeBtns = document.querySelectorAll(".criticidade-btn");

criticidadeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    criticidadeBtns.forEach((b) => b.classList.remove("criticidade-btn--ativo"));
    btn.classList.add("criticidade-btn--ativo");
  });
});
