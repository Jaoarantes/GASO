import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const form = document.getElementById("login-form");
const usuarioInput = document.getElementById("login-usuario");
const senhaInput = document.getElementById("senha");
const errorEl = document.getElementById("login-error");
const googleBtn = document.getElementById("google-btn");

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
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente novamente.",
    "auth/popup-closed-by-user": "Login com Google cancelado."
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

googleBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  const provider = new GoogleAuthProvider();

  try {
    await signInWithPopup(auth, provider);
    window.location.href = "index.html";
  } catch (erro) {
    mostrarErro(erro.code);
  }
});
