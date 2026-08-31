// Copie este arquivo para tabelas-api-config.js (fora do git) e preencha com
// os valores reais após publicar o endpoint na VPS (server/api/tabelas.php).
//
// Configuração do endpoint de busca de tabelas Oracle (tela SQL).
// O endpoint roda em server/api/tabelas.php, publicado numa VPS que alcança
// a rede interna do Oracle (o site estático da Vercel não consegue chegar
// lá diretamente).
//
// AVISO: como este site não tem etapa de build, TABELAS_API_KEY fica visível
// no JS do navegador para qualquer pessoa já autenticada (a página exige
// login via auth-guard.js antes de renderizar). Não é um segredo forte —
// é só uma barreira contra acesso não autenticado casual ao endpoint.

export const TABELAS_API_URL = "";
export const TABELAS_API_KEY = "";
