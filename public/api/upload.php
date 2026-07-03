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
require_once __DIR__ . '/r2.php'; // Cloudflare R2 dual-write（config 未設定なら no-op）

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

// data:<mime>;base64,<payload>（写真・サインに加え、棚卸の証跡文書 PDF/CSV/Excel も許可）
if (!preg_match('#^data:([a-zA-Z0-9.+/-]+);base64,(.+)$#s', $dataUrl, $m)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid data URL']);
    exit;
}
$mime = strtolower($m[1]);
// image/svg+xml と HTML 系は意図的に除外: 同一オリジンで配信されると JavaScript を実行でき保管型
// XSS の原因になる。ラスタ画像＋ブラウザがスクリプト実行しない安全な文書形式のみを許可する
// （拡張子でホワイトリスト管理し、許可 MIME 以外は 415 で拒否）。
$extMap = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/jpg' => 'jpg',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
    'image/bmp' => 'bmp',
    'application/pdf' => 'pdf',
    'text/csv' => 'csv',
    'application/csv' => 'csv',
    'application/vnd.ms-excel' => 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    'application/msword' => 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
];
if (!isset($extMap[$mime])) {
    http_response_code(415);
    echo json_encode(['error' => 'unsupported type: ' . $mime]);
    exit;
}
$ext = $extMap[$mime];

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
$isNew = !file_exists($path);
if ($isNew) {
    if (file_put_contents($path, $bytes) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'write failed']);
        exit;
    }
}

// ── Cloudflare R2 へも保存（dual-write）。R2 障害でもアップロード自体は成功扱い（ローカル保存済み）。
// 重複アップロードでも毎回 PUT する（冪等・内容アドレスなので安全）。「ローカルに有る＝R2にも有る」
// という推定はしない — R2 設定前の旧ファイルや過去の PUT 失敗があると、public_base 切替後に
// 存在しない R2 URL を配ってしまうため（verify指摘 MED）。
$r2ok = false;
if (r2_config() !== null) {
    $r2ok = r2_put($fname, $bytes, r2_content_type($ext));
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

// Phase 2（DNS→Cloudflare 後）: config の r2.public_base 設定で R2/CDN URL を返すよう切替。
// R2 PUT が成功した場合のみ公開URLへ（失敗時はローカルURLでフォールバック＝画像は必ず見える）。
$publicUrl = $r2ok ? r2_public_url($fname) : null;
if ($publicUrl !== null) {
    $url = $publicUrl;
}

echo json_encode(['ok' => true, 'url' => $url, 'r2' => $r2ok], JSON_UNESCAPED_SLASHES);
