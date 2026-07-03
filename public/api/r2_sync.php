<?php
declare(strict_types=1);

/**
 * r2_sync.php — uploads/ 内の既存ファイルを一括で R2 へ PUT する移行・整合ツール。
 *
 * CLI 専用（web からは 403）。VPS 上で:
 *   php /var/www/shuyei/api/r2_sync.php          # 全ファイル同期
 *   php /var/www/shuyei/api/r2_sync.php --dry    # 対象一覧のみ表示
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo 'CLI only';
    exit;
}

require_once __DIR__ . '/r2.php';

if (r2_config() === null) {
    fwrite(STDERR, "config.php に r2 設定がありません（account_id/access_key/secret_key/bucket）\n");
    exit(1);
}

$dry = in_array('--dry', $argv ?? [], true);
$dir = __DIR__ . '/uploads';
// サーキットブレーカーが残っていると全 PUT がスキップされるため、手動同期時は先に解除。
@unlink("$dir/.r2_down");
// upload.php が生成する画像のみ対象（手置きの txt/php 等は同期しない）
$allowedExt = ['png', 'jpg', 'webp', 'gif', 'bmp'];
$files = is_dir($dir) ? array_values(array_filter(scandir($dir), function ($f) use ($dir, $allowedExt) {
    return is_file("$dir/$f") && $f[0] !== '.'
        && in_array(strtolower(pathinfo($f, PATHINFO_EXTENSION)), $allowedExt, true);
})) : [];
echo count($files) . " file(s) in uploads/\n";

$ok = 0; $ng = 0;
foreach ($files as $f) {
    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    // upload.php の上限(20MB)超えは対象外（メモリ保護。1件の巨大ファイルでバッチを落とさない）
    if (filesize("$dir/$f") > 20 * 1024 * 1024) { echo "  skip >20MB: $f\n"; continue; }
    if ($dry) { echo "  would PUT: $f\n"; continue; }
    $bytes = file_get_contents("$dir/$f");
    if ($bytes === false) { echo "  read fail: $f\n"; $ng++; continue; }
    if (r2_put($f, $bytes, r2_content_type($ext))) { echo "  ✓ $f\n"; $ok++; }
    else { echo "  ✗ $f (R2 PUT failed — error_log 参照)\n"; $ng++; }
}
if (!$dry) echo "done: ok=$ok failed=$ng\n";
exit($ng > 0 ? 1 : 0);
