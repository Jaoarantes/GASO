const temaToggle = document.getElementById("tema-toggle");
const temaTexto = document.getElementById("tema-texto");
const temaIcone = document.getElementById("tema-icone");
const sidebarLogo = document.querySelector(".sidebar__logo");

const ICONE_SOL = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';
const ICONE_LUA = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  if (temaTexto) {
    temaTexto.textContent = tema === "dark" ? "Tema claro" : "Tema escuro";
  }
  if (temaIcone) {
    temaIcone.innerHTML = tema === "dark" ? ICONE_SOL : ICONE_LUA;
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
