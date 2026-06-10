<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

try {
    db();
    json_out(['ok' => true, 'backend' => 'php-mysql']);
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => $e->getMessage()], 500);
}
