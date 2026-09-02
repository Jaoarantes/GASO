<?php
// server/api/sql-editor.php — endpoint da tela "Novo SQL" do projeto GASO.
// Executa SQL livre (SELECT, UPDATE, DELETE, CREATE, etc.) contra o Oracle
// nlprod. Sem allowlist/blocklist de comandos — a única proteção é a API key
// (mesma barreira de tabelas.php) e a confirmação feita no frontend antes de
// enviar comandos que não sejam SELECT.
declare(strict_types=1);

require __DIR__ . '/_common.php';

carregar_dotenv(__DIR__ . '/.env');

header('Content-Type: application/json; charset=utf-8');

// CORS aberto: mesma justificativa de tabelas.php — a proteção de acesso é
// só a API key, não o domínio de origem.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: X-API-Key, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function responder_erro(int $status, string $mensagem): never {
    http_response_code($status);
    echo json_encode(['erro' => $mensagem], JSON_UNESCAPED_UNICODE);
    exit;
}

$apiKeyEsperada = getenv('TABELAS_API_KEY') ?: '';
$apiKeyRecebida = $_SERVER['HTTP_X_API_KEY'] ?? '';

if ($apiKeyEsperada === '' || !hash_equals($apiKeyEsperada, $apiKeyRecebida)) {
    responder_erro(401, 'Não autorizado.');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder_erro(405, 'Método não permitido.');
}

$corpo = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($corpo)) {
    responder_erro(400, 'Corpo da requisição inválido — envie JSON com { "sql": "..." }.');
}

$sql = trim((string)($corpo['sql'] ?? ''));
if ($sql === '') {
    responder_erro(400, 'Informe um comando SQL.');
}

function normalizar_lista(array $linhas): array {
    return array_map(
        fn(array $linha): array => array_change_key_case($linha, CASE_LOWER),
        $linhas
    );
}

// Detecta se o SELECT é de uma única tabela (sem JOIN, sem múltiplas
// tabelas separadas por vírgula, sem UNION), condição para liberar edição
// via ROWID. Conservadora de propósito: prefere recusar um SELECT de
// tabela única com sintaxe incomum a arriscar detectar errado.
function detectar_tabela_editavel(string $sql): ?string {
    // Remove comentários de linha e de bloco antes de analisar, para não
    // confundir "JOIN"/"UNION" dentro de um comentário com SQL real.
    $semComentarios = preg_replace('/--.*$/m', '', $sql);
    $semComentarios = preg_replace('/\/\*.*?\*\//s', '', (string)$semComentarios);

    if (!is_string($semComentarios)) {
        return null;
    }

    // Só SELECT simples: nenhuma dessas palavras-chave pode aparecer fora
    // de uma string literal. Checagem grosseira (não ignora strings), mas
    // suficiente para o caso de uso — SQL interno digitado por analistas,
    // não input adversarial tentando burlar a detecção (a proteção real
    // contra escrita indevida é o UPDATE parametrizado com ROWID, não esta
    // função).
    if (preg_match('/\b(JOIN|UNION)\b/i', $semComentarios)) {
        return null;
    }

    // Precisa ter exatamente um FROM.
    if (preg_match_all('/\bFROM\b/i', $semComentarios) !== 1) {
        return null;
    }

    // Captura o trecho depois do FROM até a próxima cláusula relevante ou
    // fim da string.
    if (!preg_match(
        '/\bFROM\s+([A-Za-z_][A-Za-z0-9_$#]*)\s*([A-Za-z_][A-Za-z0-9_$#]*)?\s*(?=WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|FOR\s+UPDATE|$)/is',
        $semComentarios,
        $m
    )) {
        return null;
    }

    $tabela = strtoupper($m[1]);

    // Se o que vier depois do nome de tabela capturado for outro
    // identificador seguido de vírgula, é multi-tabela — mas o regex acima
    // já para antes de vírgula por não estar na lista de terminadores, então
    // uma vírgula logo após o nome derruba o match de alias e sobra vírgula
    // no meio do caminho: checagem explícita por segurança.
    if (str_contains($m[0], ',')) {
        return null;
    }

    if (!preg_match('/^[A-Z_][A-Z0-9_$#]*$/', $tabela)) {
        return null;
    }

    return $tabela;
}

$ehSelect = (bool)preg_match('/^\s*select\b/i', $sql);

try {
    $pdo = pdo_oracle();
} catch (Throwable $e) {
    responder_erro(500, 'Erro ao conectar no banco de dados.');
}

try {
    if ($ehSelect) {
        $linhas = normalizar_lista($pdo->query($sql)->fetchAll());
        $colunas = $linhas === [] ? [] : array_keys($linhas[0]);
        echo json_encode([
            'tipo'    => 'select',
            'colunas' => $colunas,
            'linhas'  => $linhas,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $linhasAfetadas = $pdo->exec($sql);
    echo json_encode([
        'tipo'           => 'comando',
        'linhasAfetadas' => $linhasAfetadas === false ? 0 : $linhasAfetadas,
    ], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Throwable $e) {
    responder_erro(400, $e->getMessage());
}
