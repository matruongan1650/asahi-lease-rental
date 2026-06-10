<?php
declare(strict_types=1);

/**
 * db.php — XServer (PHP + MySQL/MariaDB) 用の共通ライブラリ。
 * フロントエンド(OrderBus)は /api/store と /api/sync を叩く。.htaccess で .php へルーティング。
 * 汎用 KV/ドキュメントモデル: records(store, id, data, deleted, rev, updated_at)。
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function valid_store(?string $name): bool
{
    return $name !== null && preg_match('/^[a-zA-Z0-9_]{1,64}$/', $name) === 1;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $cfgFile = __DIR__ . '/config.php';
    if (!file_exists($cfgFile)) {
        json_out(['error' => 'config.php がありません。config.sample.php をコピーして DB 情報を設定してください。'], 500);
    }
    $cfg = require $cfgFile;
    $dsn = "mysql:host={$cfg['host']};dbname={$cfg['db']};charset=" . ($cfg['charset'] ?? 'utf8mb4');
    $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    ensure_schema($pdo);
    return $pdo;
}

function ensure_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS records (
            store VARCHAR(64) NOT NULL,
            id VARCHAR(191) NOT NULL,
            data LONGTEXT NOT NULL,
            deleted TINYINT(1) NOT NULL DEFAULT 0,
            rev BIGINT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (store, id),
            KEY rev_idx (rev)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec("CREATE TABLE IF NOT EXISTS rev_counter (id INT PRIMARY KEY, val BIGINT NOT NULL)");
    $pdo->exec("INSERT IGNORE INTO rev_counter (id, val) VALUES (1, 0)");
}

/** グローバル連番 rev を採番（接続内アトミック）。 */
function next_rev(PDO $pdo): int
{
    $pdo->exec("UPDATE rev_counter SET val = LAST_INSERT_ID(val + 1) WHERE id = 1");
    return (int) $pdo->query("SELECT LAST_INSERT_ID()")->fetchColumn();
}
