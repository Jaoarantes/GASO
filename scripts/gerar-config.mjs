// Gera public/js/config/tabelas-api-config.js a partir de variáveis de
// ambiente no momento do build da Vercel. Isso evita commitar a API key no
// repositório (que é público), sem depender de nenhuma lib externa.
//
// Rodado como Build Command no projeto da Vercel. Requer as variáveis
// TABELAS_API_URL e TABELAS_API_KEY configuradas em Project Settings >
// Environment Variables.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TABELAS_API_URL = process.env.TABELAS_API_URL || "";
const TABELAS_API_KEY = process.env.TABELAS_API_KEY || "";

if (!TABELAS_API_URL || !TABELAS_API_KEY) {
  console.warn(
    "[gerar-config] TABELAS_API_URL ou TABELAS_API_KEY não definidas — " +
    "a tela SQL ficará sem dados até essas variáveis serem configuradas " +
    "em Project Settings > Environment Variables na Vercel."
  );
}

const destino = fileURLToPath(
  new URL("../public/js/config/tabelas-api-config.js", import.meta.url)
);

const conteudo = `// Gerado automaticamente pelo build (scripts/gerar-config.mjs) a partir das
// Environment Variables TABELAS_API_URL e TABELAS_API_KEY da Vercel.
// Não editar manualmente — este arquivo não é versionado no git.

export const TABELAS_API_URL = ${JSON.stringify(TABELAS_API_URL)};
export const TABELAS_API_KEY = ${JSON.stringify(TABELAS_API_KEY)};
`;

writeFileSync(destino, conteudo, "utf8");
console.log(`[gerar-config] Escrito em ${destino}`);
