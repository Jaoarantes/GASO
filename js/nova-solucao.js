const tipoCards = document.querySelectorAll(".tipo-card");
const registroVazio = document.getElementById("registro-vazio");
const registroCampos = document.getElementById("registro-campos");

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
    registroCampos.textContent = `Campos de "${TITULOS_TIPO[tipo]}" — em construção.`;
  });
});

const criticidadeBtns = document.querySelectorAll(".criticidade-btn");

criticidadeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    criticidadeBtns.forEach((b) => b.classList.remove("criticidade-btn--ativo"));
    btn.classList.add("criticidade-btn--ativo");
  });
});
