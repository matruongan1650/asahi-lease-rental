<?php
declare(strict_types=1);

/**
 * audit.php — 操作ログ（監査ログ）を server 側で確実に記録する。
 *
 * すべての書き込みは store.php を通るため、ここで記録すれば「どのクライアントも記録漏れ・改竄できない」。
 * 記録先は records テーブルの 'auditLogs' ストア（admin のみ閲覧可 — store.php/sync.php で権限制御）。
 * クライアントからの auditLogs への直接 POST/DELETE は store.php で 403（server 内部専用）。
 *
 * 記録対象は「重要な業務ストア」のみ（AUDIT_STORES）。高頻度・低価値(入出庫/移動/現場報告 等)は除外。
 * 保持は 90 日（cron が古い行を物理削除）。
 */

// 監査対象ストア（ユーザー選択: 重要な業務データ）。
const AUDIT_STORES = [
    'orders', 'products', 'vehicles', 'users', 'customers',
    'stocktake', 'walkinReturns', 'returnInspections', 'roles', 'systemSettings',
    'suppliers', 'vendors', 'purchaseOrders', 'repairs',
];

function is_audited_store(string $store): bool
{
    return in_array($store, AUDIT_STORES, true);
}

/** 肥大・無意味な差分を出さないため diff から除外するキー（画像・巨大配列・内部churn）。 */
const AUDIT_SKIP_KEYS = [
    'rev', 'updated_at', 'updatedAt', 'createdAt', 'date',
    'invoiceBlocks', 'items', 'monthlyBreakdown', 'breakdown',
    'deliveryPhotos', 'collectionPhotos', 'photos', 'attachments', 'files',
    'deliverySignature', 'collectionSignature', 'warehouseSignature',
    'receptionSignature', 'fieldSignature', 'signature',
    'compensationCharge', 'requestedReturn', 'perms',
];

/** スカラー値を短い表示用文字列へ（画像・長文はマスク/切詰）。 */
function audit_scalar($v): string
{
    if ($v === null) return '';
    if (is_bool($v)) return $v ? 'true' : 'false';
    if (is_int($v) || is_float($v)) return (string) $v;
    $s = (string) $v;
    if (strncmp($s, 'data:', 5) === 0) return '[画像/データ]';
    if (function_exists('mb_strlen') ? mb_strlen($s) > 120 : strlen($s) > 120) {
        return (function_exists('mb_substr') ? mb_substr($s, 0, 120) : substr($s, 0, 120)) . '…';
    }
    return $s;
}

/**
 * prev/next のスカラー差分を [{field, from, to}] で返す。
 * 配列・オブジェクトは中身を出さず「変更あり」だけ記録（items 等の肥大防止）。
 */
function audit_diff(?array $prev, ?array $next): array
{
    $prev = $prev ?? [];
    $next = $next ?? [];
    $changes = [];
    $keys = array_unique(array_merge(array_keys($prev), array_keys($next)));
    foreach ($keys as $k) {
        if (in_array($k, AUDIT_SKIP_KEYS, true)) continue;
        if (is_string($k) && ($k === '' || $k[0] === '_')) continue; // 内部フィールド
        $a = $prev[$k] ?? null;
        $b = $next[$k] ?? null;
        if (is_array($a) || is_array($b)) {
            if (json_encode($a) !== json_encode($b)) {
                $changes[] = ['field' => (string) $k, 'from' => '', 'to' => '（変更）'];
            }
            continue;
        }
        if ($a === $b) continue;
        // 数値の型違い("5" vs 5)で誤検知しないよう文字列比較でも一致なら除外
        if ((string) $a === (string) $b) continue;
        $changes[] = ['field' => (string) $k, 'from' => audit_scalar($a), 'to' => audit_scalar($b)];
    }
    return $changes;
}

/** レコードから人間可読ラベルを作る（一覧表示用）。 */
function audit_label(string $store, ?array $rec): string
{
    if (!is_array($rec)) return '';
    $g = static fn($k) => isset($rec[$k]) ? (string) $rec[$k] : '';
    switch ($store) {
        case 'orders':
            return $g('orderNumber') ?: $g('id');
        case 'users':
        case 'customers':
        case 'suppliers':
        case 'vendors':
            $name = trim($g('lastName') . ' ' . $g('firstName'));
            return $name ?: ($g('name') ?: ($g('companyName') ?: ($g('email') ?: $g('id'))));
        case 'products':
        case 'vehicles':
            return $g('name') ?: ($g('plate') ?: $g('id'));
        default:
            return $g('name') ?: ($g('title') ?: $g('id'));
    }
}

/**
 * 監査ログを1件記録する。呼び出し元のトランザクション外で呼ぶこと（内部で自前の txn を張る）。
 * 失敗しても本体処理を壊さない（例外は握りつぶしてログのみ）。
 * update で意味のある差分が無い場合はノイズ防止のため記録しない。
 */
function audit_log(PDO $pdo, string $store, string $recordId, string $action, ?array $prev, ?array $next, ?array $user): void
{
    try {
        if (!is_audited_store($store)) return;
        $changes = ($action === 'update') ? audit_diff($prev, $next) : [];
        if ($action === 'update' && count($changes) === 0) return; // 実質変更なし → 記録しない

        $entry = [
            'id'         => 'log-' . dechex((int) round(microtime(true) * 1000)) . '-' . bin2hex(random_bytes(4)),
            'store'      => $store,
            'recordId'   => $recordId,
            'recordLabel' => audit_label($store, $next ?? $prev),
            'action'     => $action, // create | update | delete
            'userId'     => $user['uid'] ?? '',
            'userRole'   => $user['role'] ?? '',
            'changes'    => $changes,
            'ts'         => gmdate('c'), // ISO8601 UTC（表示側で JST 変換）
        ];

        $ownTxn = !$pdo->inTransaction();
        if ($ownTxn) $pdo->beginTransaction();
        $rev = next_rev($pdo);
        $stmt = $pdo->prepare("INSERT INTO records (store, id, data, deleted, rev) VALUES ('auditLogs', ?, ?, 0, ?)");
        $stmt->execute([$entry['id'], json_encode($entry, JSON_UNESCAPED_UNICODE), $rev]);
        if ($ownTxn) $pdo->commit();
    } catch (Throwable $e) {
        if (isset($ownTxn) && $ownTxn && $pdo->inTransaction()) {
            try { $pdo->rollBack(); } catch (Throwable $e2) { /* ignore */ }
        }
        error_log('[audit] ' . $e->getMessage());
    }
}
