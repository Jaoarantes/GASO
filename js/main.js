const temaToggle = document.getElementById("tema-toggle");
const temaTexto = document.getElementById("tema-texto");
const sidebarLogo = document.querySelector(".sidebar__logo");

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  if (temaTexto) {
    temaTexto.textContent = tema === "dark" ? "Tema claro" : "Tema escuro";
  }
  if (sidebarLogo) {
    sidebarLogo.src = tema === "dark" ? "assets/img/logo-escuro.svg" : "assets/img/logo-claro.svg";
  }
}

aplicarTema(localStorage.getItem("tema") || "light");

temaToggle?.addEventListener("click", () => {
  const atual = document.documentElement.getAttribute("data-theme");
  const novoTema = atual === "dark" ? "light" : "dark";
  localStorage.setItem("tema", novoTema);
  aplicarTema(novoTema);
});
