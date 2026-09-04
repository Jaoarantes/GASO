// js/pages/chat.js — tela de Chat com o assistente de IA (documentos do ERP).
// Chama a function serverless em /api/chat.js e renderiza a conversa.

const mensagensEl = document.getElementById("chat-mensagens");
const vazioEl = document.getElementById("chat-vazio");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const enviarBtn = document.getElementById("chat-enviar-btn");
const anexarBtn = document.getElementById("chat-anexar-btn");
const anexoInput = document.getElementById("chat-anexo-input");
const anexoPreview = document.getElementById("chat-anexo-preview");
const limparBtn = document.getElementById("chat-limpar-btn");
const limparOverlay = document.getElementById("chat-limpar-overlay");
const limparCancelarBtn = document.getElementById("chat-limpar-cancelar");
const limparConfirmarBtn = document.getElementById("chat-limpar-confirmar");

let imagensPendentes = []; // [{ mimeType, data (base64 sem prefixo), previewUrl }]
const MAX_IMAGENS_ANEXO = 3;

// Historico da conversa, salvo so nesse navegador (localStorage).
const HISTORICO_CHAVE = "colaHistoricoConversa";
const HISTORICO_LIMITE = 60; // mensagens mais recentes guardadas

function lerHistorico() {
  try {
    return JSON.parse(localStorage.getItem(HISTORICO_CHAVE) || "[]");
  } catch {
    return [];
  }
}

// Pares pergunta/resposta ja concluidos dessa conversa, mandados pro servidor
// em cada nova pergunta pra o Jarvis manter o contexto (nao reenvia imagens
// antigas, so o texto). Reconstruido a partir do localStorage ao carregar.
let turnosContexto = [];
const TURNOS_CONTEXTO_LIMITE = 12;

function construirTurnosContexto(historico) {
  const turnos = [];
  for (let i = 0; i < historico.length - 1; i++) {
    const atual = historico[i];
    const proximo = historico[i + 1];
    if (atual.papel === "usuario" && proximo.papel === "bot") {
      turnos.push({ pergunta: atual.texto, resposta: proximo.texto });
    }
  }
  return turnos.slice(-TURNOS_CONTEXTO_LIMITE);
}

function salvarNoHistorico(entrada) {
  const historico = lerHistorico();
  historico.push(entrada);
  const limitado = historico.slice(-HISTORICO_LIMITE);

  try {
    localStorage.setItem(HISTORICO_CHAVE, JSON.stringify(limitado));
  } catch {
    // Provavelmente estourou a cota por causa das imagens em base64 —
    // tenta de novo sem elas, pra nao perder o texto da conversa.
    try {
      const semImagens = limitado.map((m) => ({ ...m, imagem: undefined, imagens: undefined }));
      localStorage.setItem(HISTORICO_CHAVE, JSON.stringify(semImagens));
    } catch {
      // Sem espaço mesmo; segue sem salvar essa mensagem.
    }
  }
}

// Reduz a imagem antes de enviar (limite maior que 1600px so deixa a
// requisicao mais pesada sem ganho real pra leitura de print/erro).
function comprimirImagem(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      URL.revokeObjectURL(url);
      resolve({
        mimeType: "image/jpeg",
        data: dataUrl.split(",")[1],
        previewUrl: dataUrl
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

function renderizarPreviewAnexos() {
  if (!imagensPendentes.length) {
    anexoPreview.setAttribute("hidden", "");
    anexoPreview.innerHTML = "";
    return;
  }

  anexoPreview.innerHTML = "";
  imagensPendentes.forEach((imagem, indice) => {
    const item = document.createElement("div");
    item.className = "chat-anexo-item";

    const img = document.createElement("img");
    img.className = "chat-anexo-preview__img";
    img.src = imagem.previewUrl;
    img.alt = "Pré-visualização da imagem anexada";

    const removerBtn = document.createElement("button");
    removerBtn.className = "chat-anexo-preview__remover";
    removerBtn.type = "button";
    removerBtn.setAttribute("aria-label", "Remover imagem");
    removerBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    removerBtn.addEventListener("click", () => {
      imagensPendentes.splice(indice, 1);
      renderizarPreviewAnexos();
    });

    item.appendChild(img);
    item.appendChild(removerBtn);
    anexoPreview.appendChild(item);
  });

  anexoPreview.removeAttribute("hidden");
}

function limparAnexos() {
  imagensPendentes = [];
  anexoInput.value = "";
  renderizarPreviewAnexos();
}

anexarBtn.addEventListener("click", () => anexoInput.click());

anexoInput.addEventListener("change", () => {
  adicionarAnexos(Array.from(anexoInput.files || []));
  anexoInput.value = "";
});

// Aceita varios arquivos de uma vez (ate o limite), ignorando o que passar
// da vaga disponivel.
async function adicionarAnexos(arquivos) {
  const vagas = MAX_IMAGENS_ANEXO - imagensPendentes.length;
  if (vagas <= 0) return;

  const selecionados = arquivos.slice(0, vagas);
  for (const arquivo of selecionados) {
    try {
      const imagem = await comprimirImagem(arquivo);
      imagensPendentes.push(imagem);
    } catch {
      // Ignora esse arquivo se nao conseguir ler/comprimir.
    }
  }
  renderizarPreviewAnexos();
}

// Permite colar (Ctrl+V) uma ou mais imagens direto no campo de texto — de
// um print tirado com a tecla PrtScn/ferramenta de recorte, por exemplo.
inputEl.addEventListener("paste", (evento) => {
  const arquivosImagem = Array.from(evento.clipboardData?.items || [])
    .filter((it) => it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter(Boolean);

  if (!arquivosImagem.length) return;

  evento.preventDefault();
  adicionarAnexos(arquivosImagem);
});

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

function adicionarMensagemUsuario(texto, previewUrls) {
  vazioEl?.setAttribute("hidden", "");

  const linha = document.createElement("div");
  linha.className = "chat-mensagem chat-mensagem--usuario";

  const bolha = document.createElement("div");
  bolha.className = "chat-bolha";

  (previewUrls || []).forEach((previewUrl) => {
    const img = document.createElement("img");
    img.className = "chat-bolha__imagem";
    img.src = previewUrl;
    img.alt = "Imagem enviada";
    bolha.appendChild(img);
  });

  if (texto) {
    const p = document.createElement("div");
    p.innerHTML = escaparHtml(texto).replace(/\n/g, "<br>");
    bolha.appendChild(p);
  }

  linha.appendChild(bolha);
  mensagensEl.appendChild(linha);
  rolarParaFinal();
}

function adicionarMensagemBot(texto, ehErro) {
  vazioEl?.setAttribute("hidden", "");

  const linha = document.createElement("div");
  linha.className = "chat-mensagem chat-mensagem--bot" + (ehErro ? " chat-mensagem--erro" : "");
  linha.appendChild(criarAvatarBot());

  const bolha = document.createElement("div");
  bolha.className = "chat-bolha";
  if (ehErro) {
    bolha.textContent = texto;
  } else {
    bolha.innerHTML = renderizarMarkdown(texto);
  }

  linha.appendChild(bolha);
  mensagensEl.appendChild(linha);
}

// Reconstroi a conversa salva no navegador, se tiver alguma.
function restaurarHistorico() {
  const historico = lerHistorico();
  turnosContexto = construirTurnosContexto(historico);
  if (!historico.length) return;

  for (const msg of historico) {
    if (msg.papel === "usuario") {
      // Compatibilidade com conversas salvas antes de suportar varias
      // imagens (formato antigo guardava "imagem" no singular).
      const imagens = msg.imagens || (msg.imagem ? [msg.imagem] : []);
      adicionarMensagemUsuario(msg.texto, imagens);
    } else {
      adicionarMensagemBot(msg.texto, msg.papel === "erro");
    }
  }
  rolarParaFinal();
}

function adicionarMensagemDigitando() {
  const linha = document.createElement("div");
  linha.className = "chat-mensagem chat-mensagem--bot";
  linha.appendChild(criarAvatarBot());

  const bolha = document.createElement("div");
  bolha.className = "chat-bolha";
  bolha.innerHTML = '<div class="chat-digitando"><span class="chat-digitando__texto">Jarvis está pensando</span><span class="chat-digitando__pontos"><span></span><span></span><span></span></span></div>';

  linha.appendChild(bolha);
  mensagensEl.appendChild(linha);
  rolarParaFinal();
  return { linha, bolha };
}

async function enviarPergunta(pergunta) {
  const imagens = imagensPendentes;
  const previewUrls = imagens.map((img) => img.previewUrl);
  adicionarMensagemUsuario(pergunta, previewUrls);
  salvarNoHistorico({ papel: "usuario", texto: pergunta, imagens: previewUrls.length ? previewUrls : undefined });

  inputEl.value = "";
  inputEl.style.height = "auto";
  inputEl.disabled = true;
  enviarBtn.disabled = true;
  limparAnexos();

  const { linha, bolha } = adicionarMensagemDigitando();

  try {
    const resposta = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pergunta,
        imagens: imagens.map((img) => ({ mimeType: img.mimeType, data: img.data })),
        historico: turnosContexto
      })
    });

    const dados = await resposta.json();

    if (!resposta.ok || dados.erro) {
      const mensagemErro = dados.erro || "Não foi possível responder agora.";
      linha.classList.add("chat-mensagem--erro");
      bolha.textContent = mensagemErro;
      salvarNoHistorico({ papel: "erro", texto: mensagemErro });
    } else {
      bolha.innerHTML = renderizarMarkdown(dados.resposta || "");
      salvarNoHistorico({ papel: "bot", texto: dados.resposta || "" });
      turnosContexto = [...turnosContexto, { pergunta, resposta: dados.resposta || "" }].slice(-TURNOS_CONTEXTO_LIMITE);
    }
  } catch (erro) {
    const mensagemErro = "Não foi possível conectar ao chat. Tente novamente.";
    linha.classList.add("chat-mensagem--erro");
    bolha.textContent = mensagemErro;
    salvarNoHistorico({ papel: "erro", texto: mensagemErro });
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
  if (!pergunta && !imagensPendentes.length) return;
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

limparBtn.addEventListener("click", () => {
  limparOverlay.hidden = false;
});

function fecharConfirmarLimpeza() {
  limparOverlay.hidden = true;
}

limparCancelarBtn.addEventListener("click", fecharConfirmarLimpeza);
limparOverlay.addEventListener("click", (evento) => {
  if (evento.target === limparOverlay) fecharConfirmarLimpeza();
});

limparConfirmarBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORICO_CHAVE);
  turnosContexto = [];
  mensagensEl.innerHTML = "";
  mensagensEl.appendChild(vazioEl);
  vazioEl.removeAttribute("hidden");
  fecharConfirmarLimpeza();
});

restaurarHistorico();
