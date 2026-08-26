import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const form = document.getElementById("login-form");
const usuarioInput = document.getElementById("login-usuario");
const senhaInput = document.getElementById("senha");
const errorEl = document.getElementById("login-error");
const toggleSenhaBtn = document.getElementById("toggle-senha");

// O Firebase Authentication só autentica por e-mail. Para o usuário digitar
// apenas um "login" (sem e-mail), convertemos para um e-mail fixo interno
// antes de enviar ao Firebase. Ao criar a conta no console, cadastre também
// nesse formato: <login>@gasosolucoes.local
const DOMINIO_LOGIN = "@gasosolucoes.local";

function paraEmail(login) {
  return login.trim().toLowerCase() + DOMINIO_LOGIN;
}

function mostrarErro(codigo) {
  const mensagens = {
    "auth/invalid-email": "Login inválido.",
    "auth/invalid-credential": "Login ou senha incorretos.",
    "auth/user-not-found": "Login ou senha incorretos.",
    "auth/wrong-password": "Login ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente novamente."
  };
  errorEl.textContent = mensagens[codigo] || "Não foi possível entrar. Tente novamente.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, paraEmail(usuarioInput.value), senhaInput.value);
    window.location.href = "index.html";
  } catch (erro) {
    mostrarErro(erro.code);
  }
});

const ICONE_OLHO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICONE_OLHO_FECHADO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.4 20.4 0 0 1-2.68 3.9M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`;

function atualizarIconeSenha(visivel) {
  toggleSenhaBtn.innerHTML = visivel ? ICONE_OLHO_FECHADO : ICONE_OLHO;
  toggleSenhaBtn.setAttribute("aria-label", visivel ? "Ocultar senha" : "Mostrar senha");
}

atualizarIconeSenha(false);

toggleSenhaBtn.addEventListener("click", () => {
  const visivel = senhaInput.type === "text";
  senhaInput.type = visivel ? "password" : "text";
  atualizarIconeSenha(!visivel);
});
