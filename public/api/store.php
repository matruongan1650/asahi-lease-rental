<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require_once __DIR__ . '/order_mail.php';
require_once __DIR__ . '/fcm.php'; // スタッフ APK への FCM プッシュ（サービスアカウント未設定なら no-op）
require_once __DIR__ . '/audit.php'; // 操作ログ（監査ログ）を server 側で記録

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
        // pushTokens / auditLogs は新設ストアで旧クライアント互換が不要 → フラグに関係なく常に fail-closed。
        // 特権ロール(admin/staff)のみ読める（共有 api_token だけで FCMトークン一覧・操作ログを取得させない）。
        if (in_array($name, ['pushTokens', 'auditLogs'], true) && !($cu && is_privileged_role($cu['role']))) {
            $out = [];
        }
        // enforce_user_token=true 時は sync.php と同じ fail-closed を GET にも適用（トークン未提示は
        // 社内系ストアの内容を返さない）。既定(false)では従来どおり＝挙動不変。
        if (enforce_user_token_enabled() && $cu === null
            && in_array($name, ['staffMessages', 'mailLogs', 'walkinReturns', 'returnInspections'], true)) {
            $out = [];
        }
        if ($cu && !is_privileged_role($cu['role'])) {
            if ($name === 'orders' || $name === 'users') {
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
            } elseif ($name === 'mailLogs' || $name === 'staffMessages' || $name === 'pushTokens') {
                $out = []; // 顧客には配信しない（送信メールログ・社内連絡・スタッフ端末のプッシュトークン）
            } elseif ($name === 'returnInspections' || $name === 'walkinReturns') {
                // 自分の注文に紐づく検品/持込返却のみ返す（他顧客の検品結果・PII の漏洩防止）。
                $owned = [];
                $os = $pdo->prepare("SELECT id, data FROM records WHERE store = 'orders' AND deleted = 0");
                $os->execute();
                foreach ($os as $orow) {
                    $od = json_decode((string) $orow['data'], true);
                    if (is_array($od) && (string) ($od['userId'] ?? '') === $cu['uid']) {
                        $owned[(string) $orow['id']] = true;
                        if (!empty($od['orderNumber'])) $owned[(string) $od['orderNumber']] = true;
                    }
                }
                $scoped = [];
                foreach ($out as $o) {
                    if (!is_array($o)) {
                        continue;
                    }
                    $oid = (string) ($o['orderId'] ?? '');
                    $onum = (string) ($o['orderNumber'] ?? '');
                    if (isset($owned[$oid]) || ($onum !== '' && isset($owned[$onum]))) {
                        $scoped[] = $o;
                    }
                }
                $out = $scoped;
            }
        }
        json_out($out);
    }

    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        if (!is_array($body) || !isset($body['id'])) {
            json_out(['error' => 'record with id required'], 400);
        }
        $id = (string) $body['id'];
        // 監査ログ(auditLogs)は server 内部専用。クライアントからの書き込みは一切拒否（改竄防止）。
        if ($name === 'auditLogs') {
            json_out(['error' => 'forbidden'], 403);
        }
        $previous = null;
        if ($name === 'orders' || $name === 'returnInspections') {
            // deleted=0 で絞らない: ソフト削除済みの行も「存在し所有者がいる」とみなして所有権判定する。
            // （絞ると削除済み注文が見えず、他人の削除済み注文IDを顧客が復活・上書きできてしまう）。
            $prevStmt = $pdo->prepare("SELECT data FROM records WHERE store = ? AND id = ?");
            $prevStmt->execute([$name, $id]);
            $prevRaw = $prevStmt->fetchColumn();
            if (is_string($prevRaw) && $prevRaw !== '') {
                $decoded = json_decode($prevRaw, true);
                if (is_array($decoded)) {
                    $previous = $decoded;
                }
            }
        }
        // 監査ログ用の変更前レコード（対象ストアのみ・現行の live 行）。create/update 判定にも使う。
        $auditPrev = null;
        if (is_audited_store($name)) {
            $apStmt = $pdo->prepare("SELECT data FROM records WHERE store = ? AND id = ? AND deleted = 0");
            $apStmt->execute([$name, $id]);
            $apRaw = $apStmt->fetchColumn();
            if (is_string($apRaw) && $apRaw !== '') {
                $apDec = json_decode($apRaw, true);
                if (is_array($apDec)) $auditPrev = $apDec;
            }
        }
        // 書き込みの所有権チェック。有効な顧客トークンを提示している非特権ユーザー(customer/customer_staff)は
        // 自分の orders / 自分の users レコードしか作成・更新できない（他人の注文の改ざん・なりすまし防止）。
        // トークン未提示(旧クライアント/移行中)・特権ロール(admin/staff)は従来どおり全件書き込み可（後方互換）。
        // orders/users 以外のストアは現状クライアントから顧客が書き込まないため従来どおり許可する。
        $cu = current_user();
        // pushTokens は新設ストア（旧クライアント互換が不要）→ フラグに関係なく特権ロールのみ書き込み可。
        // 共有 api_token だけの呼び出しで任意端末を通知先に登録される（業務プッシュの窃視）のを防ぐ。
        if ($name === 'pushTokens' && !($cu && is_privileged_role($cu['role']))) {
            json_out(['error' => 'forbidden'], 403);
        }
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
            } elseif ($name === 'walkinReturns') {
                // 顧客は「自分の注文に紐づく」持込返却(walkinReturns)チケットのみ作成/更新できる。
                // 直接持ち込み返却フローがこのストアへ書くため、許可しないと返却が 403 で失われる。
                $ownsOrderId = static function (string $oid) use ($pdo, $cu): bool {
                    if ($oid === '') return false;
                    $os = $pdo->prepare("SELECT data FROM records WHERE store = 'orders' AND id = ?");
                    $os->execute([$oid]);
                    $oraw = $os->fetchColumn();
                    $odec = is_string($oraw) ? json_decode($oraw, true) : null;
                    return is_array($odec) && (string) ($odec['userId'] ?? '') === $cu['uid'];
                };
                // 入力 orderId が本人所有であること。
                if (!$ownsOrderId((string) ($body['orderId'] ?? ''))) {
                    json_out(['error' => 'forbidden'], 403);
                }
                // 既存レコードがある場合、その保存済み orderId も本人所有でなければ拒否
                //（他人のチケット id を狙って本人 orderId を送る上書き乗っ取りを防ぐ）。
                $wprev = $pdo->prepare("SELECT data FROM records WHERE store = 'walkinReturns' AND id = ?");
                $wprev->execute([$id]);
                $wpraw = $wprev->fetchColumn();
                if (is_string($wpraw) && $wpraw !== '') {
                    $wpdec = json_decode($wpraw, true);
                    if (!is_array($wpdec) || !$ownsOrderId((string) ($wpdec['orderId'] ?? ''))) {
                        json_out(['error' => 'forbidden'], 403);
                    }
                }
            } else {
                // 非特権顧客が書き込めるのは自分の orders / users / 自注文の walkinReturns のみ。
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
        // プッシュ通知の「新ジョブか」判定は txn 内で FOR UPDATE 読みする（同一レコードへ2端末が
        // ほぼ同時に POST しても後続がロック待ち→更新後の状態を見るため、二重通知にならない）。
        $pushPrevSS = null;   // orders: 直前の staffStatus（行なし/削除済みは ''）
        $walkinIsNew = false; // walkinReturns: 新規受付か（stage 更新=スタッフ操作では通知しない）
        if (fcm_enabled() && ($name === 'orders' || $name === 'walkinReturns')) {
            $lk = $pdo->prepare("SELECT data, deleted FROM records WHERE store = ? AND id = ? FOR UPDATE");
            $lk->execute([$name, $id]);
            $lockRow = $lk->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($name === 'orders') {
                $ld = ($lockRow && (int)$lockRow['deleted'] === 0) ? json_decode((string)$lockRow['data'], true) : null;
                $pushPrevSS = is_array($ld) ? (string)($ld['staffStatus'] ?? '') : '';
            } else {
                $walkinIsNew = ($lockRow === null || (int)$lockRow['deleted'] !== 0);
            }
        }
        $rev = next_rev($pdo);
        $stmt = $pdo->prepare(
            "INSERT INTO records (store, id, data, deleted, rev) VALUES (?, ?, ?, 0, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0, rev = VALUES(rev)"
        );
        $stmt->execute([$name, $id, json_encode($body, JSON_UNESCAPED_UNICODE), $rev]);
        $pdo->commit();
        // 操作ログ記録（本体コミット後・自前 txn。失敗しても応答は壊さない）。$body は所有権固定後の保存値。
        audit_log($pdo, $name, $id, $auditPrev === null ? 'create' : 'update', $auditPrev, $body, $cu);
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

        // ── スタッフ APK への FCM プッシュ判定（新ジョブになった遷移のみ。編集のたびに鳴らさない）──
        $push = null; // [title, body]
        if (fcm_enabled()) {
            if ($name === 'orders') {
                $prevSS = (string)($pushPrevSS ?? ''); // txn 内 FOR UPDATE 読みの直前値（二重通知防止）
                $newSS  = (string)($body['staffStatus'] ?? '');
                $who    = (string)($body['companyName'] ?? '') ?: (string)($body['personName'] ?? '');
                $site   = (string)($body['siteName'] ?? '');
                $label  = trim($who . ($site !== '' ? ' / ' . $site : ''));
                if ($newSS === '配送予定' && $prevSS !== '配送予定') {
                    $push = ['新しい配送ジョブ', $label !== '' ? $label : '新しい配送があります'];
                } elseif ($newSS === '回収予定' && $prevSS !== '回収予定') {
                    $push = ['新しい回収ジョブ', $label !== '' ? $label : '新しい回収があります'];
                }
            } elseif ($name === 'walkinReturns' && $walkinIsNew) {
                $who = (string)($body['companyName'] ?? '') ?: (string)($body['contact'] ?? '');
                $push = ['持込返却の受付', $who !== '' ? $who . ' 様の持込返却' : '新しい持込返却があります'];
            }
        }
        if ($push !== null) {
            // 応答を先に返してから送信する（FCM の往復で保存操作のレスポンスを遅らせない）。
            $json = json_encode(['ok' => true, 'mail' => $mail], JSON_UNESCAPED_UNICODE);
            http_response_code(200);
            header('Content-Type: application/json; charset=utf-8');
            if (function_exists('fastcgi_finish_request')) {
                echo $json;
                fastcgi_finish_request();
            } else {
                // 非 FPM 環境（mod_php / 開発サーバ）: Content-Length + close で先にフラッシュする
                header('Content-Length: ' . strlen($json));
                header('Connection: close');
                echo $json;
                @ob_end_flush();
                @flush();
            }
            try {
                fcm_notify_staff($pdo, $push[0], $push[1], ['kind' => $name, 'id' => (string)$id]);
            } catch (Throwable $e) {
                error_log('[fcm] ' . $e->getMessage());
            }
            exit;
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
        // 監査ログ(auditLogs)は server 内部専用。クライアントからの削除は一切拒否（改竄防止）。
        if ($name === 'auditLogs') {
            json_out(['error' => 'forbidden'], 403);
        }
        // 削除も所有権チェック（POST と同様）。非特権顧客は自分の orders / 自分の users のみ削除可。
        $cu = current_user();
        // pushTokens の削除も特権ロールのみ（POST と同じ fail-closed。スタッフ端末の通知登録を
        // 共有トークンだけで剥がされないように）。
        if ($name === 'pushTokens' && !($cu && is_privileged_role($cu['role']))) {
            json_out(['error' => 'forbidden'], 403);
        }
        // 監査ログ用に削除前レコードを取得（対象ストアのみ・ラベル生成用）。
        $auditDelPrev = null;
        if (is_audited_store($name)) {
            $adStmt = $pdo->prepare("SELECT data FROM records WHERE store = ? AND id = ? AND deleted = 0");
            $adStmt->execute([$name, $id]);
            $adRaw = $adStmt->fetchColumn();
            if (is_string($adRaw) && $adRaw !== '') {
                $adDec = json_decode($adRaw, true);
                if (is_array($adDec)) $auditDelPrev = $adDec;
            }
        }
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
            } elseif ($name === 'walkinReturns') {
                // 顧客は自分の注文に紐づく walkinReturns のみ削除可。レコードが存在しなければ no-op として許可。
                $wchk = $pdo->prepare("SELECT data FROM records WHERE store = 'walkinReturns' AND id = ?");
                $wchk->execute([$id]);
                $wraw = $wchk->fetchColumn();
                if (!is_string($wraw) || $wraw === '') {
                    $own = true; // 既に無いものの削除は無害
                } else {
                    $wdec = json_decode($wraw, true);
                    $oid = is_array($wdec) ? (string) ($wdec['orderId'] ?? '') : '';
                    if ($oid !== '') {
                        $os = $pdo->prepare("SELECT data FROM records WHERE store = 'orders' AND id = ?");
                        $os->execute([$oid]);
                        $oraw = $os->fetchColumn();
                        $odec = is_string($oraw) ? json_decode($oraw, true) : null;
                        $own = is_array($odec) && (string) ($odec['userId'] ?? '') === $cu['uid'];
                    }
                }
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
        // 操作ログ記録（削除。対象ストアかつ実在した行のみ）。
        if ($auditDelPrev !== null) {
            audit_log($pdo, $name, $id, 'delete', $auditDelPrev, null, $cu);
        }
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
