<?php
declare(strict_types=1);

/**
 * auth.php — ユーザー資格情報を検証し、署名付き(HMAC)ユーザートークンを発行する。
 *
 * 目的: データAPI(store/query/sync)で「誰が呼んでいるか(userId/role)」をサーバーが信頼できるようにする。
 * クライアントが userId を自己申告するだけでは偽装可能なため、サーバーが資格情報を検証して
 * 改ざん不能な署名トークンを発行する。署名鍵は auth_secret()（サーバー専用。未設定時のみ
 * 後方互換で api_token にフォールバック。本番では api_token と別の秘密を必ず設定すること）。
 *
 * 後方互換: 既存エンドポイントの挙動は変えない。このファイルは独立しており、未デプロイ/失敗しても
 * store/query/sync には影響しない。ユーザートークンの「強制」は別フェーズ（全クライアント更新後）。
 */

require __DIR__ . '/db.php';

// 共有トークン（アプリのバンドルが保持）でまずゲート。これに通った上で資格情報を検証する。
require_api_token();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    json_out(['error' => 'POST required'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);
$loginId = is_array($body) ? trim((string) ($body['loginId'] ?? '')) : '';
$password = is_array($body) ? (string) ($body['password'] ?? '') : '';
if ($loginId === '' || $password === '') {
    json_out(['error' => 'loginId and password required'], 400);
}
$key = mb_strtolower($loginId);

// クライアント(UserContext.login)と同じ照合: email or id の小文字一致が「ちょうど1件」のときのみ成立。
$pdo = db();
$stmt = $pdo->prepare("SELECT data FROM records WHERE store = 'users' AND deleted = 0");
$stmt->execute();
$matches = [];
foreach ($stmt as $row) {
    $u = json_decode((string) $row['data'], true);
    if (!is_array($u)) {
        continue;
    }
    $email = mb_strtolower(trim((string) ($u['email'] ?? '')));
    $id = mb_strtolower(trim((string) ($u['id'] ?? '')));
    if (($email !== '' && $email === $key) || ($id !== '' && $id === $key)) {
        $matches[] = $u;
    }
}
if (count($matches) !== 1) {
    json_out(['error' => 'invalid credentials'], 401);
}

$user = $matches[0];
$stored = (string) ($user['password'] ?? '');
if ($stored === '') {
    json_out(['error' => 'invalid credentials'], 401);
}
// パスワード照合: bcrypt/argon2 ハッシュは password_verify、未移行の平文は hash_equals。
// これにより平文・ハッシュが混在する移行期間でも一貫して認証できる（後方互換）。
$isHashed = isset($stored[0]) && $stored[0] === '$' && (bool) preg_match('/^\$(2y|2a|2b|argon2(id|i)?)\$/', $stored);
$ok = $isHashed ? password_verify($password, $stored) : hash_equals($stored, $password);
if (!$ok) {
    json_out(['error' => 'invalid credentials'], 401);
}
if ((string) ($user['status'] ?? 'active') === 'inactive') {
    json_out(['error' => 'account inactive'], 403);
}
// 遅延移行(config hash_passwords=true のときのみ): 平文で認証成功したユーザーを bcrypt へ再ハッシュして保存。
// 一斉リセット不要・ロックアウトを起こさない段階移行。rev 採番→更新は store.php と同じくトランザクションで直列化。
// ★クライアントが平文比較を撤廃(サーバー認証へ移行)した後に有効化すること。
if (!$isHashed && hash_passwords_enabled()) {
    $uidRow = (string) ($user['id'] ?? '');
    if ($uidRow !== '') {
        try {
            $user['password'] = password_hash($password, PASSWORD_BCRYPT);
            $pdo->beginTransaction();
            $rev = next_rev($pdo);
            $up = $pdo->prepare(
                "INSERT INTO records (store, id, data, deleted, rev) VALUES ('users', ?, ?, 0, ?)
                 ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0, rev = VALUES(rev)"
            );
            $up->execute([$uidRow, json_encode($user, JSON_UNESCAPED_UNICODE), $rev]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[auth rehash] ' . $e->getMessage()); // 再ハッシュ失敗はログインを妨げない（次回再試行）
        }
    }
}

$secret = auth_secret(); // サーバー専用 auth_secret（未設定時のみ api_token にフォールバック）
if ($secret === '') {
    json_out(['error' => 'server not configured for auth'], 500);
}

$uid = (string) ($user['id'] ?? '');
$role = (string) ($user['role'] ?? 'customer');
$exp = time() + 60 * 60 * 24 * 30; // 30日
$payload = json_encode(['uid' => $uid, 'role' => $role, 'exp' => $exp], JSON_UNESCAPED_UNICODE);
$payloadB64 = rtrim(strtr(base64_encode((string) $payload), '+/', '-_'), '=');
$sig = hash_hmac('sha256', $payloadB64, $secret);
$token = $payloadB64 . '.' . $sig;

json_out(['token' => $token, 'userId' => $uid, 'role' => $role, 'exp' => $exp]);
