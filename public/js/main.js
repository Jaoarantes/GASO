const temaToggle = document.getElementById("tema-toggle");
const temaTexto = document.getElementById("tema-texto");
const temaIcone = document.getElementById("tema-icone");
const sidebarLogo = document.querySelector(".sidebar__logo");
const sidebarColapsarBtn = document.getElementById("sidebar-colapsar");

const ICONE_SOL = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';
const ICONE_LUA = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';

function sidebarEstaColapsada() {
  return document.documentElement.getAttribute("data-sidebar") === "colapsada";
}

function atualizarLogo() {
  if (!sidebarLogo) return;

  if (sidebarEstaColapsada()) {
    sidebarLogo.src = "assets/img/logo-icone.svg";
    return;
  }

  const tema = document.documentElement.getAttribute("data-theme");
  sidebarLogo.src = tema === "dark" ? "assets/img/logo-escuro.svg" : "assets/img/logo-claro.svg";
}

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  if (temaTexto) {
    temaTexto.textContent = tema === "dark" ? "Tema claro" : "Tema escuro";
  }
  if (temaIcone) {
    temaIcone.innerHTML = tema === "dark" ? ICONE_SOL : ICONE_LUA;
  }
  atualizarLogo();
}

function aplicarColapso(colapsada) {
  document.documentElement.setAttribute("data-sidebar", colapsada ? "colapsada" : "expandida");
  if (sidebarColapsarBtn) {
    sidebarColapsarBtn.setAttribute("aria-label", colapsada ? "Expandir menu" : "Recolher menu");
  }
  atualizarLogo();
}

aplicarTema(localStorage.getItem("tema") || "light");
aplicarColapso(localStorage.getItem("sidebarColapsada") === "true");

temaToggle?.addEventListener("click", () => {
  const atual = document.documentElement.getAttribute("data-theme");
  const novoTema = atual === "dark" ? "light" : "dark";
  localStorage.setItem("tema", novoTema);
  aplicarTema(novoTema);
});

sidebarColapsarBtn?.addEventListener("click", () => {
  const novoEstado = !sidebarEstaColapsada();
  localStorage.setItem("sidebarColapsada", String(novoEstado));
  aplicarColapso(novoEstado);
});
