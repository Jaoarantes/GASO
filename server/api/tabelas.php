<?php
// server/api/tabelas.php — endpoint da tela SQL do projeto GASO.
// Roda na VPS (dentro da rede que alcança o Oracle) e serve como ponte entre
// o site estático (Vercel) e o banco Oracle nlprod. Extraído da lógica de
// conexão Oracle de server/conecta.php — não inclui MySQL Locaweb/financeiro,
// que não têm relação com esta tela.
//
// Duas ações via ?acao=:
//   filtros — devolve os valores distintos de módulo/tipo (pros <select>).
//   buscar  — recebe q/modulo/tipo, pontua cada tabela pelos termos digitados
//             (nome pesa mais que descrição) e devolve só as que pontuam,
//             ordenadas da mais relevante pra menos relevante.
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

// Base comum: calcula tabela/modulo/tipo/descricao a partir do catálogo do
// Oracle. As demais queries usam isso como subquery (WITH).
const SQL_BASE_CATALOGO = <<<SQL
WITH catalogo AS (
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
)
SQL;

function normalizar_lista(array $linhas): array {
    return array_map(
        fn(array $linha): array => array_change_key_case($linha, CASE_LOWER),
        $linhas
    );
}

$acao = $_GET['acao'] ?? '';

if ($acao === 'filtros') {
    $sql = SQL_BASE_CATALOGO . "\nSELECT DISTINCT modulo, tipo FROM catalogo ORDER BY modulo, tipo";
    try {
        $pdo = pdo_oracle();
        $linhas = normalizar_lista($pdo->query($sql)->fetchAll());
    } catch (Throwable $e) {
        responder_erro(500, 'Erro ao consultar o banco de dados.');
    }

    echo json_encode([
        'modulos' => array_values(array_unique(array_column($linhas, 'modulo'))),
        'tipos'   => array_values(array_unique(array_column($linhas, 'tipo'))),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($acao === 'buscar') {
    $termoBusca = trim((string)($_GET['q'] ?? ''));
    $modulo     = trim((string)($_GET['modulo'] ?? ''));
    $tipo       = trim((string)($_GET['tipo'] ?? ''));
    $termos     = array_values(array_filter(
        preg_split('/\s+/', $termoBusca) ?: [],
        fn(string $t): bool => mb_strlen($t) >= 3
    ));

    if ($termos === [] && $modulo === '' && $tipo === '') {
        echo json_encode([], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Cada ocorrência do termo na query usa seu próprio parâmetro nomeado —
    // o driver ODBC do Oracle não suporta reutilizar o mesmo parâmetro
    // nomeado mais de uma vez na mesma query preparada.
    $condicoes = [];
    $pontuacao = [];
    $params = [];

    foreach ($termos as $i => $termoOriginal) {
        $valor = '%' . strtoupper($termoOriginal) . '%';

        $pCond  = ":t{$i}cond";
        $pCondD = ":t{$i}condd";
        $pPontN = ":t{$i}pn";
        $pPontD = ":t{$i}pd";

        $params[$pCond]  = $valor;
        $params[$pCondD] = $valor;
        $params[$pPontN] = $valor;
        $params[$pPontD] = $valor;

        $condicoes[] = "(UPPER(tabela) LIKE {$pCond} OR UPPER(NVL(descricao, ' ')) LIKE {$pCondD})";
        $pontuacao[] = "(CASE WHEN UPPER(tabela) LIKE {$pPontN} THEN 2 ELSE 0 END)";
        $pontuacao[] = "(CASE WHEN UPPER(NVL(descricao, ' ')) LIKE {$pPontD} THEN 1 ELSE 0 END)";
    }

    // Bônus por correspondência do texto completo digitado contra o nome da
    // tabela — sem isso, "pe_pedidos" pontua igual para PE_PEDIDOS (match
    // exato) e AI_PE_PEDIDOS_WAKE (só contém a substring), empatando e caindo
    // no desempate alfabético em vez de priorizar o match exato.
    if ($termos !== []) {
        $textoCompleto = strtoupper($termoBusca);
        $params[':textoExato']    = $textoCompleto;
        $params[':textoComeca']   = $textoCompleto . '%';
        $params[':textoContem']   = '%' . $textoCompleto . '%';

        $pontuacao[] = "(CASE WHEN UPPER(tabela) = :textoExato THEN 1000 ELSE 0 END)";
        $pontuacao[] = "(CASE WHEN UPPER(tabela) LIKE :textoComeca THEN 500 ELSE 0 END)";
        $pontuacao[] = "(CASE WHEN UPPER(tabela) LIKE :textoContem THEN 100 ELSE 0 END)";
    }

    $filtrosExtras = [];
    if ($modulo !== '') {
        $filtrosExtras[] = 'modulo = :modulo';
        $params[':modulo'] = $modulo;
    }
    if ($tipo !== '') {
        $filtrosExtras[] = 'tipo = :tipo';
        $params[':tipo'] = $tipo;
    }

    $pontuacaoSql = $pontuacao === [] ? '0' : implode(' + ', $pontuacao);
    $whereTermos = $condicoes === [] ? [] : ['(' . implode(' OR ', $condicoes) . ')'];
    $whereClausulas = array_merge($whereTermos, $filtrosExtras);
    $whereSql = $whereClausulas === [] ? '1 = 1' : implode(' AND ', $whereClausulas);

    // Sem termos digitados (só filtros de módulo/tipo): não há pontuação por
    // relevância, ordena por nome.
    $ordemSql = $termos === [] ? 'tabela ASC' : 'pontuacao DESC, tabela ASC';

    $sql = SQL_BASE_CATALOGO . <<<SQL

    SELECT tabela, modulo, tipo, descricao, {$pontuacaoSql} AS pontuacao
    FROM catalogo
    WHERE {$whereSql}
    ORDER BY {$ordemSql}
    SQL;

    try {
        $pdo = pdo_oracle();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $linhas = normalizar_lista($stmt->fetchAll());
    } catch (Throwable $e) {
        responder_erro(500, 'Erro ao consultar o banco de dados.');
    }

    // Pontuação é só um detalhe de ordenação no servidor, não precisa ir pro
    // frontend.
    $linhas = array_map(function (array $linha): array {
        unset($linha['pontuacao']);
        return $linha;
    }, $linhas);

    echo json_encode($linhas, JSON_UNESCAPED_UNICODE);
    exit;
}

responder_erro(400, 'Parâmetro acao inválido. Use acao=filtros ou acao=buscar.');
