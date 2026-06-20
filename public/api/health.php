<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

try {
    db();
    json_out(['ok' => true, 'backend' => 'php-mysql']);
} catch (Throwable $e) {
    // DB 接続情報など内部詳細をレスポンスに出さない（情報漏えい防止）。詳細はサーバーログへ。
    error_log('[health] ' . $e->getMessage());
    json_out(['ok' => false], 500);
}
