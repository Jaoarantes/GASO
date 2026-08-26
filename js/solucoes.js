import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const listaEl = document.getElementById("solucoes-lista");
const vazioEl = document.getElementById("solucoes-vazio");

function formatarData(timestamp) {
  if (!timestamp) return "";
  return timestamp.toDate().toLocaleDateString("pt-BR");
}

function criarCard(id, dados) {
  const card = document.createElement("a");
  card.className = "solucao-card";
  card.href = `solucao.html?id=${id}`;

  card.innerHTML = `
    <h2 class="solucao-card__titulo">${dados.titulo || "Sem título"}</h2>
    <p class="solucao-card__erro">${dados.erro || ""}</p>
    <div class="solucao-card__meta">
      <span>${dados.autor || "Autor não informado"}</span>
      <span>${formatarData(dados.criadoEm)}</span>
    </div>
  `;

  return card;
}

async function carregarSolucoes() {
  const consulta = query(collection(db, "solucoes"), orderBy("criadoEm", "desc"));
  const snapshot = await getDocs(consulta);

  if (snapshot.empty) {
    vazioEl.hidden = false;
    return;
  }

  snapshot.forEach((docSnap) => {
    listaEl.appendChild(criarCard(docSnap.id, docSnap.data()));
  });
}

carregarSolucoes();
