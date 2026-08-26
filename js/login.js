import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const senhaInput = document.getElementById("senha");
const errorEl = document.getElementById("login-error");
const googleBtn = document.getElementById("google-btn");

function mostrarErro(codigo) {
  const mensagens = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente novamente.",
    "auth/popup-closed-by-user": "Login com Google cancelado."
  };
  errorEl.textContent = mensagens[codigo] || "Não foi possível entrar. Tente novamente.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), senhaInput.value);
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
