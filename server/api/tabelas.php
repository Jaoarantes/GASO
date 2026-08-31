<?php
// server/api/tabelas.php — endpoint da tela SQL do projeto GASO.
// Roda na VPS (dentro da rede que alcança o Oracle) e serve como ponte entre
// o site estático (Vercel) e o banco Oracle nlprod. Extraído da lógica de
// conexão Oracle de server/conecta.php — não inclui MySQL Locaweb/financeiro,
// que não têm relação com esta tela.
declare(strict_types=1);

// ── Carrega variáveis de server/api/.env (sem depender de SetEnv/Composer,
// já que o acesso a esta VPS é só via FTP) ─────────────────────────────────
function carregar_dotenv(string $caminho): void {
    if (!is_file($caminho)) return;
    foreach (file($caminho, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linha) {
        $linha = trim($linha);
        if ($linha === '' || str_starts_with($linha, '#')) continue;
        if (!str_contains($linha, '=')) continue;
        [$chave, $valor] = explode('=', $linha, 2);
        $chave = trim($chave);
        $valor = trim($valor);
        if (strlen($valor) >= 2 && (
            ($valor[0] === '"' && str_ends_with($valor, '"'))
            || ($valor[0] === "'" && str_ends_with($valor, "'"))
        )) {
            $valor = substr($valor, 1, -1);
        }
        if ($chave === '') continue;
        putenv("$chave=$valor");
        $_ENV[$chave] = $valor;
    }
}

carregar_dotenv(__DIR__ . '/.env');

header('Content-Type: application/json; charset=utf-8');

$allowedOrigin = getenv('TABELAS_ALLOWED_ORIGIN') ?: '';
if ($allowedOrigin !== '') {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: X-API-Key');

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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    responder_erro(405, 'Método não permitido.');
}

// ── Conexão Oracle via PDO ODBC ──────────────────────────────────────────
function _oracle_cached_driver(): ?string {
    $file = sys_get_temp_dir() . '/gaso_oracle_driver.cache';
    if (is_file($file) && (time() - filemtime($file)) < 86400) {
        $d = trim((string)file_get_contents($file));
        if ($d !== '') return $d;
    }
    return null;
}

function _oracle_save_driver_cache(string $driver): void {
    $file = sys_get_temp_dir() . '/gaso_oracle_driver.cache';
    @file_put_contents($file, $driver);
}

function pdo_oracle(): PDO {
    $host    = getenv('ORA_HOST') ?: '';
    $port    = getenv('ORA_PORT') ?: '';
    $service = getenv('ORA_SERVICE') ?: '';
    $user    = getenv('ORA_USER') ?: '';
    $pass    = getenv('ORA_PASS') ?: '';

    if ($host === '' || $port === '' || $service === '' || $user === '') {
        throw new RuntimeException('Configuração de conexão Oracle incompleta.');
    }

    @putenv('NLS_LANG=.AL32UTF8');
    @putenv('NLS_NCHAR=UTF8');

    $allDrivers = [
        '{Oracle in instantclient_23_0}',
        '{Oracle 19 ODBC driver}',
        '{Oracle 12 ODBC driver}',
        '{Oracle in instantclient}',
        '{Oracle ODBC driver}',
    ];

    $cached = _oracle_cached_driver();
    if ($cached !== null) {
        try {
            $cs = sprintf('odbc:Driver=%s;DBQ=%s:%s/%s;UID=%s;PWD=%s', $cached, $host, $port, $service, $user, $pass);
            return new PDO($cs, null, null, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        } catch (Throwable) {
            // Cache inválido — faz detecção completa abaixo.
        }
    }

    $err = null;
    foreach ($allDrivers as $d) {
        try {
            $cs = sprintf('odbc:Driver=%s;DBQ=%s:%s/%s;UID=%s;PWD=%s', $d, $host, $port, $service, $user, $pass);
            $instance = new PDO($cs, null, null, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            _oracle_save_driver_cache($d);
            return $instance;
        } catch (Throwable $e) {
            $err = $e->getMessage();
        }
    }

    throw new RuntimeException('Falha ao conectar no Oracle via PDO ODBC. Último erro: ' . ($err ?: 'desconhecido'));
}

// ── Consulta ──────────────────────────────────────────────────────────────
const SQL_CATALOGO_TABELAS = <<<SQL
SELECT
    tc.table_name AS tabela,
    CASE
        WHEN tc.table_name LIKE 'APEX\$%'
          OR tc.table_name LIKE 'MLOG\$%'
          OR tc.table_name LIKE 'CMP3\$%'
          OR tc.table_name LIKE 'JAVA\$%'
          OR tc.table_name LIKE 'CREATE\$JAVA\$%'
            THEN '(sem padrao)'
        WHEN INSTR(tc.table_name, '_') = 0
            THEN '(sem padrao)'
        ELSE SUBSTR(tc.table_name, 1, INSTR(tc.table_name, '_') - 1)
    END AS modulo,
    CASE
        WHEN tc.table_name LIKE 'APEX\$%'
          OR tc.table_name LIKE 'MLOG\$%'
          OR tc.table_name LIKE 'CMP3\$%'
          OR tc.table_name LIKE 'JAVA\$%'
          OR tc.table_name LIKE 'CREATE\$JAVA\$%'
            THEN 'Sistema (Oracle/APEX)'
        WHEN INSTR(tc.table_name, '_') = 0
            THEN 'Diversos/Nao padronizado'
        WHEN SUBSTR(tc.table_name, 1, INSTR(tc.table_name, '_') - 1) LIKE '%W'
            THEN 'Trabalho/Temporaria'
        ELSE 'Cadastro/Base'
    END AS tipo,
    tc.comments AS descricao
FROM ALL_TAB_COMMENTS tc
WHERE tc.owner      = USER
  AND tc.table_type = 'TABLE'
ORDER BY tabela ASC
SQL;

try {
    $pdo = pdo_oracle();
    $stmt = $pdo->query(SQL_CATALOGO_TABELAS);
    $linhas = $stmt->fetchAll();
} catch (Throwable $e) {
    responder_erro(500, 'Erro ao consultar o banco de dados.');
}

// O driver ODBC do Oracle devolve nomes de coluna em maiúsculo
// independentemente do alias usado no SQL — normaliza para minúsculo antes
// de responder, já que o frontend espera { tabela, modulo, tipo, descricao }.
$linhas = array_map(
    fn(array $linha): array => array_change_key_case($linha, CASE_LOWER),
    $linhas
);

echo json_encode($linhas, JSON_UNESCAPED_UNICODE);
