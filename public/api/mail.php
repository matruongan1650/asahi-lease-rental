<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'POST') {
    json_out(['error' => 'method not allowed'], 405);
}

// 共有トークン認証（他のデータ系エンドポイントと同様）。mail_api_enabled だけでは
// フラグを有効化した瞬間に誰でも会社の SMTP から任意メールを送れるオープンリレーになるため、
// 認証ゲートを必須にする。
require_api_token();

try {
    $cfgFile = __DIR__ . '/config.php';
    $cfg = file_exists($cfgFile) ? require $cfgFile : [];
    if (($cfg['mail_api_enabled'] ?? false) !== true) {
        json_out(['error' => 'manual mail api disabled'], 403);
    }
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        json_out(['error' => 'json body required'], 400);
    }
    $to = (string) ($body['to'] ?? '');
    $subject = (string) ($body['subject'] ?? '');
    $message = (string) ($body['message'] ?? '');
    if ($to === '' || $subject === '' || $message === '') {
        json_out(['error' => 'to, subject, message required'], 400);
    }
    $res = send_smtp_mail($to, $subject, $message);
    json_out($res);
} catch (Throwable $e) {
    // 内部例外メッセージ(SMTP ホスト/設定/サーバ応答)をクライアントに漏らさない（health.php と同じ方針）。
    error_log('[mail] ' . $e->getMessage());
    json_out(['error' => 'mail failed'], 500);
}
