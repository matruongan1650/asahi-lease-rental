<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

require_api_token();

/**
 * query.php — サーバー側でフィルタ＋ページングする照会 API。
 * 注文が数万件になってもクライアントは 1 ページ分しか受け取らない。
 *
 *   GET /api/query?name=orders&hasType=rent&statusIn=A,B&q=foo&limit=50&offset=0&counts=1
 *     hasType : "rent" | "buy"（指定時のみ）
 *     statusIn: カンマ区切りのステータス（OR 条件）
 *     q       : data 全文の部分一致
 *     counts  : "1" のとき hasType+q 範囲の status 別件数も返す（キュー件数バッジ用）
 *   → { rows:[{id,...}], total, statusCounts:{status:count} }
 *
 * 注: data は JSON 文字列（json_encode 済み・空白なし）。"key":"value" を LIKE で照合する。
 */
$name = $_GET['name'] ?? null;
if (!valid_store($name)) {
    json_out(['error' => 'invalid store name'], 400);
}

$limit = (int) ($_GET['limit'] ?? 50);
if ($limit < 1) $limit = 1;
if ($limit > 500) $limit = 500;
$offset = (int) ($_GET['offset'] ?? 0);
if ($offset < 0) $offset = 0;

$hasType = (string) ($_GET['hasType'] ?? '');
$q = trim((string) ($_GET['q'] ?? ''));
$statusIn = array_values(array_filter(array_map('trim', explode(',', (string) ($_GET['statusIn'] ?? ''))), fn($s) => $s !== ''));
$wantCounts = ((string) ($_GET['counts'] ?? '')) === '1';

try {
    $pdo = db();

    // 基本フィルタ（store / 未削除 / 種別 / 検索）
    $base = ['store = ?', 'deleted = 0'];
    $baseParams = [$name];

    // 顧客スコープ: 有効なユーザートークンを提示した非特権(顧客)には自分の orders / 自分の users のみ返す
    //（store.php GET と同方針）。トークン未提示(旧クライアント)は後方互換で従来どおり全件、admin/staff は全件。
    // これが無いと共有 api_token を持つ顧客が /api/query?name=orders|users で全社の注文・ユーザーを照会できる。
    // $base/$baseParams は total/sum/page/counts の全クエリに渡るため、ここで注入すれば全てに一貫して効く。
    $cu = current_user();
    // fail-closed 強制時、機密ストアは有効なユーザートークン必須（未提示/不正は拒否）。既定は fail-open。
    if (enforce_user_token_enabled() && is_sensitive_store($name) && $cu === null) {
        json_out(['error' => 'unauthorized'], 401);
    }
    if ($cu && !is_privileged_role($cu['role'])) {
        if ($name === 'orders') {
            $base[] = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) = ?";
            $baseParams[] = $cu['uid'];
        } elseif ($name === 'users') {
            $base[] = "id = ?";
            $baseParams[] = $cu['uid'];
        } else {
            json_out(['error' => 'forbidden'], 403);
        }
    }

    if ($hasType === 'rent' || $hasType === 'buy') {
        $base[] = 'data LIKE ?';
        $baseParams[] = '%"type":"' . $hasType . '"%';
    }
    if ($q !== '') {
        // LIKE のワイルドカード(% _)と \ をエスケープ。ユーザー入力の % / _ が
        // 意図せず全件マッチ/探索に使われるのを防ぐ（ESCAPE 文字は \）。
        $qEsc = addcslashes($q, '\\%_');
        $base[] = "data LIKE ? ESCAPE '\\\\'";
        $baseParams[] = '%' . $qEsc . '%';
    }
    $baseSql = implode(' AND ', $base);

    // ステータス絞り込み（OR）
    $statusSql = '';
    $statusParams = [];
    if ($statusIn) {
        $ors = [];
        foreach ($statusIn as $s) {
            $ors[] = 'data LIKE ?';
            $statusParams[] = '%"status":"' . $s . '"%';
        }
        $statusSql = ' AND (' . implode(' OR ', $ors) . ')';
    }

    $whereSql = $baseSql . $statusSql;
    $allParams = array_merge($baseParams, $statusParams);

    // 件数
    $cnt = $pdo->prepare("SELECT COUNT(*) FROM records WHERE $whereSql");
    $cnt->execute($allParams);
    $total = (int) $cnt->fetchColumn();

    // 金額合計（KPI 用。hasType+q+status の絞り込み範囲で total を合算）
    $sumStmt = $pdo->prepare("SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.total')) AS DECIMAL(18,2))), 0) FROM records WHERE $whereSql");
    $sumStmt->execute($allParams);
    $sumTotal = (float) $sumStmt->fetchColumn();

    // ページ（新しい順）
    $stmt = $pdo->prepare("SELECT data FROM records WHERE $whereSql ORDER BY rev DESC LIMIT $limit OFFSET $offset");
    $stmt->execute($allParams);
    $rows = [];
    foreach ($stmt as $row) {
        $obj = json_decode($row['data'], true);
        if (is_array($obj)) $rows[] = $obj;
    }

    // ステータス別件数（キュー件数バッジ用。statusIn は無視し hasType+q 範囲で集計）
    $statusCounts = (object) [];
    if ($wantCounts) {
        $cstmt = $pdo->prepare("SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) AS st, COUNT(*) AS c FROM records WHERE $baseSql GROUP BY st");
        $cstmt->execute($baseParams);
        $sc = [];
        foreach ($cstmt as $row) {
            $sc[(string) ($row['st'] ?? '')] = (int) $row['c'];
        }
        $statusCounts = $sc ?: (object) [];
    }

    json_out(['rows' => $rows, 'total' => $total, 'sumTotal' => $sumTotal, 'statusCounts' => $statusCounts]);
} catch (Throwable $e) {
    error_log('[query] ' . $e->getMessage());
    json_out(['error' => 'internal error'], 500);
}
