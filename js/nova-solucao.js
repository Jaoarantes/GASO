const tipoCards = document.querySelectorAll(".tipo-card");
const registroVazio = document.getElementById("registro-vazio");
const registroCampos = document.getElementById("registro-campos");

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

    <div class="campo-linha-dupla">
      <div class="campo-grupo">
        <label class="campo-label">Código ou mensagem de erro</label>
        <input class="campo-input campo-input--codigo" type="text" placeholder="ORA-01722: invalid number">
      </div>
      <div class="campo-grupo">
        <label class="campo-label">Versão do ERP afetada</label>
        <input class="campo-input" type="text" placeholder="12.1.8 → 12.2.4">
      </div>
    </div>
  `;

  const tagsCampo = document.getElementById("tags-campo");
  const tagsInput = document.getElementById("tags-input");

  function adicionarTag(texto) {
    const valor = texto.trim();
    if (!valor) return;

    const tag = document.createElement("span");
    tag.className = "tag-chip";
    tag.append(valor);

    const removerBtn = document.createElement("button");
    removerBtn.type = "button";
    removerBtn.className = "tag-chip__remover";
    removerBtn.setAttribute("aria-label", "Remover palavra-chave");
    removerBtn.textContent = "×";
    removerBtn.addEventListener("click", () => tag.remove());

    tag.appendChild(removerBtn);
    tagsCampo.insertBefore(tag, tagsInput);
  }

  tagsInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      adicionarTag(tagsInput.value);
      tagsInput.value = "";
    }
  });
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
