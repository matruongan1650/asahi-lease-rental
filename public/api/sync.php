<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

require_api_token();

try {
    $pdo = db();
    $since = (int) ($_GET['since'] ?? 0);
    $serverMaxRev = (int) $pdo->query("SELECT COALESCE(MAX(rev), 0) FROM records")->fetchColumn();
    $stmt = $pdo->prepare(
        "SELECT store, id, data, deleted, rev FROM records WHERE rev > ? ORDER BY rev ASC LIMIT 5000"
    );
    $stmt->execute([$since]);

    // 顧客スコープ: 有効なユーザートークンを提示した非特権ユーザーには、本人以外の
    // orders/users の「内容」を増分配信しない。カーソル(rev)はスキップ分も含めて進めるので
    // 取りこぼし/再取得ループは起きない。削除(deleted)は id のみで内容を含まないため通す。
    // トークン未提示(旧クライアント/移行中)は後方互換で全件配信（強制は別フェーズ）。
    $cu = current_user();
    $scopeCustomer = $cu && !is_privileged_role($cu['role']);

    $changes = [];
    $maxReturnedRev = $since;
    $rowCount = 0;
    foreach ($stmt as $row) {
        $rowCount++;
        $rev = (int) $row['rev'];
        if ($rev > $maxReturnedRev) {
            $maxReturnedRev = $rev;
        }
        $deleted = ((int) $row['deleted']) === 1;
        $store = $row['store'];
        $data = $deleted ? null : json_decode($row['data'], true);
        if ($scopeCustomer && !$deleted && ($store === 'orders' || $store === 'users')) {
            $ownerOk = false;
            if (is_array($data)) {
                if ($store === 'orders') {
                    $ownerOk = ((string) ($data['userId'] ?? '') === $cu['uid']);
                } elseif ($store === 'users') {
                    $ownerOk = ((string) ($data['id'] ?? '') === $cu['uid']);
                }
            }
            if (!$ownerOk) {
                continue; // 本人以外のレコードは配信しない（カーソルは上で前進済み）
            }
        }
        $changes[] = [
            'store'   => $store,
            'id'      => $row['id'],
            'deleted' => $deleted,
            'data'    => $data,
        ];
    }

    // カーソル(rev)は「今回実際に返した最大 rev」を返す。サーバ全体の MAX を返すと、
    // LIMIT 5000 で打ち切られた場合にクライアントが未受信の rev を飛び越してしまい、
    // それらの変更が二度と配信されない（恒久的なデータ欠落）。返した分までしか進めないこと
    // で、次回 since=maxReturnedRev で続きを確実に取得できる。
    // 変更が無い場合のみサーバ全体の MAX を返す。これが since より小さければ、クライアントは
    // サーバ初期化（ロールバック）を検知して全件再取得できる。
    // ★ 判定は count($changes) ではなく「実際に取得した行数($rowCount)」で行う。
    //   スコープ顧客のフィルタで全行が除外され $changes が空でも、5000 行を取得していれば
    //   maxReturnedRev まで進めるだけにする。これを serverMaxRev にすると、除外された区間の
    //   後ろにある「本人のレコード」を恒久的に飛ばしてしまう（顧客への静かなデータ欠落）。
    $cursor = $rowCount > 0 ? $maxReturnedRev : $serverMaxRev;
    json_out(['rev' => $cursor, 'changes' => $changes]);
} catch (Throwable $e) {
    error_log('[sync] ' . $e->getMessage());
    json_out(['error' => 'internal error'], 500);
}
