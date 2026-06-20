<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require_once __DIR__ . '/order_mail.php';

try {
    $cfgFile = __DIR__ . '/config.php';
    $cfg = file_exists($cfgFile) ? require $cfgFile : [];
    $token = (string) ($cfg['notify_cron_token'] ?? '');
    $given = (string) ($_GET['token'] ?? ($_SERVER['HTTP_X_NOTIFY_TOKEN'] ?? ''));
    if ($token === '' || !hash_equals($token, $given)) {
        json_out(['error' => 'forbidden'], 403);
    }

    $result = send_due_return_reminders(db());
    json_out(['ok' => true] + $result);
} catch (Throwable $e) {
    // DB/SMTP の内部例外メッセージをクライアントに漏らさない（health.php と同じ方針）。
    error_log('[notify-customers] ' . $e->getMessage());
    json_out(['error' => 'notify failed'], 500);
}
