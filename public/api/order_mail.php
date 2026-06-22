<?php
declare(strict_types=1);

require_once __DIR__ . '/mailer.php';

function order_customer_email(array $order): string
{
    return trim((string) ($order['userEmail'] ?? $order['email'] ?? ''));
}

function order_label(array $order): string
{
    return (string) ($order['orderNumber'] ?? $order['id'] ?? '注文');
}

function order_mail_event(?array $old, array $new): ?array
{
    $email = order_customer_email($new);
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return null;
    }

    $orderNo = order_label($new);
    $oldStatus = $old['status'] ?? null;
    $newStatus = $new['status'] ?? null;
    $oldStaffStatus = $old['staffStatus'] ?? null;
    $newStaffStatus = $new['staffStatus'] ?? null;
    $oldReturnType = $old['returnRequestType'] ?? null;
    $newReturnType = $new['returnRequestType'] ?? null;

    if ($old === null) {
        return [
            'type' => 'created',
            'subject' => "【アサヒリース】ご注文を受け付けました {$orderNo}",
            'message' => "ご注文を受け付けました。",
        ];
    }

    if ($oldStaffStatus !== $newStaffStatus) {
        $staffMessages = [
            '配送完了' => '商品の納品が完了しました。Webアプリから納品写真・納品書をご確認いただけます。',
            '回収完了' => '商品の回収が完了しました。倉庫で検品後に回収書・請求内容が確定します。',
        ];
        if (isset($staffMessages[(string) $newStaffStatus])) {
            return [
                'type' => 'staff_status',
                'subject' => "【アサヒリース】作業完了のお知らせ {$orderNo}",
                'message' => $staffMessages[(string) $newStaffStatus],
            ];
        }
    }

    if ($oldStatus !== $newStatus) {
        $messages = [
            '確認済み' => 'ご注文内容を確認しました。配送準備を進めます。',
            '準備中' => '商品の準備を開始しました。',
            '配送中' => '商品を配送中です。',
            '配送済み' => '商品の納品が完了しました。Webアプリから納品写真・納品書をご確認いただけます。',
            'レンタル中' => 'レンタル利用中です。返却期限をご確認ください。',
            '回収中' => '返却リクエストを受け付けました。回収手配を進めます。',
            '検品待ち' => '返却品を受け付けました。倉庫で検品後に内容が確定します。',
            '一部返却' => '一部返却の検品が完了しました。継続レンタル分と返却分をご確認ください。',
            '返却済' => '返却処理が完了しました。回収書・請求内容をご確認いただけます。',
            '返却済み' => '返却処理が完了しました。回収書・請求内容をご確認いただけます。',
            '完了' => 'ご注文の処理が完了しました。',
            'キャンセル' => 'ご注文はキャンセルされました。',
        ];
        $body = $messages[(string) $newStatus] ?? "注文ステータスが「{$newStatus}」に更新されました。";
        return [
            'type' => 'status',
            'subject' => "【アサヒリース】注文状況のお知らせ {$orderNo}",
            'message' => $body,
        ];
    }

    if ($oldReturnType !== $newReturnType && $newReturnType) {
        $label = $newReturnType === 'full' ? '一括返却' : '一部返却';
        return [
            'type' => 'return_request',
            'subject' => "【アサヒリース】返却受付のお知らせ {$orderNo}",
            'message' => "{$label}の返却依頼を受け付けました。",
        ];
    }

    return null;
}

function send_order_customer_mail_if_needed(?array $old, array $new): bool
{
    $event = order_mail_event($old, $new);
    if ($event === null) {
        return false;
    }

    $orderNo = order_label($new);
    $company = (string) ($new['companyName'] ?? '');
    $person = (string) ($new['personName'] ?? trim(($new['personLastName'] ?? '') . ' ' . ($new['personFirstName'] ?? '')));
    $status = (string) ($new['status'] ?? '');
    $site = (string) ($new['siteName'] ?? '');
    $total = isset($new['total']) ? '¥' . number_format((float) $new['total']) : '—';
    $url = 'https://shuyei.online/orders';

    $body = "{$company}\n{$person} 様\n\n";
    $body .= $event['message'] . "\n\n";
    $body .= "注文番号: {$orderNo}\n";
    if ($site !== '') {
        $body .= "現場名: {$site}\n";
    }
    if ($status !== '') {
        $body .= "現在のステータス: {$status}\n";
    }
    $body .= "合計金額: {$total}\n\n";
    $body .= "詳細はWebアプリの注文履歴からご確認ください。\n{$url}\n\n";
    $body .= "アサヒリース株式会社";

    send_smtp_mail(order_customer_email($new), $event['subject'], $body);
    return true;
}

function fetch_order_for_inspection(PDO $pdo, array $inspection): ?array
{
    $orderId = (string) ($inspection['orderId'] ?? '');
    $orderNumber = (string) ($inspection['orderNumber'] ?? '');
    if ($orderId !== '') {
        $stmt = $pdo->prepare("SELECT data FROM records WHERE store = 'orders' AND id = ? AND deleted = 0 LIMIT 1");
        $stmt->execute([$orderId]);
        $raw = $stmt->fetchColumn();
        if (is_string($raw) && $raw !== '') {
            $row = json_decode($raw, true);
            if (is_array($row)) return $row;
        }
    }
    if ($orderNumber !== '') {
        $stmt = $pdo->prepare("SELECT data FROM records WHERE store = 'orders' AND deleted = 0");
        $stmt->execute();
        foreach ($stmt as $r) {
            $row = json_decode($r['data'], true);
            if (is_array($row) && ($row['orderNumber'] ?? '') === $orderNumber) {
                return $row;
            }
        }
    }
    return null;
}

function send_inspection_customer_mail_if_needed(PDO $pdo, ?array $old, array $inspection): bool
{
    if ($old !== null) return false;
    $order = fetch_order_for_inspection($pdo, $inspection);
    if (!$order) return false;
    $email = order_customer_email($order);
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) return false;

    $orderNo = order_label($order);
    $hasShortage = !empty($inspection['hasShortage']);
    $subject = "【アサヒリース】返却品の検品結果 {$orderNo}";
    $body = (string) ($order['companyName'] ?? '') . "\n";
    $body .= (string) ($order['personName'] ?? '') . " 様\n\n";
    $body .= $hasShortage
        ? "返却品の検品が完了しました。不足・破損の確認事項があります。\n\n"
        : "返却品の検品が完了しました。検品結果は問題ありません。\n\n";
    $body .= "注文番号: {$orderNo}\n";
    $body .= "検品日時: " . (string) ($inspection['inspectedAt'] ?? '') . "\n";
    $body .= "検品数: " . (string) ($inspection['totalCounted'] ?? '-') . " / " . (string) ($inspection['totalExpected'] ?? '-') . "\n\n";
    $body .= "詳細はWebアプリの注文履歴からご確認ください。\nhttps://shuyei.online/orders\n\n";
    $body .= "アサヒリース株式会社";
    send_smtp_mail($email, $subject, $body);
    return true;
}

function mail_log_exists(PDO $pdo, string $id): bool
{
    $stmt = $pdo->prepare("SELECT id FROM records WHERE store = 'mailLogs' AND id = ? AND deleted = 0 LIMIT 1");
    $stmt->execute([$id]);
    return (bool) $stmt->fetchColumn();
}

function insert_mail_log(PDO $pdo, string $id, array $data): void
{
    // rev 採番→INSERT を1トランザクションで直列化（store.php POST/DELETE と同方針）。
    // autocommit のままだと next_rev のロックが INSERT コミット前に解放され、コミット順が rev 順と
    // ズレて sync の増分カーソルが mailLogs 行を恒久的に飛ばし得る。
    $pdo->beginTransaction();
    try {
        $rev = next_rev($pdo);
        $stmt = $pdo->prepare(
            "INSERT INTO records (store, id, data, deleted, rev) VALUES ('mailLogs', ?, ?, 0, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0, rev = VALUES(rev)"
        );
        $stmt->execute([$id, json_encode(['id' => $id] + $data, JSON_UNESCAPED_UNICODE), $rev]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function send_due_return_reminders(PDO $pdo): array
{
    $today = new DateTimeImmutable('today');
    $stmt = $pdo->prepare("SELECT id, data FROM records WHERE store = 'orders' AND deleted = 0");
    $stmt->execute();
    $sent = 0;
    $skipped = 0;
    $errors = [];

    foreach ($stmt as $r) {
        $order = json_decode($r['data'], true);
        if (!is_array($order)) continue;
        $status = (string) ($order['status'] ?? '');
        if (in_array($status, ['返却済', '返却済み', '完了', 'キャンセル'], true)) continue;
        $hasRent = false;
        foreach (($order['items'] ?? []) as $item) {
            if (($item['type'] ?? '') === 'rent') {
                $hasRent = true;
                break;
            }
        }
        if (!$hasRent || empty($order['rentalEndDate'])) continue;
        $email = order_customer_email($order);
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) continue;

        try {
            $end = new DateTimeImmutable(str_replace('/', '-', (string) $order['rentalEndDate']));
            $days = (int) $today->diff($end)->format('%r%a');
        } catch (Throwable $e) {
            continue;
        }
        if ($days < 0 || $days > 3) continue;

        $orderNo = order_label($order);
        $logId = 'due-' . $today->format('Ymd') . '-' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($order['id'] ?? $orderNo));
        if (mail_log_exists($pdo, $logId)) {
            $skipped++;
            continue;
        }

        $subject = "【アサヒリース】返却期限のお知らせ {$orderNo}";
        $body = (string) ($order['companyName'] ?? '') . "\n";
        $body .= (string) ($order['personName'] ?? '') . " 様\n\n";
        $body .= $days === 0
            ? "本日がレンタル終了予定日です。\n"
            : "レンタル終了予定日まで残り{$days}日です。\n";
        $body .= "返却または延長手続きをWebアプリからご確認ください。\n\n";
        $body .= "注文番号: {$orderNo}\n";
        $body .= "レンタル終了予定日: " . (string) $order['rentalEndDate'] . "\n";
        $body .= "https://shuyei.online/return\n\n";
        $body .= "アサヒリース株式会社";

        try {
            send_smtp_mail($email, $subject, $body);
            insert_mail_log($pdo, $logId, [
                'type' => 'due_return',
                'orderId' => (string) ($order['id'] ?? ''),
                'orderNumber' => $orderNo,
                'to' => $email,
                'sentAt' => date('c'),
            ]);
            $sent++;
        } catch (Throwable $e) {
            $errors[] = ['order' => $orderNo, 'error' => $e->getMessage()];
        }
    }

    return ['sent' => $sent, 'skipped' => $skipped, 'errors' => $errors];
}
