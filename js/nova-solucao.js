import { supabase } from "./supabase-config.js";

const tipoCards = document.querySelectorAll(".tipo-card");
const registroVazio = document.getElementById("registro-vazio");
const registroCampos = document.getElementById("registro-campos");

const idEdicao = new URLSearchParams(window.location.search).get("id");

function montarCaminho(pagina, caminho) {
  return [pagina, caminho].filter(Boolean).join(" | ") || null;
}

function separarCaminho(modulo) {
  if (!modulo) return { pagina: "", caminho: "" };
  const indice = modulo.indexOf(" | ");
  if (indice === -1) return { pagina: "", caminho: modulo };
  return { pagina: modulo.slice(0, indice), caminho: modulo.slice(indice + 3) };
}

let relacionadasApi = null;
let vincularAtivo = null;

document.addEventListener("click", (event) => {
  if (!vincularAtivo) return;
  const { resultadosEl, inputEl } = vincularAtivo;
  if (!resultadosEl.contains(event.target) && event.target !== inputEl) {
    resultadosEl.hidden = true;
  }
});

function ativarSolucoesRelacionadas(relacionadasIniciais) {
  const inputEl = document.getElementById("vincular-input");
  const resultadosEl = document.getElementById("vincular-resultados");
  const listaEl = document.getElementById("relacionadas-lista");

  let selecionadas = [];
  let buscaTimer = null;

  function renderizarSelecionadas() {
    listaEl.innerHTML = "";
    selecionadas.forEach((item) => {
      const linha = document.createElement("div");
      linha.className = "relacionada-item";
      linha.innerHTML = `
        <span class="relacionada-item__titulo">${item.titulo || "Sem título"}</span>
        <button type="button" class="relacionada-item__remover" aria-label="Remover vínculo">×</button>
      `;
      linha.querySelector(".relacionada-item__remover").addEventListener("click", () => {
        selecionadas = selecionadas.filter((s) => s.id !== item.id);
        renderizarSelecionadas();
      });
      listaEl.appendChild(linha);
    });
  }

  function esconderResultados() {
    resultadosEl.hidden = true;
    resultadosEl.innerHTML = "";
  }

  function adicionar(item) {
    if (selecionadas.some((s) => s.id === item.id)) return;
    selecionadas.push(item);
    renderizarSelecionadas();
    inputEl.value = "";
    esconderResultados();
  }

  async function buscar(termo) {
    let query = supabase.from("solucoes").select("id,titulo").ilike("titulo", `%${termo}%`).limit(8);
    if (idEdicao) query = query.neq("id", idEdicao);
    const { data } = await query;
    const resultados = (data || []).filter((r) => !selecionadas.some((s) => s.id === r.id));

    resultadosEl.innerHTML = "";
    if (resultados.length === 0) {
      resultadosEl.innerHTML = `<span class="vincular-resultados__vazio">Nenhuma solução encontrada.</span>`;
    } else {
      resultados.forEach((registro) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vincular-resultado-item";
        btn.textContent = registro.titulo || "Sem título";
        btn.addEventListener("click", () => adicionar(registro));
        resultadosEl.appendChild(btn);
      });
    }
    resultadosEl.hidden = false;
  }

  inputEl.addEventListener("input", () => {
    const termo = inputEl.value.trim();
    clearTimeout(buscaTimer);
    if (!termo) {
      esconderResultados();
      return;
    }
    buscaTimer = setTimeout(() => buscar(termo), 250);
  });

  inputEl.addEventListener("focus", () => {
    if (inputEl.value.trim()) resultadosEl.hidden = false;
  });

  if (relacionadasIniciais && relacionadasIniciais.length > 0) {
    supabase.from("solucoes").select("id,titulo").in("id", relacionadasIniciais).then(({ data }) => {
      selecionadas = data || [];
      renderizarSelecionadas();
    });
  }

  vincularAtivo = { resultadosEl, inputEl };
  relacionadasApi = {
    coletar: () => selecionadas.map((s) => s.id)
  };
}

function ativarCampoTags(containerId, inputId) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);

  function adicionarTag(texto) {
    const valor = texto.trim();
    if (!valor) return;

    const tag = document.createElement("span");
    tag.className = "tag-chip";
    tag.append(valor);

    const removerBtn = document.createElement("button");
    removerBtn.type = "button";
    removerBtn.className = "tag-chip__remover";
    removerBtn.setAttribute("aria-label", "Remover");
    removerBtn.textContent = "×";
    removerBtn.addEventListener("click", () => tag.remove());

    tag.appendChild(removerBtn);
    container.insertBefore(tag, input);
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      adicionarTag(input.value);
      input.value = "";
    }
  });

  return { adicionarTag };
}

function ajustarAltura(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

let passoArrastando = null;

function renumerarPassos() {
  document.querySelectorAll(".passo-card").forEach((card, indice) => {
    card.querySelector(".passo-card__numero").textContent = indice + 1;
  });
}

const MAX_IMAGENS_POR_PASSO = 3;

function urlDaImagem(item) {
  return item instanceof File ? URL.createObjectURL(item) : item.url;
}

function atualizarImagensDoPasso(card) {
  const imagensArea = card.querySelector(".passo-card__imagens");
  const anexarBtn = card.querySelector(".passo-card__anexar");
  const imagens = card._imagens;

  imagensArea.innerHTML = "";
  imagensArea.hidden = imagens.length === 0;

  imagens.forEach((arquivo, indice) => {
    const item = document.createElement("div");
    item.className = "passo-card__imagem-item";

    const img = document.createElement("img");
    img.src = urlDaImagem(arquivo);
    img.alt = `Imagem ${indice + 1} do passo`;

    const removerBtn = document.createElement("button");
    removerBtn.type = "button";
    removerBtn.className = "passo-card__imagem-remover";
    removerBtn.setAttribute("aria-label", "Remover imagem");
    removerBtn.textContent = "×";
    removerBtn.addEventListener("click", () => {
      imagens.splice(indice, 1);
      atualizarImagensDoPasso(card);
    });

    item.appendChild(img);
    item.appendChild(removerBtn);
    imagensArea.appendChild(item);
  });

  const atingiuLimite = imagens.length >= MAX_IMAGENS_POR_PASSO;
  anexarBtn.disabled = atingiuLimite;
  anexarBtn.lastChild.textContent = atingiuLimite ? " Máximo de 3 imagens" : " Anexar imagem";
}

function adicionarImagensAoPasso(card, novosArquivos) {
  for (const arquivo of novosArquivos) {
    if (card._imagens.length >= MAX_IMAGENS_POR_PASSO) break;
    card._imagens.push(arquivo);
  }
  atualizarImagensDoPasso(card);
}

function criarPassoCard(passoInicial) {
  const card = document.createElement("div");
  card.className = "passo-card";
  card.draggable = true;
  card._imagens = passoInicial?.imagens ? passoInicial.imagens.slice() : [];
  card.innerHTML = `
    <div class="passo-card__topo">
      <span class="passo-card__handle" title="Arraste para reordenar">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>
      </span>
      <textarea class="passo-card__texto" rows="1" placeholder="Descreva esse passo... (cole uma imagem com Ctrl+V)"></textarea>
    </div>
    <div class="passo-card__rodape">
      <span class="passo-card__numero"></span>
      <button class="passo-card__anexar" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg><span> Anexar imagem</span>
      </button>
      <button class="passo-card__remover" type="button">Remover passo</button>
      <input class="passo-card__input-imagem" type="file" accept="image/*" multiple hidden>
    </div>
    <div class="passo-card__imagens" hidden></div>
  `;

  const textarea = card.querySelector(".passo-card__texto");
  if (passoInicial?.texto) {
    textarea.value = passoInicial.texto;
  }
  textarea.addEventListener("input", () => ajustarAltura(textarea));

  textarea.addEventListener("paste", (event) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    adicionarImagensAoPasso(card, [item.getAsFile()]);
  });

  const anexarBtn = card.querySelector(".passo-card__anexar");
  const inputImagem = card.querySelector(".passo-card__input-imagem");

  anexarBtn.addEventListener("click", () => inputImagem.click());

  inputImagem.addEventListener("change", () => {
    adicionarImagensAoPasso(card, Array.from(inputImagem.files));
    inputImagem.value = "";
  });

  atualizarImagensDoPasso(card);
  if (passoInicial?.texto) {
    ajustarAltura(textarea);
  }

  card.querySelector(".passo-card__remover").addEventListener("click", () => {
    card.remove();
    renumerarPassos();
  });

  card.addEventListener("dragstart", () => {
    passoArrastando = card;
    card.classList.add("passo-card--arrastando");
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("passo-card--arrastando");
    passoArrastando = null;
    renumerarPassos();
  });

  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!passoArrastando || passoArrastando === card) return;
    const rect = card.getBoundingClientRect();
    const depois = event.clientY - rect.top > rect.height / 2;
    card.parentElement.insertBefore(passoArrastando, depois ? card.nextSibling : card);
  });

  return card;
}

function ativarPassoAPasso(passosIniciais) {
  const lista = document.getElementById("passos-lista");
  const addBtn = document.getElementById("add-passo");

  function adicionarPasso(passoInicial) {
    lista.appendChild(criarPassoCard(passoInicial));
    renumerarPassos();
  }

  addBtn.addEventListener("click", () => adicionarPasso());

  if (passosIniciais && passosIniciais.length > 0) {
    passosIniciais.forEach((passo) => adicionarPasso(passo));
  } else {
    adicionarPasso();
  }
}

function ativarAnexos(anexosIniciais) {
  const dropzone = document.getElementById("anexos-dropzone");
  const selecionarBtn = document.getElementById("anexos-selecionar");
  const input = document.getElementById("anexos-input");
  const lista = document.getElementById("anexos-lista");

  dropzone._arquivos = [];

  function adicionarArquivo(arquivo) {
    dropzone._arquivos.push(arquivo);

    const nome = arquivo instanceof File ? arquivo.name : arquivo.nome;
    const item = document.createElement("div");
    item.className = "anexo-item";
    item.innerHTML = `
      <span class="anexo-item__icone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>
      </span>
      <div class="anexo-item__info">
        <span class="anexo-item__nome">${nome}</span>
        <div class="anexo-item__barra"><div class="anexo-item__progresso"></div></div>
      </div>
      <button type="button" class="anexo-item__remover" aria-label="Remover anexo">×</button>
    `;

    const progresso = item.querySelector(".anexo-item__progresso");
    item.querySelector(".anexo-item__remover").addEventListener("click", () => {
      const indice = dropzone._arquivos.indexOf(arquivo);
      if (indice > -1) dropzone._arquivos.splice(indice, 1);
      item.remove();
    });

    lista.appendChild(item);
    requestAnimationFrame(() => {
      progresso.style.width = "100%";
    });
  }

  function adicionarArquivos(arquivos) {
    Array.from(arquivos).forEach(adicionarArquivo);
  }

  selecionarBtn.addEventListener("click", () => input.click());

  dropzone.addEventListener("click", (event) => {
    if (event.target === selecionarBtn) return;
    input.click();
  });

  input.addEventListener("change", () => {
    adicionarArquivos(input.files);
    input.value = "";
  });

  ["dragover", "dragleave", "drop"].forEach((tipo) => {
    dropzone.addEventListener(tipo, (event) => event.preventDefault());
  });

  dropzone.addEventListener("dragover", () => dropzone.classList.add("anexos-dropzone--sobre"));
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("anexos-dropzone--sobre"));
  dropzone.addEventListener("drop", (event) => {
    dropzone.classList.remove("anexos-dropzone--sobre");
    adicionarArquivos(event.dataTransfer.files);
  });

  if (anexosIniciais && anexosIniciais.length > 0) {
    adicionarArquivos(anexosIniciais);
  }
}

function criarCamposErro(solucao, tipo) {
  codigoEditorAtivo = null;

  const tipoAtual = tipo || solucao?.tipo || "erro";
  const ehProcedimento = tipoAtual === "procedimento";

  const tituloPlaceholder = ehProcedimento
    ? "Cancelamento de pedido já faturado"
    : "Erro ORA-01722 ao faturar pedido com desconto";
  const resolvePlaceholder = ehProcedimento
    ? "Passo a passo para cancelar um pedido que já passou pelo faturamento, revertendo os lançamentos gerados."
    : "Conversão inválida no campo de desconto quando o pedido tem parcelamento. Ajuste de máscara na rotina de faturamento.";

  registroCampos.innerHTML = `
    <div class="campo-titulo">
      <input class="campo-titulo-input" type="text" placeholder="${tituloPlaceholder}">
    </div>

    <div class="campo-grupo">
      <label class="campo-label">O que este registro resolve</label>
      <textarea class="campo-textarea" rows="3" placeholder="${resolvePlaceholder}"></textarea>
    </div>

    <div class="campo-grupo">
      <label class="campo-label">Sintomas e palavras-chave</label>
      <div class="tags-campo" id="tags-campo">
        <input class="tags-input" type="text" id="tags-input" placeholder="adicionar...">
      </div>
    </div>

    ${ehProcedimento ? "" : `
    <div class="campo-grupo">
      <label class="campo-label">Código ou mensagem de erro</label>
      <input class="campo-input campo-input--codigo" type="text" placeholder="ORA-01722: invalid number">
    </div>
    `}

    <div class="passo-a-passo">
      <div class="passo-a-passo__cabecalho">
        <span class="passo-a-passo__titulo">Passo a passo da solução</span>
        <span class="passo-a-passo__dica">arraste para reordenar</span>
      </div>

      <div class="passos-lista" id="passos-lista"></div>

      <button class="btn-adicionar-passo" type="button" id="add-passo">+ Adicionar passo</button>
    </div>

    <div class="campo-grupo">
      <label class="campo-label">Tabelas e campos envolvidos</label>
      <div class="tags-campo" id="tabelas-campo">
        <input class="tags-input tags-input--mono" type="text" id="tabelas-input" placeholder="adicionar...">
      </div>
    </div>

    <div class="campo-linha-dupla">
      <div class="campo-grupo">
        <label class="campo-label">Anexos</label>
        <div class="anexos-dropzone" id="anexos-dropzone">
          <span>Arraste arquivos aqui ou <button type="button" class="anexos-link" id="anexos-selecionar">selecione do computador</button></span>
          <input class="anexos-input" type="file" id="anexos-input" multiple hidden>
        </div>
        <div class="anexos-lista" id="anexos-lista"></div>
      </div>

      <div class="campo-grupo">
        <label class="campo-label">Soluções relacionadas</label>
        <div class="vincular-campo">
          <svg class="vincular-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input class="vincular-input" type="text" id="vincular-input" placeholder="Buscar registro para vincular...">
        </div>
        <div class="vincular-resultados" id="vincular-resultados" hidden></div>
        <div class="relacionadas-lista" id="relacionadas-lista"></div>
      </div>
    </div>
  `;

  const tagsApi = ativarCampoTags("tags-campo", "tags-input");
  const tabelasApi = ativarCampoTags("tabelas-campo", "tabelas-input");
  ativarPassoAPasso(solucao?.passos);
  ativarAnexos(solucao?.anexos);
  ativarSolucoesRelacionadas(solucao?.relacionadas);

  if (solucao) {
    registroCampos.querySelector(".campo-titulo-input").value = solucao.titulo || "";
    registroCampos.querySelector(".campo-textarea").value = solucao.erro || "";
    const codigoErroInput = registroCampos.querySelector(".campo-input--codigo");
    if (codigoErroInput) codigoErroInput.value = solucao.codigo_erro || "";
    (solucao.sintomas || []).forEach((tag) => tagsApi.adicionarTag(tag));
    (solucao.tabelas_campos || []).forEach((tag) => tabelasApi.adicionarTag(tag));
  }
}

function criarParametroLinha() {
  const linha = document.createElement("div");
  linha.className = "parametro-linha";
  linha.innerHTML = `
    <input class="campo-input parametro-nome" type="text" placeholder=":p_parametro">
    <input class="campo-input parametro-desc" type="text" placeholder="Descrição do parâmetro">
    <button class="parametro-remover" type="button" aria-label="Remover parâmetro">×</button>
  `;

  linha.querySelector(".parametro-remover").addEventListener("click", () => linha.remove());

  return linha;
}

function ativarParametros(parametrosIniciais) {
  const lista = document.getElementById("parametros-lista");
  const addBtn = document.getElementById("add-parametro");

  addBtn.addEventListener("click", () => lista.appendChild(criarParametroLinha()));

  if (parametrosIniciais && parametrosIniciais.length > 0) {
    parametrosIniciais.forEach((parametro) => {
      const linha = criarParametroLinha();
      linha.querySelector(".parametro-nome").value = parametro.nome || "";
      linha.querySelector(".parametro-desc").value = parametro.descricao || "";
      lista.appendChild(linha);
    });
  } else {
    lista.appendChild(criarParametroLinha());
  }
}

let codigoEditorAtivo = null;

function ativarBlocoCodigo() {
  const areaEl = document.getElementById("codigo-area");
  const copiarBtn = document.getElementById("codigo-copiar");

  codigoEditorAtivo = window.CodeMirror.fromTextArea(areaEl, {
    mode: "text/x-sql",
    lineNumbers: true,
    lineWrapping: false
  });

  copiarBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codigoEditorAtivo.getValue());
      copiarBtn.textContent = "Copiado!";
      setTimeout(() => { copiarBtn.textContent = "Copiar"; }, 1500);
    } catch (erro) {
      console.error("Não foi possível copiar:", erro);
    }
  });
}

function ativarRisco() {
  const riscoBtns = document.querySelectorAll(".risco-btn");
  riscoBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      riscoBtns.forEach((b) => b.classList.remove("risco-btn--ativo"));
      btn.classList.add("risco-btn--ativo");
    });
  });
}

function criarCamposScript(solucao) {
  registroCampos.innerHTML = `
    <div class="campo-titulo">
      <input class="campo-titulo-input" type="text" placeholder="Divergência entre estoque físico e contábil por filial">
    </div>

    <div class="campo-grupo">
      <label class="campo-label">O que este registro resolve</label>
      <textarea class="campo-textarea" rows="3" placeholder="Descreva o que essa consulta ou rotina faz e quando usá-la."></textarea>
    </div>

    <div class="campo-grupo">
      <label class="campo-label">Sintomas e palavras-chave</label>
      <div class="tags-campo" id="tags-campo">
        <input class="tags-input" type="text" id="tags-input" placeholder="adicionar...">
      </div>
    </div>

    <div class="campo-grupo">
      <div class="codigo-bloco">
        <div class="codigo-bloco__topo">
          <span class="campo-label" style="margin-bottom: 0;">Bloco de código</span>
          <button class="codigo-bloco__copiar" type="button" id="codigo-copiar">Copiar</button>
        </div>
        <textarea id="codigo-area" spellcheck="false"></textarea>
      </div>
    </div>

    <div class="campo-grupo">
      <label class="campo-label">Parâmetros a substituir</label>
      <div class="parametros-lista" id="parametros-lista"></div>
      <button class="btn-adicionar-passo" type="button" id="add-parametro">+ Adicionar parâmetro</button>
    </div>

    <div class="campo-linha-dupla">
      <div class="campo-grupo">
        <label class="campo-label">Nível de risco</label>
        <div class="risco-grupo">
          <button class="risco-btn risco-btn--baixo" data-risco="baixo" type="button">Baixo</button>
          <button class="risco-btn risco-btn--medio" data-risco="medio" type="button">Médio</button>
          <button class="risco-btn risco-btn--alto risco-btn--ativo" data-risco="alto" type="button">Alto</button>
        </div>
      </div>

      <div class="campo-grupo">
        <label class="campo-checkbox">
          <input type="checkbox" id="reversivel-check">
          É reversível
        </label>
      </div>
    </div>

    <div class="campo-grupo">
      <label class="campo-label">Resultado esperado</label>
      <textarea class="campo-textarea" id="resultado-esperado" rows="3" placeholder="Descreva o que se espera ao rodar esse script."></textarea>
    </div>

    <div class="campo-linha-dupla">
      <div class="campo-grupo">
        <label class="campo-label">Anexos</label>
        <div class="anexos-dropzone" id="anexos-dropzone">
          <span>Arraste arquivos aqui ou <button type="button" class="anexos-link" id="anexos-selecionar">selecione do computador</button></span>
          <input class="anexos-input" type="file" id="anexos-input" multiple hidden>
        </div>
        <div class="anexos-lista" id="anexos-lista"></div>
      </div>

      <div class="campo-grupo">
        <label class="campo-label">Soluções relacionadas</label>
        <div class="vincular-campo">
          <svg class="vincular-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input class="vincular-input" type="text" id="vincular-input" placeholder="Buscar registro para vincular...">
        </div>
        <div class="vincular-resultados" id="vincular-resultados" hidden></div>
        <div class="relacionadas-lista" id="relacionadas-lista"></div>
      </div>
    </div>
  `;

  const tagsApi = ativarCampoTags("tags-campo", "tags-input");
  ativarBlocoCodigo();
  ativarParametros(solucao?.parametros);
  ativarRisco();
  ativarAnexos(solucao?.anexos);
  ativarSolucoesRelacionadas(solucao?.relacionadas);

  if (solucao) {
    registroCampos.querySelector(".campo-titulo-input").value = solucao.titulo || "";
    registroCampos.querySelector(".campo-textarea").value = solucao.erro || "";
    (solucao.sintomas || []).forEach((tag) => tagsApi.adicionarTag(tag));
    if (codigoEditorAtivo) codigoEditorAtivo.setValue(solucao.codigo || "");
    if (solucao.risco) {
      document.querySelectorAll(".risco-btn").forEach((b) => b.classList.remove("risco-btn--ativo"));
      document.querySelector(`.risco-btn[data-risco="${solucao.risco}"]`)?.classList.add("risco-btn--ativo");
    }
    document.getElementById("reversivel-check").checked = !!solucao.reversivel;
    document.getElementById("resultado-esperado").value = solucao.resultado_esperado || "";
  }
}

const caminhoSecaoEl = document.getElementById("caminho-secao");

tipoCards.forEach((card) => {
  card.addEventListener("click", () => {
    tipoCards.forEach((c) => c.classList.remove("tipo-card--ativo"));
    card.classList.add("tipo-card--ativo");

    const tipo = card.dataset.tipo;
    registroVazio.hidden = true;
    registroCampos.hidden = false;
    caminhoSecaoEl.hidden = tipo === "script";

    if (tipo === "erro" || tipo === "procedimento") {
      criarCamposErro(undefined, tipo);
    } else if (tipo === "script") {
      criarCamposScript();
    }
  });
});

const criticidadeBtns = document.querySelectorAll(".criticidade-btn");

criticidadeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    criticidadeBtns.forEach((b) => b.classList.remove("criticidade-btn--ativo"));
    btn.classList.add("criticidade-btn--ativo");
  });
});

async function carregarOpcoes(tabela, selectEl) {
  const { data } = await supabase.from(tabela).select("*").order("nome");
  selectEl.innerHTML = "";
  (data || []).forEach((registro) => {
    const opcao = document.createElement("option");
    opcao.value = registro.nome;
    opcao.textContent = registro.nome;
    selectEl.appendChild(opcao);
  });
}

function ativarSelecaoComCadastro({ tabela, select, addBtn, form, input, confirmar, cancelar }) {
  const selectEl = document.getElementById(select);
  const addBtnEl = document.getElementById(addBtn);
  const formEl = document.getElementById(form);
  const inputEl = document.getElementById(input);
  const confirmarEl = document.getElementById(confirmar);
  const cancelarEl = document.getElementById(cancelar);

  const pronto = carregarOpcoes(tabela, selectEl);

  function fechar() {
    formEl.hidden = true;
    inputEl.value = "";
  }

  addBtnEl.addEventListener("click", () => {
    formEl.hidden = false;
    inputEl.focus();
  });

  cancelarEl.addEventListener("click", fechar);

  confirmarEl.addEventListener("click", async () => {
    const valor = inputEl.value.trim();
    if (!valor) return;

    confirmarEl.disabled = true;
    const { error } = await supabase
      .from(tabela)
      .upsert({ nome: valor }, { onConflict: "nome", ignoreDuplicates: true });
    confirmarEl.disabled = false;

    if (error) {
      console.error(`Erro ao cadastrar em ${tabela}:`, error);
      return;
    }

    await carregarOpcoes(tabela, selectEl);
    selectEl.value = valor;
    fechar();
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmarEl.click();
    }
  });

  return { selectEl, pronto };
}

const categoriaApi = ativarSelecaoComCadastro({
  tabela: "categorias",
  select: "categoria-select",
  addBtn: "categoria-add-btn",
  form: "categoria-novo-form",
  input: "categoria-novo-input",
  confirmar: "categoria-novo-confirmar",
  cancelar: "categoria-novo-cancelar"
});

async function enviarArquivo(solucaoId, nomeArquivo, arquivo) {
  const caminho = `${solucaoId}/${nomeArquivo}`;
  const { error } = await supabase.storage.from("solucoes").upload(caminho, arquivo);
  if (error) throw error;
  const { data } = supabase.storage.from("solucoes").getPublicUrl(caminho);
  return data.publicUrl;
}

async function coletarPassos(solucaoId) {
  const cards = Array.from(document.querySelectorAll(".passo-card"));

  return Promise.all(cards.map(async (card, indice) => {
    const texto = card.querySelector(".passo-card__texto").value.trim();
    const arquivos = card._imagens || [];

    const imagens = await Promise.all(arquivos.map(async (arquivo, imgIndice) => {
      if (!(arquivo instanceof File)) return arquivo;
      const nomeArquivo = `passo-${indice + 1}-${imgIndice + 1}-${Date.now()}-${arquivo.name || "colada.png"}`;
      const url = await enviarArquivo(solucaoId, nomeArquivo, arquivo);
      return { nome: arquivo.name || nomeArquivo, url };
    }));

    return { ordem: indice + 1, texto, imagens };
  }));
}

async function coletarAnexos(solucaoId) {
  const dropzone = document.getElementById("anexos-dropzone");
  const arquivos = dropzone?._arquivos || [];

  return Promise.all(arquivos.map(async (arquivo, indice) => {
    if (!(arquivo instanceof File)) return arquivo;
    const nomeArquivo = `${Date.now()}-${indice + 1}-${arquivo.name}`;
    const url = await enviarArquivo(solucaoId, nomeArquivo, arquivo);
    return { nome: arquivo.name, url };
  }));
}

function coletarTags(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .tag-chip`))
    .map((chip) => chip.firstChild.textContent.trim());
}

function coletarParametros() {
  return Array.from(document.querySelectorAll(".parametro-linha"))
    .map((linha) => ({
      nome: linha.querySelector(".parametro-nome").value.trim(),
      descricao: linha.querySelector(".parametro-desc").value.trim()
    }))
    .filter((parametro) => parametro.nome || parametro.descricao);
}

const salvarBtn = document.getElementById("salvar-btn");
const publicacaoErro = document.getElementById("publicacao-erro");

salvarBtn.addEventListener("click", async () => {
  publicacaoErro.textContent = "";

  const tipoAtivo = document.querySelector(".tipo-card--ativo");
  if (!tipoAtivo) {
    publicacaoErro.textContent = "Escolha um tipo de registro antes de salvar.";
    return;
  }

  const tipo = tipoAtivo.dataset.tipo;
  if (tipo !== "erro" && tipo !== "script" && tipo !== "procedimento") {
    publicacaoErro.textContent = "Os campos desse tipo de registro ainda não estão prontos para salvar.";
    return;
  }

  const titulo = document.querySelector(".campo-titulo-input")?.value.trim();
  if (!titulo) {
    publicacaoErro.textContent = "Preencha o título da solução.";
    return;
  }

  salvarBtn.disabled = true;
  salvarBtn.textContent = idEdicao ? "Salvando edição..." : "Salvando...";

  try {
    const solucaoId = idEdicao || crypto.randomUUID();

    const [passos, anexos] = await Promise.all([
      coletarPassos(solucaoId),
      coletarAnexos(solucaoId)
    ]);

    const dados = {
      tipo,
      titulo,
      erro: document.querySelector(".campo-textarea")?.value.trim() || "",
      codigo_erro: document.querySelector(".campo-input--codigo")?.value.trim() || "",
      sintomas: coletarTags("tags-campo"),
      tabelas_campos: coletarTags("tabelas-campo"),
      passos,
      anexos,
      codigo: codigoEditorAtivo ? codigoEditorAtivo.getValue().trim() : "",
      parametros: coletarParametros(),
      risco: document.querySelector(".risco-btn--ativo")?.dataset.risco || null,
      reversivel: document.getElementById("reversivel-check")?.checked || false,
      resultado_esperado: document.getElementById("resultado-esperado")?.value.trim() || "",
      autor: document.getElementById("autor-input").value.trim(),
      categoria: document.getElementById("categoria-select").value || null,
      modulo: tipo === "erro" || tipo === "procedimento"
        ? montarCaminho(
            document.getElementById("caminho-pagina-input")?.value.trim(),
            document.getElementById("caminho-texto-input")?.value.trim()
          )
        : null,
      criticidade: document.querySelector(".criticidade-btn--ativo")?.dataset.criticidade || null,
      relacionadas: relacionadasApi ? relacionadasApi.coletar() : []
    };

    let error;

    if (idEdicao) {
      ({ error } = await supabase.from("solucoes").update(dados).eq("id", idEdicao));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from("solucoes").insert({ id: solucaoId, ...dados, criado_por: user.id }));
    }

    if (error) throw error;

    window.location.href = idEdicao ? `index.html?id=${idEdicao}` : "index.html";
  } catch (erro) {
    console.error("Erro ao salvar registro:", erro);
    publicacaoErro.textContent = "Não foi possível salvar. Tente novamente.";
  } finally {
    salvarBtn.disabled = false;
    salvarBtn.textContent = idEdicao ? "Confirmar edição" : "Salvar";
  }
});

async function iniciarModoEdicao() {
  if (!idEdicao) return;

  const { data, error } = await supabase.from("solucoes").select("*").eq("id", idEdicao).single();
  if (error || !data) {
    console.error("Não foi possível carregar a solução para edição:", error);
    return;
  }

  document.title = "Editar | GASO";
  const cabecalhoEl = document.getElementById("pagina-cabecalho");
  if (cabecalhoEl) cabecalhoEl.textContent = "Editar";
  const linkTextoEl = document.getElementById("nova-solucao-link-texto");
  if (linkTextoEl) linkTextoEl.textContent = "Editar";
  salvarBtn.textContent = "Confirmar edição";

  const cardTipo = document.querySelector(`.tipo-card[data-tipo="${data.tipo}"]`);
  if (cardTipo) {
    tipoCards.forEach((c) => c.classList.remove("tipo-card--ativo"));
    cardTipo.classList.add("tipo-card--ativo");
    registroVazio.hidden = true;
    registroCampos.hidden = false;
    caminhoSecaoEl.hidden = data.tipo === "script";

    if (data.tipo === "erro" || data.tipo === "procedimento") {
      criarCamposErro(data, data.tipo);
    } else if (data.tipo === "script") {
      criarCamposScript(data);
    }
  }

  if (data.tipo === "erro" || data.tipo === "procedimento") {
    const { pagina, caminho } = separarCaminho(data.modulo);
    document.getElementById("caminho-pagina-input").value = pagina;
    document.getElementById("caminho-texto-input").value = caminho;
  }

  if (data.criticidade) {
    criticidadeBtns.forEach((b) => b.classList.remove("criticidade-btn--ativo"));
    document.querySelector(`.criticidade-btn[data-criticidade="${data.criticidade}"]`)?.classList.add("criticidade-btn--ativo");
  }

  document.getElementById("autor-input").value = data.autor || "";

  await categoriaApi.pronto;
  if (data.categoria) categoriaApi.selectEl.value = data.categoria;
}

iniciarModoEdicao();
