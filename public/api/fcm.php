<?php
declare(strict_types=1);

/**
 * fcm.php — Firebase Cloud Messaging (HTTP v1) 送信ヘルパー（純PHP・SDK不要）。
 *
 * スタッフ APK が完全終了していても、新しい配送/回収/持込返却ジョブを端末へプッシュ通知する。
 *
 * 前提:
 *  - サービスアカウント JSON を Web ルート外 (/var/www/shuyei-secrets/fcm-service-account.json) に置く。
 *    パスは config.php の 'fcm' => ['service_account' => '<path>'] で上書き可。無ければ全関数 no-op。
 *  - 送信先トークンは records の 'pushTokens' ストア（staff アプリが登録: {id, userId, token, platform}）。
 *
 * 設計（敵対的レビュー反映済み）:
 *  - OAuth2 アクセストークンは JWT(RS256) を oauth2.googleapis.com/token へ交換し、55分キャッシュ。
 *    キャッシュ名はサービスアカウント別ハッシュ付き・0600・rename 検証（/tmp 共有・毒入れ対策）。
 *  - 401 UNAUTHENTICATED はキャッシュ破棄→再取得→1回だけ再送（鍵ローテ時に55分沈黙しない）。
 *  - トークン削除は UNREGISTERED / HTTP 404 のみ。INVALID_ARGUMENT では消さない
 *    （payload 不備の 400 は全トークンに同時に返るため、全端末登録を誤爆消去しうる）。
 *  - data は空でもオブジェクトで送る（PHP の空配列は JSON [] になり proto3 map で 400 になる）。
 *  - 失敗しても呼び出し元の応答は壊さない（error_log のみ）。
 */

require_once __DIR__ . '/db.php';

/** サービスアカウント設定（無効なら null）。 */
function fcm_service_account(): ?array
{
    static $sa = false;
    if ($sa === false) {
        $cfg = get_config();
        $path = $cfg['fcm']['service_account'] ?? '/var/www/shuyei-secrets/fcm-service-account.json';
        $sa = null;
        if (is_string($path) && is_readable($path)) {
            $j = json_decode((string)file_get_contents($path), true);
            if (is_array($j) && !empty($j['client_email']) && !empty($j['private_key']) && !empty($j['project_id'])) {
                $sa = $j;
            }
        }
    }
    return $sa;
}

function fcm_enabled(): bool
{
    return fcm_service_account() !== null;
}

/** base64url（JWT 用） */
function fcm_b64url(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/** アクセストークンのキャッシュファイル（サービスアカウント別。共有 /tmp での衝突・混線防止）。 */
function fcm_cache_file(array $sa): string
{
    return sys_get_temp_dir() . '/asahi_fcm_' . hash('sha256', $sa['client_email'] . '|' . $sa['project_id']) . '.json';
}

/**
 * OAuth2 アクセストークン（55分キャッシュ）。$forceRefresh でキャッシュを無視して再取得。失敗時 null。
 */
function fcm_access_token(bool $forceRefresh = false): ?string
{
    $sa = fcm_service_account();
    if (!$sa) return null;

    $cacheFile = fcm_cache_file($sa);
    if (!$forceRefresh) {
        $cached = @json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($cached) && !empty($cached['token']) && ($cached['exp'] ?? 0) > time() + 60) {
            return (string)$cached['token'];
        }
    } else {
        @unlink($cacheFile);
    }

    $now = time();
    $header = fcm_b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    // iat は60秒バックデート（サーバ時計が Google より僅かに進んでいても "Token used too early" にしない）
    $claims = fcm_b64url(json_encode([
        'iss'   => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now - 60,
        'exp'   => $now + 3540,
    ]));
    $signature = '';
    if (!openssl_sign($header . '.' . $claims, $signature, $sa['private_key'], OPENSSL_ALGO_SHA256)) {
        error_log('[fcm] JWT sign failed');
        return null;
    }
    $jwt = $header . '.' . $claims . '.' . fcm_b64url($signature);

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $res = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $j = is_string($res) ? json_decode($res, true) : null;
    $token = is_array($j) ? (string)($j['access_token'] ?? '') : '';
    if ($status !== 200 || $token === '') {
        // error フィールド（invalid_grant 等）は秘密を含まず、時計ズレ等の診断に有用
        $errName = is_array($j) ? (string)($j['error'] ?? '') : '';
        error_log('[fcm] token exchange failed: status=' . $status . ' error=' . $errName);
        return null;
    }
    // 原子的にキャッシュ更新。0600（アクセストークンを他ローカルユーザーに読ませない）。
    // rename 失敗（毒入れ済みの他人所有ファイル等）はキャッシュ無しで続行＝機能は落とさない。
    $tmp = $cacheFile . '.' . getmypid();
    if (@file_put_contents($tmp, json_encode(['token' => $token, 'exp' => time() + 3300])) !== false) {
        @chmod($tmp, 0600);
        if (!@rename($tmp, $cacheFile)) {
            @unlink($tmp);
        }
    }
    return $token;
}

/** pushTokens ストアの全トークン行を返す: [{rowId, token}] */
function fcm_load_tokens(PDO $pdo): array
{
    $rows = [];
    $st = $pdo->query("SELECT id, data FROM records WHERE store = 'pushTokens' AND deleted = 0");
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $d = json_decode((string)$r['data'], true);
        $t = is_array($d) ? (string)($d['token'] ?? '') : '';
        if ($t !== '') $rows[] = ['rowId' => (string)$r['id'], 'token' => $t];
    }
    return $rows;
}

/** 無効トークン行を soft-delete（rev 採番して sync に伝播）。呼び出し元のトランザクションを壊さない。 */
function fcm_remove_token(PDO $pdo, string $rowId): void
{
    try {
        // 呼び出し元が txn 中なら begin しない（beginTransaction 例外→catch の rollBack が
        // 外側の txn を巻き戻す事故を防ぐ）。その場合は外側の commit に相乗りする。
        $ownTxn = !$pdo->inTransaction();
        if ($ownTxn) $pdo->beginTransaction();
        $rev = next_rev($pdo);
        $st = $pdo->prepare("UPDATE records SET deleted = 1, rev = ? WHERE store = 'pushTokens' AND id = ?");
        $st->execute([$rev, $rowId]);
        if ($ownTxn) $pdo->commit();
    } catch (Throwable $e) {
        if (isset($ownTxn) && $ownTxn && $pdo->inTransaction()) $pdo->rollBack();
        error_log('[fcm] token cleanup failed: ' . $e->getMessage());
    }
}

/**
 * 登録済み全スタッフ端末へ通知を送る。戻り値は送信成功数。
 * チャンネルは APK 側 staffNotify.ts が作成済みの "staff-alerts"（音+ヘッドアップ）を使う。
 */
function fcm_notify_staff(PDO $pdo, string $title, string $body, array $data = []): int
{
    $sa = fcm_service_account();
    if (!$sa) return 0;
    $tokens = fcm_load_tokens($pdo);
    if (!$tokens) return 0;
    $access = fcm_access_token();
    if ($access === null) return 0;

    $url = 'https://fcm.googleapis.com/v1/projects/' . rawurlencode((string)$sa['project_id']) . '/messages:send';
    // data 値は FCM 仕様で全て文字列必須。空でも JSON オブジェクト（{}）にする（[] は 400 INVALID_ARGUMENT）。
    $dataStr = [];
    foreach ($data as $k => $v) $dataStr[(string)$k] = is_string($v) ? $v : (string)json_encode($v, JSON_UNESCAPED_UNICODE);

    $sendOne = static function (string $token, string $access) use ($url, $title, $body, $dataStr): array {
        $payload = json_encode(['message' => [
            'token'        => $token,
            'notification' => ['title' => $title, 'body' => $body],
            'android'      => [
                'priority'     => 'HIGH',
                'notification' => ['channel_id' => 'staff-alerts', 'default_sound' => true],
            ],
            'data'         => (object)$dataStr,
        ]], JSON_UNESCAPED_UNICODE);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $access, 'Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT        => 10,
        ]);
        $res = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $errCode = '';
        $j = is_string($res) ? json_decode($res, true) : null;
        if (is_array($j)) {
            $errCode = (string)($j['error']['status'] ?? '');
            foreach (($j['error']['details'] ?? []) as $d) {
                if (($d['errorCode'] ?? '') !== '') $errCode = (string)$d['errorCode'];
            }
        }
        return [$status, $errCode];
    };

    $sent = 0;
    $refreshed = false; // 401 でのトークン再取得は1リクエストにつき一度だけ
    foreach ($tokens as $row) {
        [$status, $errCode] = $sendOne($row['token'], $access);

        // アクセストークン失効（鍵ローテ・キャッシュ毒入れ）→ 破棄・再取得して同じ端末へ1回だけ再送
        if (($status === 401 || $errCode === 'UNAUTHENTICATED') && !$refreshed) {
            $refreshed = true;
            $fresh = fcm_access_token(true);
            if ($fresh === null) return $sent; // 再取得も失敗 → 以降は全滅なので打ち切り
            $access = $fresh;
            [$status, $errCode] = $sendOne($row['token'], $access);
        }

        if ($status === 200) {
            $sent++;
            continue;
        }
        // 端末トークンの無効のみ掃除（アプリ削除・トークンローテーション後の残骸）。
        // INVALID_ARGUMENT では消さない: payload 不備の 400 は全トークンへ同時に返るため、
        // 1回の不正呼び出しで pushTokens 全行を誤爆 soft-delete してしまう。
        if ($errCode === 'UNREGISTERED' || $status === 404) {
            fcm_remove_token($pdo, $row['rowId']);
        } else {
            error_log('[fcm] send failed: status=' . $status . ' code=' . $errCode);
        }
    }
    return $sent;
}
