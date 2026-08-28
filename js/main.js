const temaToggle = document.getElementById("tema-toggle");
const temaTexto = document.getElementById("tema-texto");

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  if (temaTexto) {
    temaTexto.textContent = tema === "dark" ? "Tema claro" : "Tema escuro";
  }
}

aplicarTema(localStorage.getItem("tema") || "light");

temaToggle?.addEventListener("click", () => {
  const atual = document.documentElement.getAttribute("data-theme");
  const novoTema = atual === "dark" ? "light" : "dark";
  localStorage.setItem("tema", novoTema);
  aplicarTema(novoTema);
});
