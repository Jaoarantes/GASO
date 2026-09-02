<?php
// server/api/sql-editor.php — endpoint da tela "Novo SQL" do projeto GASO.
// Executa SQL livre (SELECT, UPDATE, DELETE, CREATE, etc.) contra o Oracle
// nlprod. Sem allowlist/blocklist de comandos — a única proteção é a API key
// (mesma barreira de tabelas.php) e a confirmação feita no frontend antes de
// enviar comandos que não sejam SELECT.
declare(strict_types=1);

// Algumas tabelas (ex: logs de auditoria grandes) fazem consultas legitimamente
// lentas, que passariam do limite padrão do PHP (geralmente 30s) e derrubariam
// a conexão antes mesmo do frontend desistir. 5 minutos, alinhado com o timeout
// do fetch no frontend (novo-sql.js).
set_time_limit(300);

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

if (($corpo['tipo'] ?? '') === 'update-lote') {
    $tabela = strtoupper(trim((string)($corpo['tabela'] ?? '')));
    $alteracoes = is_array($corpo['alteracoes'] ?? null) ? $corpo['alteracoes'] : [];

    if (!preg_match('/^[A-Z_][A-Z0-9_$#]*$/', $tabela)) {
        responder_erro(400, 'Nome de tabela inválido.');
    }

    if ($alteracoes === []) {
        responder_erro(400, 'Nenhuma alteração informada.');
    }

    // Agrupa por rowid: uma linha pode ter várias células alteradas, que
    // viram um único UPDATE com múltiplos SET.
    $porLinha = [];
    foreach ($alteracoes as $alt) {
        $rowid = (string)($alt['rowid'] ?? '');
        $coluna = strtoupper((string)($alt['coluna'] ?? ''));
        $valorNovo = $alt['valorNovo'] ?? null;

        // Formato restrito de ROWID do Oracle: 18 caracteres em um alfabeto
        // base64-like. Um rowid malformado passado direto ao Oracle vira
        // ORA-01410 (invalid ROWID) e derruba o lote inteiro com mensagem
        // crua — validar aqui evita a ida ao banco só para falhar.
        if (!preg_match('/^[A-Za-z0-9+\/]{18}$/', $rowid) || !preg_match('/^[A-Z_][A-Z0-9_$#]*$/', $coluna)) {
            responder_erro(400, 'Alteração inválida: rowid ou coluna ausente/malformado.');
        }

        $porLinha[$rowid][$coluna] = $valorNovo;
    }

    // Conexão isolada do try da transação: se pdo_oracle() lançar aqui,
    // $pdo nunca chega a ser atribuída, e o catch abaixo (que consulta
    // $pdo->inTransaction()) precisa de uma $pdo garantidamente definida.
    try {
        $pdo = pdo_oracle();
    } catch (Throwable $e) {
        responder_erro(500, 'Erro ao conectar no banco de dados.');
    }

    try {
        $pdo->beginTransaction();

        $linhasAfetadas = 0;
        foreach ($porLinha as $rowid => $colunasValores) {
            $sets = [];
            $params = [':rowid' => $rowid];
            $i = 0;
            foreach ($colunasValores as $coluna => $valor) {
                $param = ":v{$i}";
                // Reaproveita a mesma conversão de literal de data usada no
                // restante do editor (literais 'DD/MM/YYYY' entre aspas),
                // aplicada aqui diretamente ao valor recebido antes do bind.
                $sets[] = "{$coluna} = {$param}";
                $params[$param] = $valor;
                $i++;
            }

            $sqlUpdate = "UPDATE {$tabela} SET " . implode(', ', $sets) . " WHERE ROWID = :rowid";
            $stmt = $pdo->prepare($sqlUpdate);
            $stmt->execute($params);
            $linhasAfetadas += $stmt->rowCount();
        }

        $pdo->commit();

        echo json_encode([
            'tipo'           => 'update-lote',
            'linhasAfetadas' => $linhasAfetadas,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // Não repassa a mensagem crua do Oracle ao cliente neste endpoint de
        // escrita (diferente do padrão usado no restante do arquivo para
        // SELECT/comando) — evita vazar detalhe interno em um fluxo que já
        // altera dados. Detalhe fica só no log do servidor.
        error_log('sql-editor update-lote: ' . $e->getMessage());
        responder_erro(400, 'Erro ao gravar alterações.');
    }
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

// Remove comentários de linha (--) e de bloco (/* */) de um SQL. Usada
// tanto para detectar se um comando é SELECT (ignorando comentários que o
// usuário costuma colocar antes da query, ex: docs/sql/*.sql) quanto para
// analisar a estrutura da query em detectar_tabela_editavel().
function remover_comentarios_sql(string $sql): string {
    $semComentarios = preg_replace('/--.*$/m', '', $sql);
    $semComentarios = preg_replace('/\/\*.*?\*\//s', '', (string)$semComentarios);
    return is_string($semComentarios) ? $semComentarios : $sql;
}

// Detecta se o SELECT é de uma única tabela (sem JOIN, sem múltiplas
// tabelas separadas por vírgula, sem UNION), condição para liberar edição
// via ROWID. Conservadora de propósito: prefere recusar um SELECT de
// tabela única com sintaxe incomum a arriscar detectar errado.
function detectar_tabela_editavel(string $sql): ?string {
    $semComentarios = remover_comentarios_sql($sql);

    // Só SELECT simples: nenhuma dessas palavras-chave pode aparecer fora
    // de uma string literal. Checagem grosseira (não ignora strings), mas
    // suficiente para o caso de uso — SQL interno digitado por analistas,
    // não input adversarial tentando burlar a detecção (a proteção real
    // contra escrita indevida é o UPDATE parametrizado com ROWID, não esta
    // função).
    if (preg_match('/\b(JOIN|UNION)\b/i', $semComentarios)) {
        return null;
    }

    // DISTINCT, GROUP BY e funções de agregação produzem um resultado que
    // não corresponde 1:1 a linhas físicas da tabela — Oracle proíbe
    // selecionar ROWID sobre uma subquery com qualquer um desses (ORA-01446).
    // Sem essa checagem, envolver a query com "SELECT t.*, t.ROWID ..."
    // quebraria consultas que antes rodavam normalmente como SELECT comum.
    if (preg_match('/\bDISTINCT\b/i', $semComentarios)) {
        return null;
    }
    if (preg_match('/\bGROUP\s+BY\b/i', $semComentarios)) {
        return null;
    }
    if (preg_match('/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i', $semComentarios)) {
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

// Busca o tipo Oracle de cada coluna de $tabela em USER_TAB_COLUMNS (mesma
// fonte que tabelas.php já usa para a tela "Estrutura de Tabelas") e
// simplifica para as 3 categorias que a UI precisa: numero, data, texto.
// Mais confiável que ler o metadado do driver ODBC via getColumnMeta(),
// que costuma devolver tipos genéricos/incompletos nesse driver.
function tipos_coluna_da_tabela(PDO $pdo, string $tabela): array {
    $sql = "SELECT column_name AS coluna, data_type AS tipo"
         . " FROM user_tab_columns"
         . " WHERE table_name = :tabela";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':tabela' => $tabela]);
    $linhas = normalizar_lista($stmt->fetchAll());

    $mapa = [];
    foreach ($linhas as $linha) {
        $nomeColuna = strtolower((string)$linha['coluna']);
        $tipoOracle = strtoupper((string)$linha['tipo']);

        if (str_contains($tipoOracle, 'DATE') || str_contains($tipoOracle, 'TIMESTAMP')) {
            $mapa[$nomeColuna] = 'data';
        } elseif (in_array($tipoOracle, ['NUMBER', 'FLOAT', 'INTEGER'], true)) {
            $mapa[$nomeColuna] = 'numero';
        } else {
            $mapa[$nomeColuna] = 'texto';
        }
    }

    return $mapa;
}

// Fallback quando não há tabela conhecida (SELECT não editável): classifica
// pelo valor já trazido na primeira linha do resultado, sem consulta extra
// ao Oracle. Menos preciso, mas suficiente para formatar export/exibição
// quando não dá pra confiar em metadados de uma tabela única.
function tipos_coluna_por_inferencia(array $colunas, array $linhas): array {
    $mapa = [];
    $primeiraLinha = $linhas[0] ?? [];

    foreach ($colunas as $coluna) {
        $valor = $primeiraLinha[strtolower($coluna)] ?? null;

        if ($valor === null) {
            $mapa[strtolower($coluna)] = 'texto';
        } elseif (is_numeric($valor)) {
            $mapa[strtolower($coluna)] = 'numero';
        } elseif (preg_match('/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?$/', (string)$valor)) {
            $mapa[strtolower($coluna)] = 'data';
        } else {
            $mapa[strtolower($coluna)] = 'texto';
        }
    }

    return $mapa;
}

// Ignora comentários (--, /* */) antes de decidir se é SELECT — sem isso,
// um SQL com comentários explicativos no início (padrão comum nos scripts
// de docs/sql/*.sql) era classificado como "comando" em vez de SELECT,
// caindo em $pdo->exec($sql) em vez do fluxo de busca/paginação — o Oracle
// então devolvia ORA-24374 ("define not done before fetch") ao tentar
// executar um SELECT como se fosse um comando sem resultado.
$ehSelect = (bool)preg_match('/^\s*select\b/i', remover_comentarios_sql($sql));

try {
    $pdo = pdo_oracle();
} catch (Throwable $e) {
    responder_erro(500, 'Erro ao conectar no banco de dados.');
}

const TAMANHO_PAGINA = 100;

// Remove um FOR UPDATE de fim de statement, se houver — não faz sentido
// dentro da subquery paginada e o lock de linha não é necessário para o
// fluxo de batch update via ROWID.
function remover_for_update(string $sql): string {
    return (string)preg_replace('/\s+FOR\s+UPDATE\s*$/i', '', trim($sql));
}

try {
    if ($ehSelect) {
        $sqlBase = remover_for_update($sql);
        $tabelaEditavel = detectar_tabela_editavel($sqlBase);

        // ROWIDTOCHAR converte a pseudo-coluna ROWID (tipo binário especial)
        // para VARCHAR2 antes de sair do Oracle — o driver PDO ODBC desta
        // VPS falha com ORA-24374 ("define not done before fetch") ao tentar
        // descrever/definir automaticamente um ROWID bruto misturado com
        // t.* numa subquery (confirmado: a mesma query com t.ROWID puro roda
        // normalmente no PL/SQL Developer/OCI, só quebra via ODBC). Como o
        // ROWID já é tratado como string em todo o resto do código (JSON,
        // bind parameter no update-lote), convertê-lo aqui não muda nada
        // além de evitar o describe problemático.
        $sqlComRowid = $tabelaEditavel !== null
            ? "SELECT t.*, ROWIDTOCHAR(t.ROWID) AS GASO_ROWID FROM ({$sqlBase}) t"
            : $sqlBase;

        $ultimaPagina = (bool)($corpo['ultimaPagina'] ?? false);
        $pagina = max(1, (int)($corpo['pagina'] ?? 1));

        if ($ultimaPagina) {
            $stmtCount = $pdo->query("SELECT COUNT(*) AS total FROM ({$sqlComRowid})");
            $total = (int)$stmtCount->fetchColumn();
            $pagina = $total === 0 ? 1 : (int)ceil($total / TAMANHO_PAGINA);
        }

        $offset = ($pagina - 1) * TAMANHO_PAGINA;
        $tamanhoBusca = TAMANHO_PAGINA + 1;

        // OFFSET/FETCH NEXT como bind parameter (:offset/:tamanho) causa
        // ORA-24374 ("define not done before fetch") no driver PDO ODBC
        // usado nesta VPS — confirmado que o mesmo SQL com esses valores
        // literais roda normalmente direto no Oracle. $offset/$tamanhoBusca
        // são sempre inteiros calculados internamente (nunca vêm de input
        // livre do usuário), então interpolar aqui é seguro.
        $sqlPaginado = "SELECT * FROM ({$sqlComRowid})"
                     . " OFFSET {$offset} ROWS FETCH NEXT {$tamanhoBusca} ROWS ONLY";

        $stmt = $pdo->prepare($sqlPaginado);
        $stmt->execute();
        $linhasBrutas = normalizar_lista($stmt->fetchAll());

        $temProximaPagina = count($linhasBrutas) > TAMANHO_PAGINA;
        $linhasBrutas = array_slice($linhasBrutas, 0, TAMANHO_PAGINA);

        // "colunas" nunca inclui a pseudo-coluna reservada gaso_rowid.
        $colunas = $linhasBrutas === []
            ? []
            : array_values(array_filter(
                array_keys($linhasBrutas[0]),
                fn(string $c): bool => $c !== 'gaso_rowid'
              ));
        $colunasMinusculas = array_map('strtolower', $colunas);

        $tiposColuna = $tabelaEditavel !== null
            ? tipos_coluna_da_tabela($pdo, $tabelaEditavel)
            : tipos_coluna_por_inferencia($colunasMinusculas, $linhasBrutas);

        // Filtra tiposColuna só para as colunas que de fato vieram no
        // resultado (uma tabela pode ter colunas que o SELECT não pediu).
        $tiposColunaFiltrado = array_intersect_key(
            $tiposColuna,
            array_flip($colunasMinusculas)
        );

        echo json_encode([
            'tipo'             => 'select',
            'colunas'          => $colunasMinusculas,
            'tiposColuna'      => $tiposColunaFiltrado,
            'linhas'           => $linhasBrutas,
            'pagina'           => $pagina,
            'temProximaPagina' => $temProximaPagina,
            'editavel'         => $tabelaEditavel !== null,
            'tabela'           => $tabelaEditavel,
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
