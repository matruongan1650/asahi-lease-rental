<?php
declare(strict_types=1);

/**
 * upload.php — 画像（写真・サイン）を base64 で受け取り、ファイルとして保存して URL を返す。
 *
 * レコード（注文など）に base64 を直接埋め込むと localStorage 容量超過・同期肥大の原因になるため、
 * 画像はファイル化し、レコードには URL だけを保持する。
 *
 * POST /api/upload   body: { "dataUrl": "data:image/png;base64,...." }
 *   → 200 { "url": "https://<host>/api/uploads/<sha1>.<ext>" }
 */

require_once __DIR__ . '/db.php'; // CORS/OPTIONS 処理と require_api_token() を共有

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Token');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}
require_api_token();

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
$dataUrl = is_array($body) ? ($body['dataUrl'] ?? '') : '';
if (!is_string($dataUrl) || $dataUrl === '') {
    http_response_code(400);
    echo json_encode(['error' => 'dataUrl required']);
    exit;
}

// data:image/<type>;base64,<payload>
if (!preg_match('#^data:image/([a-zA-Z0-9.+-]+);base64,(.+)$#s', $dataUrl, $m)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid image data URL']);
    exit;
}
$subtype = strtolower($m[1]);
// svg+xml は意図的に除外: 同一オリジンで配信される SVG は JavaScript を実行でき、
// 保管型 XSS の原因になる。写真・サインは png/jpg/webp 等のラスタ画像のみを許可する。
$extMap = [
    'png' => 'png',
    'jpeg' => 'jpg',
    'jpg' => 'jpg',
    'webp' => 'webp',
    'gif' => 'gif',
    'bmp' => 'bmp',
];
if (!isset($extMap[$subtype])) {
    http_response_code(415);
    echo json_encode(['error' => 'unsupported image type: ' . $subtype]);
    exit;
}
$ext = $extMap[$subtype];

$bytes = base64_decode($m[2], true);
if ($bytes === false || strlen($bytes) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'base64 decode failed']);
    exit;
}
// 安全のためサイズ上限（20MB）
if (strlen($bytes) > 20 * 1024 * 1024) {
    http_response_code(413);
    echo json_encode(['error' => 'image too large']);
    exit;
}

$dir = __DIR__ . '/uploads';
if (!is_dir($dir)) {
    @mkdir($dir, 0775, true);
}
if (!is_dir($dir) || !is_writable($dir)) {
    http_response_code(500);
    echo json_encode(['error' => 'uploads dir not writable']);
    exit;
}

// 内容ハッシュ名（重複アップロードは同じファイルに集約され、キャッシュも効く）
$fname = sha1($bytes) . '.' . $ext;
$path = $dir . '/' . $fname;
if (!file_exists($path)) {
    if (file_put_contents($path, $bytes) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'write failed']);
        exit;
    }
}

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? '') === '443')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$scheme = $https ? 'https' : 'http';
// Host ヘッダーはクライアント任意で偽装可能。許可済みホストのみ採用し、それ以外は正規ホストへ固定。
$allowedHosts = ['shuyei.online', 'www.shuyei.online'];
$reqHost = $_SERVER['HTTP_HOST'] ?? '';
$host = in_array($reqHost, $allowedHosts, true) ? $reqHost : 'shuyei.online';
$url = $scheme . '://' . $host . '/api/uploads/' . $fname;

echo json_encode(['ok' => true, 'url' => $url], JSON_UNESCAPED_SLASHES);
