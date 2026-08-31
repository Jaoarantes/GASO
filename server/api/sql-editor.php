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
