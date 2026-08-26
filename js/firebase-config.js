// Configuração do Firebase.
// Cole aqui os valores do seu projeto: console.firebase.google.com
// > Configurações do projeto > Seus apps > App da Web > Configuração do SDK
//
// Estas chaves NÃO são segredo: elas identificam o projeto, não autorizam nada.
// Quem protege os dados são as Security Rules (firestore.rules / storage.rules).

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTj4N5jUAYhN4OCE5MFMSumm1SASj71Aw",
  authDomain: "gasosolucoes.firebaseapp.com",
  projectId: "gasosolucoes",
  storageBucket: "gasosolucoes.firebasestorage.app",
  messagingSenderId: "90985192474",
  appId: "1:90985192474:web:35f766ac5941667d5885a3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
