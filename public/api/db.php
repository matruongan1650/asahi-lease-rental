<?php
declare(strict_types=1);

/**
 * db.php — XServer (PHP + MySQL/MariaDB) 用の共通ライブラリ。
 * フロントエンド(OrderBus)は /api/store と /api/sync を叩く。.htaccess で .php へルーティング。
 * 汎用 KV/ドキュメントモデル: records(store, id, data, deleted, rev, updated_at)。
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Token, X-User-Token');
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

/** config.php を一度だけ読み込んでキャッシュ。存在しなければ空配列。 */
function get_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $cfgFile = __DIR__ . '/config.php';
    $cfg = file_exists($cfgFile) ? (array) (require $cfgFile) : [];
    return $cfg;
}

/**
 * データ系エンドポイント（store/sync/query/upload）の共有トークン認証。
 * config の api_token が設定されている場合のみ有効。空なら後方互換でスキップする。
 * クライアント(SPA/APK)はビルド時の VITE_API_TOKEN を X-Api-Token ヘッダで送る。
 */
function require_api_token(): void
{
    $token = (string) (get_config()['api_token'] ?? '');
    if ($token === '') {
        return; // 未設定 → 認証無効（本番では必ず設定すること）
    }
    $given = (string) ($_SERVER['HTTP_X_API_TOKEN'] ?? '');
    if (!hash_equals($token, $given)) {
        json_out(['error' => 'unauthorized'], 401);
    }
}

function valid_store(?string $name): bool
{
    return $name !== null && preg_match('/^[a-zA-Z0-9_]{1,64}$/', $name) === 1;
}

/**
 * ユーザートークン(X-User-Token)の HMAC 署名鍵を返す。
 * サーバー専用の auth_secret を最優先で使い、未設定なら後方互換で api_token にフォールバックする。
 * api_token はクライアント(SPA/APK)に配布されるため、これを署名鍵に流用するとアプリを持つ者なら
 * 誰でも任意の uid/role(=admin) でトークンを偽造できてしまう。本番では config に auth_secret
 * （クライアントに渡さない長いランダム値）を設定し、署名鍵を api_token と分離すること。
 */
function auth_secret(): string
{
    $cfg = get_config();
    $s = (string) ($cfg['auth_secret'] ?? '');
    return $s !== '' ? $s : (string) ($cfg['api_token'] ?? '');
}

/**
 * 署名付きユーザートークン(X-User-Token, auth.php 発行)を検証して {uid, role} を返す。
 * 無い/不正/期限切れなら null。既存エンドポイントは null を許容する（後方互換・段階導入）。
 * 署名鍵は auth_secret()（auth.php と一致）。
 */
function current_user(): ?array
{
    $raw = (string) ($_SERVER['HTTP_X_USER_TOKEN'] ?? '');
    if ($raw === '' || strpos($raw, '.') === false) {
        return null;
    }
    $parts = explode('.', $raw, 2);
    if (count($parts) !== 2) {
        return null;
    }
    [$payloadB64, $sig] = $parts;
    $secret = auth_secret();
    if ($secret === '' || $payloadB64 === '' || $sig === '') {
        return null;
    }
    $expected = hash_hmac('sha256', $payloadB64, $secret);
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $json = base64_decode(strtr($payloadB64, '-_', '+/'), true);
    if ($json === false) {
        return null;
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        return null;
    }
    if (isset($data['exp']) && is_numeric($data['exp']) && time() > (int) $data['exp']) {
        return null;
    }
    $uid = (string) ($data['uid'] ?? '');
    if ($uid === '') {
        return null;
    }
    return ['uid' => $uid, 'role' => (string) ($data['role'] ?? '')];
}

/** 特権ロール（管理者/スタッフ）か。顧客(customer/customer_staff)は false。 */
function is_privileged_role(?string $role): bool
{
    return $role === 'admin' || $role === 'staff';
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $cfg = get_config();
    if (!$cfg) {
        json_out(['error' => 'config.php がありません。config.sample.php をコピーして DB 情報を設定してください。'], 500);
    }
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
