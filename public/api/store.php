<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require_once __DIR__ . '/order_mail.php';

require_api_token();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$name = $_GET['name'] ?? null;
if (!valid_store($name)) {
    json_out(['error' => 'invalid store name'], 400);
}

try {
    $pdo = db();

    // fail-closed 強制(config: enforce_user_token=true)時、機密ストア(orders/users)は
    // 有効なユーザートークン必須。未提示/不正(current_user()===null)は GET/POST/DELETE 共通で拒否。
    // 既定(false)では従来どおり後方互換 fail-open。
    if (enforce_user_token_enabled() && is_sensitive_store($name) && current_user() === null) {
        json_out(['error' => 'unauthorized'], 401);
    }

    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT data FROM records WHERE store = ? AND deleted = 0 ORDER BY rev DESC");
        $stmt->execute([$name]);
        $out = [];
        foreach ($stmt as $row) {
            $obj = json_decode($row['data'], true);
            if (is_array($obj)) {
                $out[] = $obj;
            }
        }
        // 非特権(顧客)ユーザーが有効なユーザートークンを提示した場合のみ、機密ストアを本人分にスコープする。
        // orders は発注者(userId)一致、users は自分のレコードのみ。トークン未提示(旧クライアント/移行中)は
        // 後方互換で従来どおり全件返す（強制は全クライアント更新後の別フェーズ）。
        $cu = current_user();
        if ($cu && !is_privileged_role($cu['role']) && ($name === 'orders' || $name === 'users')) {
            $scoped = [];
            foreach ($out as $o) {
                if (!is_array($o)) {
                    continue;
                }
                if ($name === 'orders' && (string) ($o['userId'] ?? '') === $cu['uid']) {
                    $scoped[] = $o;
                } elseif ($name === 'users' && (string) ($o['id'] ?? '') === $cu['uid']) {
                    $scoped[] = $o;
                }
            }
            $out = $scoped;
        }
        json_out($out);
    }

    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        if (!is_array($body) || !isset($body['id'])) {
            json_out(['error' => 'record with id required'], 400);
        }
        $id = (string) $body['id'];
        $previous = null;
        if ($name === 'orders' || $name === 'returnInspections') {
            $prevStmt = $pdo->prepare("SELECT data FROM records WHERE store = ? AND id = ? AND deleted = 0");
            $prevStmt->execute([$name, $id]);
            $prevRaw = $prevStmt->fetchColumn();
            if (is_string($prevRaw) && $prevRaw !== '') {
                $decoded = json_decode($prevRaw, true);
                if (is_array($decoded)) {
                    $previous = $decoded;
                }
            }
        }
        // 書き込みの所有権チェック。有効な顧客トークンを提示している非特権ユーザー(customer/customer_staff)は
        // 自分の orders / 自分の users レコードしか作成・更新できない（他人の注文の改ざん・なりすまし防止）。
        // トークン未提示(旧クライアント/移行中)・特権ロール(admin/staff)は従来どおり全件書き込み可（後方互換）。
        // orders/users 以外のストアは現状クライアントから顧客が書き込まないため従来どおり許可する。
        $cu = current_user();
        if ($cu && !is_privileged_role($cu['role'])) {
            if ($name === 'orders') {
                // デフォルト拒否: 既存注文の更新は所有者本人のみ。userId が空/未設定の既存注文も
                // 「自分のものでない」扱いで更新を拒否する（所有者未設定の注文を任意の顧客が乗っ取り・
                // データ上書きするのを防ぐ）。新規作成($previous===null)は許可し、下で userId を本人に固定する。
                if ($previous !== null && (string) ($previous['userId'] ?? '') !== $cu['uid']) {
                    json_out(['error' => 'forbidden'], 403); // 他人/所有者未設定の注文の上書きを拒否
                }
                $incoming = (string) ($body['userId'] ?? '');
                if ($incoming !== '' && $incoming !== $cu['uid']) {
                    json_out(['error' => 'forbidden'], 403); // 他人を発注者に指定する書き込みを拒否
                }
                $body['userId'] = $cu['uid']; // 発注者を本人に固定（未設定レコードのなりすまし防止）
            } elseif ($name === 'users') {
                if ($id !== $cu['uid']) {
                    json_out(['error' => 'forbidden'], 403); // 自分以外のユーザーレコード編集を拒否
                }
                if (is_privileged_role((string) ($body['role'] ?? 'customer'))) {
                    json_out(['error' => 'forbidden'], 403); // 権限昇格(role=admin/staff)を拒否
                }
            } else {
                // 非特権顧客が書き込めるのは自分の orders / users のみ。
                // products・stockLedger 等のマスターデータへの書き込みは拒否
                //（共有トークンを悪用した在庫・商品改ざんを防ぐ。デフォルト拒否）。
                json_out(['error' => 'forbidden'], 403);
            }
        }
        // rev 採番と行書き込みを1トランザクションにまとめる。autocommit のままだと next_rev の
        // 行ロックが INSERT 前に解放され、コミット順が rev 順とズレて sync の増分カーソルが
        // レコードを恒久的に飛ばし得る（データ欠落）。トランザクションで採番→書き込みを直列化する。
        // メール送信はコミット後（ロールバック時に誤送信しない / ロックを長く保持しない）。
        $pdo->beginTransaction();
        $rev = next_rev($pdo);
        $stmt = $pdo->prepare(
            "INSERT INTO records (store, id, data, deleted, rev) VALUES (?, ?, ?, 0, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0, rev = VALUES(rev)"
        );
        $stmt->execute([$name, $id, json_encode($body, JSON_UNESCAPED_UNICODE), $rev]);
        $pdo->commit();
        $mail = ['sent' => false];
        if ($name === 'orders') {
            try {
                $sent = send_order_customer_mail_if_needed($previous, $body);
                $mail = ['sent' => $sent];
            } catch (Throwable $mailError) {
                error_log('[order mail] ' . $mailError->getMessage());
                $mail = ['sent' => false, 'error' => 'mail send failed']; // 内部例外メッセージはログのみ（クライアントへ漏らさない）
            }
        } elseif ($name === 'returnInspections') {
            try {
                $sent = send_inspection_customer_mail_if_needed($pdo, $previous, $body);
                $mail = ['sent' => $sent];
            } catch (Throwable $mailError) {
                error_log('[inspection mail] ' . $mailError->getMessage());
                $mail = ['sent' => false, 'error' => 'mail send failed']; // 内部例外メッセージはログのみ（クライアントへ漏らさない）
            }
        }
        json_out(['ok' => true, 'mail' => $mail]);
    }

    if ($method === 'PUT') {
        // 全置換 PUT は本文に無いレコードをストア全体で soft-delete する破壊的操作で、
        // クライアントに実呼び出し元が無い（apiSetAll 未使用）。共有トークンさえあれば任意のストアを
        // 一括削除できてしまうため、無効化する（必要時はサーバー専用の管理経路で行うこと）。
        json_out(['error' => 'PUT (full replace) is disabled'], 405);
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if (!is_string($id) || $id === '') {
            json_out(['error' => 'id required'], 400);
        }
        // 削除も所有権チェック（POST と同様）。非特権顧客は自分の orders / 自分の users のみ削除可。
        $cu = current_user();
        if ($cu && !is_privileged_role($cu['role'])) {
            // デフォルト拒否: 非特権顧客が削除できるのは自分の orders / users のみ。
            // （以前は $own=true 既定のため products 等のマスターデータも削除できてしまった）。
            $own = false;
            if ($name === 'users') {
                $own = ($id === $cu['uid']);
            } elseif ($name === 'orders') {
                $chk = $pdo->prepare("SELECT data FROM records WHERE store = ? AND id = ? AND deleted = 0");
                $chk->execute([$name, $id]);
                $rawChk = $chk->fetchColumn();
                $recChk = is_string($rawChk) ? json_decode($rawChk, true) : null;
                $own = is_array($recChk) && (string) ($recChk['userId'] ?? '') === $cu['uid'];
            }
            if (!$own) {
                json_out(['error' => 'forbidden'], 403);
            }
        }
        // POST と同様に rev 採番→soft-delete を1トランザクションで直列化する。
        // autocommit のままだと next_rev のロックが UPDATE コミット前に解放され、コミット順が
        // rev 順とズレて sync の増分カーソルが削除を恒久的に飛ばし得る（他端末で消えない）。
        $pdo->beginTransaction();
        $rev = next_rev($pdo);
        $stmt = $pdo->prepare("UPDATE records SET deleted = 1, rev = ? WHERE store = ? AND id = ?");
        $stmt->execute([$rev, $name, $id]);
        $pdo->commit();
        json_out(['ok' => true]);
    }

    json_out(['error' => 'method not allowed'], 405);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[store] ' . $e->getMessage());
    json_out(['error' => 'internal error'], 500);
}
