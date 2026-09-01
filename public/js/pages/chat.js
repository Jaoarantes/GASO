// js/pages/chat.js — tela de Chat com o assistente de IA (documentos do ERP).
// Chama a function serverless em /api/chat.js e renderiza a conversa.

const mensagensEl = document.getElementById("chat-mensagens");
const vazioEl = document.getElementById("chat-vazio");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const enviarBtn = document.getElementById("chat-enviar-btn");

function escaparHtml(texto) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatarInline(texto) {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, "<em>$1</em>");
}

// Converte o markdown simples que o Gemini devolve (headers, negrito, listas,
// linha horizontal) em HTML, escapando o texto original antes pra nao correr
// risco de injeção.
function renderizarMarkdown(texto) {
  const linhas = escaparHtml(texto).split("\n");
  let html = "";
  let listaAberta = null;
  let paragrafoAtual = [];

  function fecharParagrafo() {
    if (paragrafoAtual.length) {
      html += `<p>${paragrafoAtual.join(" ")}</p>`;
      paragrafoAtual = [];
    }
  }
  function fecharLista() {
    if (listaAberta) {
      html += `</${listaAberta}>`;
      listaAberta = null;
    }
  }

  for (const linhaOriginal of linhas) {
    const linha = linhaOriginal.trim();

    if (!linha) {
      fecharParagrafo();
      fecharLista();
      continue;
    }

    const headerMatch = linha.match(/^#{2,4}\s+(.*)/);
    if (headerMatch) {
      fecharParagrafo();
      fecharLista();
      html += `<h4>${formatarInline(headerMatch[1])}</h4>`;
      continue;
    }

    if (/^-{3,}$/.test(linha)) {
      fecharParagrafo();
      fecharLista();
      html += "<hr>";
      continue;
    }

    const itemNumerado = linha.match(/^\d+[.)]\s+(.*)/);
    if (itemNumerado) {
      fecharParagrafo();
      if (listaAberta !== "ol") {
        fecharLista();
        html += "<ol>";
        listaAberta = "ol";
      }
      html += `<li>${formatarInline(itemNumerado[1])}</li>`;
      continue;
    }

    const itemMarcador = linha.match(/^[-*•]\s+(.*)/);
    if (itemMarcador) {
      fecharParagrafo();
      if (listaAberta !== "ul") {
        fecharLista();
        html += "<ul>";
        listaAberta = "ul";
      }
      html += `<li>${formatarInline(itemMarcador[1])}</li>`;
      continue;
    }

    fecharLista();
    paragrafoAtual.push(formatarInline(linha));
  }
  fecharParagrafo();
  fecharLista();
  return html;
}

function rolarParaFinal() {
  mensagensEl.scrollTop = mensagensEl.scrollHeight;
}

function criarAvatarBot() {
  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 4v-4H6a2 2 0 0 1-2-2z"/></svg>';
  return avatar;
}

function adicionarMensagemUsuario(texto) {
  vazioEl?.setAttribute("hidden", "");

  const linha = document.createElement("div");
  linha.className = "chat-mensagem chat-mensagem--usuario";

  const bolha = document.createElement("div");
  bolha.className = "chat-bolha";
  bolha.innerHTML = escaparHtml(texto).replace(/\n/g, "<br>");

  linha.appendChild(bolha);
  mensagensEl.appendChild(linha);
  rolarParaFinal();
}

function adicionarMensagemDigitando() {
  const linha = document.createElement("div");
  linha.className = "chat-mensagem chat-mensagem--bot";
  linha.appendChild(criarAvatarBot());

  const bolha = document.createElement("div");
  bolha.className = "chat-bolha";
  bolha.innerHTML = '<div class="chat-digitando"><span class="chat-digitando__texto">COLA está pensando</span><span class="chat-digitando__pontos"><span></span><span></span><span></span></span></div>';

  linha.appendChild(bolha);
  mensagensEl.appendChild(linha);
  rolarParaFinal();
  return { linha, bolha };
}

async function enviarPergunta(pergunta) {
  adicionarMensagemUsuario(pergunta);

  inputEl.value = "";
  inputEl.style.height = "auto";
  inputEl.disabled = true;
  enviarBtn.disabled = true;

  const { linha, bolha } = adicionarMensagemDigitando();

  try {
    const resposta = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta })
    });

    const dados = await resposta.json();

    if (!resposta.ok || dados.erro) {
      linha.classList.add("chat-mensagem--erro");
      bolha.textContent = dados.erro || "Não foi possível responder agora.";
    } else {
      bolha.innerHTML = renderizarMarkdown(dados.resposta || "");
    }
  } catch (erro) {
    linha.classList.add("chat-mensagem--erro");
    bolha.textContent = "Não foi possível conectar ao chat. Tente novamente.";
  } finally {
    inputEl.disabled = false;
    enviarBtn.disabled = false;
    inputEl.focus();
    rolarParaFinal();
  }
}

formEl.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const pergunta = inputEl.value.trim();
  if (!pergunta) return;
  enviarPergunta(pergunta);
});

inputEl.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    formEl.requestSubmit();
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 140)}px`;
});
