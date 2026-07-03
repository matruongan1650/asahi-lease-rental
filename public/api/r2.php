<?php
declare(strict_types=1);

/**
 * r2.php — Cloudflare R2 (S3互換) への PUT ヘルパー。AWS Signature V4 を純PHPで実装（SDK不要）。
 *
 * 使い方: config.php に 'r2' ブロックを設定すると upload.php が dual-write する。
 *   'r2' => [
 *     'account_id'  => '<Cloudflare Account ID>',   // https://<account_id>.r2.cloudflarestorage.com
 *     'access_key'  => '<R2 API Token の Access Key ID>',
 *     'secret_key'  => '<R2 API Token の Secret Access Key>',
 *     'bucket'      => 'asahi-uploads',
 *     'public_base' => '',   // 空 = ローカルURLを返す(dual-writeのみ)。Phase2で 'https://cdn.shuyei.online' 等に。
 *   ],
 * 未設定なら全関数が no-op（既存動作のまま）。R2 障害時もアップロード自体は失敗させない設計。
 */

require_once __DIR__ . '/db.php';

/** R2 設定（未設定・不完全なら null = 機能無効）。 */
function r2_config(): ?array
{
    static $r2 = false; // false = 未評価
    if ($r2 === false) {
        $cfg = get_config();
        $c = $cfg['r2'] ?? null;
        $r2 = (is_array($c)
            && !empty($c['account_id']) && !empty($c['access_key'])
            && !empty($c['secret_key']) && !empty($c['bucket'])) ? $c : null;
    }
    return $r2;
}

/** オブジェクトの公開URL（public_base 設定時のみ）。 */
function r2_public_url(string $key): ?string
{
    $c = r2_config();
    if (!$c || empty($c['public_base'])) return null;
    return rtrim((string)$c['public_base'], '/') . '/' . rawurlencode($key);
}

/**
 * R2 へ PUT する。成功 true / 失敗 false（例外は投げない。呼び出し元の応答を壊さない）。
 * キーは英数字と .-_ のみ想定（sha1名）。それ以外は rawurlencode でパスに載せる。
 */
function r2_put(string $key, string $bytes, string $contentType): bool
{
    $c = r2_config();
    if (!$c) return false;

    $host    = $c['account_id'] . '.r2.cloudflarestorage.com';
    $region  = 'auto';
    $service = 's3';
    // path-style: /<bucket>/<key>。canonical URI は URI エンコード済みの形で署名する。
    $canonicalUri = '/' . rawurlencode((string)$c['bucket']) . '/' . str_replace('%2F', '/', rawurlencode($key));

    // ── R2 障害時のサーキットブレーカー ──
    // R2 到達不能時に毎アップロードが timeout まで FPM ワーカーを占有すると、8 ワーカー全滅で
    // 全 API が停止しうる。直近の失敗から5分間は PUT をスキップ（ローカル保存は済んでいる。
    // 取りこぼしは r2_sync.php で後追い同期できる）。
    $breaker = __DIR__ . '/uploads/.r2_down';
    if (is_file($breaker) && (time() - (int)@filemtime($breaker)) < 300) {
        return false;
    }

    $amzDate   = gmdate('Ymd\THis\Z');
    $dateStamp = substr($amzDate, 0, 8); // 別呼び出しの gmdate だと UTC 日付跨ぎで scope が食い違いうる
    $payloadHash = hash('sha256', $bytes);

    // ── Canonical request（署名対象ヘッダは小文字・辞書順）──
    $headers = [
        'content-type'         => $contentType,
        'host'                 => $host,
        'x-amz-content-sha256' => $payloadHash,
        'x-amz-date'           => $amzDate,
    ];
    ksort($headers);
    $canonicalHeaders = '';
    foreach ($headers as $k => $v) {
        // SigV4 正規化: trim + 連続空白を1つに（サーバ側も同様に正規化して照合するため）
        $canonicalHeaders .= $k . ':' . preg_replace('/\s+/', ' ', trim($v)) . "\n";
    }
    $signedHeaders = implode(';', array_keys($headers));

    $canonicalRequest = implode("\n", [
        'PUT',
        $canonicalUri,
        '',                 // query string なし
        $canonicalHeaders,
        $signedHeaders,
        $payloadHash,
    ]);

    // ── String to sign ──
    $scope = $dateStamp . '/' . $region . '/' . $service . '/aws4_request';
    $stringToSign = implode("\n", [
        'AWS4-HMAC-SHA256',
        $amzDate,
        $scope,
        hash('sha256', $canonicalRequest),
    ]);

    // ── Signing key（HMAC チェーン）──
    $kDate    = hash_hmac('sha256', $dateStamp, 'AWS4' . $c['secret_key'], true);
    $kRegion  = hash_hmac('sha256', $region, $kDate, true);
    $kService = hash_hmac('sha256', $service, $kRegion, true);
    $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
    $signature = hash_hmac('sha256', $stringToSign, $kSigning);

    $authorization = sprintf(
        'AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s',
        $c['access_key'], $scope, $signedHeaders, $signature
    );

    $ch = curl_init('https://' . $host . $canonicalUri);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'PUT',
        CURLOPT_POSTFIELDS     => $bytes,
        CURLOPT_RETURNTRANSFER => true,
        // best-effort の dual-write なので短めに（失敗は r2_sync.php が回収）。長いと FPM ワーカーを塞ぐ。
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => [
            'Authorization: ' . $authorization,
            'Content-Type: ' . $contentType,
            'x-amz-content-sha256: ' . $payloadHash,
            'x-amz-date: ' . $amzDate,
            // Content-Length は curl が POSTFIELDS から自動設定
        ],
    ]);
    $resBody = curl_exec($ch);
    $status  = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err     = curl_error($ch);
    curl_close($ch);

    if ($status < 200 || $status >= 300) {
        // 失敗してもアップロード応答は壊さない（ローカル保存済み）。ログのみ。
        // ログには鍵情報を残さない（S3 エラー XML は AccessKeyId や署名を含みうるため redact）。
        $bodySnippet = is_string($resBody) ? substr($resBody, 0, 300) : '';
        $bodySnippet = str_replace([$c['access_key'], $c['secret_key']], '[redacted]', $bodySnippet);
        error_log(sprintf('[r2] PUT %s failed: status=%d err=%s body=%s', $key, $status, $err, $bodySnippet));
        // サーキットブレーカー投入（接続系の失敗のみ。4xx=設定ミスは即時に気づきたいので投入しない）
        if ($status === 0 || $status >= 500) {
            @touch($breaker);
        }
        return false;
    }
    if (is_file($breaker)) { @unlink($breaker); } // 成功したらブレーカー解除
    return true;
}

/** MIME タイプ（拡張子から。upload.php の extMap と対応）。 */
function r2_content_type(string $ext): string
{
    $map = [
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'webp' => 'image/webp',
        'gif'  => 'image/gif',
        'bmp'  => 'image/bmp',
        'pdf'  => 'application/pdf',
        'csv'  => 'text/csv',
        'xls'  => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'doc'  => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    return $map[strtolower($ext)] ?? 'application/octet-stream';
}
