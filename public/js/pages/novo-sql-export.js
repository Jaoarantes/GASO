// Funções puras de exportação da grid de resultado do editor SQL. Não
// tocam o DOM além de disparar o download — recebem os dados já prontos
// (colunas, tipos, linhas) e devolvem/baixam o arquivo.
//
// Excel e SQL replicam o formato nativo de export do PL/SQL Developer, para
// bater com os arquivos que a equipe já produz hoje por aquela ferramenta
// (ver docs/sql/modelo export sql.sql e
// docs/sql/Pedidos PDV que não integraram no caixa.xlsx). Naquela ferramenta
// os nomes de coluna aparecem em maiúsculo — por isso os cabeçalhos exibidos
// (Excel, CSV, lista de colunas do `insert into`) usam `coluna.toUpperCase()`,
// enquanto a indexação dos dados (`linha[coluna.toLowerCase()]`, chaves de
// `tiposColuna`) continua usando `colunas` original, em minúsculo, como vem
// do backend (Task 3/5).

function baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function valorOuVazio(linha, coluna) {
  const v = linha[coluna.toLowerCase()];
  return v === null || v === undefined ? "" : v;
}

function pareceDataHora(valor) {
  return typeof valor === "string" && /\d{2}:\d{2}:\d{2}/.test(valor);
}

function formatarDataBR(valor, comHora) {
  // Valores de data vêm do backend como string ISO-like (ex: "2017-03-29"
  // ou "2017-03-29 15:18:15") — normaliza pra DD/MM/YYYY[ HH24:MI:SS].
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return String(valor);
  const [, ano, mes, dia, h, m, s] = match;
  const data = `${dia}/${mes}/${ano}`;
  return comHora && h ? `${data} ${h}:${m}:${s}` : data;
}

// ── Excel ────────────────────────────────────────────────────────────────

function colunaTemDecimal(linhas, coluna) {
  return linhas.some((linha) => {
    const v = valorOuVazio(linha, coluna);
    return typeof v === "number" && !Number.isInteger(v);
  });
}

export function exportarExcel({ colunas, tiposColuna, linhas }) {
  const cabecalhos = colunas.map((c) => c.toUpperCase());
  const dados = [cabecalhos, ...linhas.map((linha) => colunas.map((c) => valorOuVazio(linha, c)))];
  const planilha = window.XLSX.utils.aoa_to_sheet(dados);

  planilha["!cols"] = colunas.map(() => ({ wch: 16 }));
  planilha["!freeze"] = { xSplit: 0, ySplit: 1 };

  colunas.forEach((coluna, indice) => {
    const tipo = tiposColuna[coluna.toLowerCase()] || "texto";
    const letraColuna = window.XLSX.utils.encode_col(indice);

    const enderecoCabecalho = `${letraColuna}1`;
    if (planilha[enderecoCabecalho]) {
      planilha[enderecoCabecalho].s = { font: { name: "Segoe UI", sz: 9, bold: true } };
    }

    let formatoNumero = null;
    if (tipo === "numero") {
      formatoNumero = colunaTemDecimal(linhas, coluna) ? "0.00" : "0";
    } else if (tipo === "data") {
      const comHora = linhas.some((linha) => pareceDataHora(valorOuVazio(linha, coluna)));
      formatoNumero = comHora ? "M/d/yyyy h:mm:ss AM/PM" : "M/d/yyyy";
    }

    for (let linha = 2; linha <= dados.length; linha++) {
      const endereco = `${letraColuna}${linha}`;
      const celula = planilha[endereco];
      if (!celula) continue;
      celula.s = { ...(celula.s || {}), font: { name: "Segoe UI", sz: 9 } };
      if (formatoNumero) {
        celula.z = formatoNumero;
      }
    }
  });

  const livro = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(livro, planilha, "Resultado");
  window.XLSX.writeFile(livro, `resultado-${Date.now()}.xlsx`);
}

// ── CSV ──────────────────────────────────────────────────────────────────

function escaparCsv(valor) {
  const texto = String(valor);
  if (texto.includes(";") || texto.includes('"') || texto.includes("\n")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function exportarCsv({ colunas, tiposColuna, linhas }) {
  const cabecalho = colunas.map((c) => c.toUpperCase()).join(";");
  const corpo = linhas.map((linha) =>
    colunas.map((c) => {
      const tipo = tiposColuna[c.toLowerCase()] || "texto";
      const valor = valorOuVazio(linha, c);
      if (valor === "") return "";
      if (tipo === "data") {
        return escaparCsv(formatarDataBR(valor, pareceDataHora(valor)));
      }
      return escaparCsv(valor);
    }).join(";")
  );

  const conteudo = [cabecalho, ...corpo].join("\r\n");
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
  baixarBlob(blob, `resultado-${Date.now()}.csv`);
}

// ── SQL (formato PL/SQL Developer) ──────────────────────────────────────

function formatarValorSql(valor, tipo) {
  if (valor === "" || valor === null || valor === undefined) return "null";

  if (tipo === "numero") {
    return String(valor);
  }

  if (tipo === "data") {
    const comHora = pareceDataHora(valor);
    const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
    if (!match) return `'${String(valor).replace(/'/g, "''")}'`;
    const [, ano, mes, dia, h, m, s] = match;
    if (comHora && h) {
      return `to_date('${dia}-${mes}-${ano} ${h}:${m}:${s}', 'dd-mm-yyyy hh24:mi:ss')`;
    }
    return `to_date('${dia}-${mes}-${ano}', 'dd-mm-yyyy')`;
  }

  return `'${String(valor).replace(/'/g, "''")}'`;
}

export function exportarSql({ colunas, tiposColuna, linhas, tabela }) {
  const listaColunas = colunas.map((c) => c.toUpperCase()).join(", ");
  const linhasSql = linhas.map((linha) => {
    const valores = colunas.map((c) => {
      const tipo = tiposColuna[c.toLowerCase()] || "texto";
      return formatarValorSql(valorOuVazio(linha, c), tipo);
    }).join(", ");
    return `insert into ${tabela} (${listaColunas})\nvalues (${valores});`;
  });

  const conteudo = [
    `prompt Importing table ${tabela}...`,
    "set feedback off",
    "set define off",
    ...linhasSql,
    "",
    "prompt Done.",
  ].join("\n");

  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  baixarBlob(blob, `${tabela}-${Date.now()}.sql`);
}
