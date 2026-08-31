<?php
// server/api/_common.php — helpers compartilhados pelos endpoints da VPS
// (tabelas.php, sql-editor.php): parser de .env e conexão Oracle via PDO ODBC.
declare(strict_types=1);

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
