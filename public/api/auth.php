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
if ($stored === '' || !hash_equals($stored, $password)) {
    json_out(['error' => 'invalid credentials'], 401);
}
if ((string) ($user['status'] ?? 'active') === 'inactive') {
    json_out(['error' => 'account inactive'], 403);
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
