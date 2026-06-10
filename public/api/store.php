<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$name = $_GET['name'] ?? null;
if (!valid_store($name)) {
    json_out(['error' => 'invalid store name'], 400);
}

try {
    $pdo = db();

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
        json_out($out);
    }

    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        if (!is_array($body) || !isset($body['id'])) {
            json_out(['error' => 'record with id required'], 400);
        }
        $id = (string) $body['id'];
        $rev = next_rev($pdo);
        $stmt = $pdo->prepare(
            "INSERT INTO records (store, id, data, deleted, rev) VALUES (?, ?, ?, 0, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0, rev = VALUES(rev)"
        );
        $stmt->execute([$name, $id, json_encode($body, JSON_UNESCAPED_UNICODE), $rev]);
        json_out(['ok' => true]);
    }

    if ($method === 'PUT') {
        // 全置換（クライアントは通常 diff を送るため未使用。パリティ用）。
        $items = json_decode(file_get_contents('php://input'), true);
        if (!is_array($items)) {
            json_out(['error' => 'array body required'], 400);
        }
        $ids = [];
        foreach ($items as $it) {
            if (!is_array($it) || !isset($it['id'])) {
                continue;
            }
            $id = (string) $it['id'];
            $ids[] = $id;
            $rev = next_rev($pdo);
            $stmt = $pdo->prepare(
                "INSERT INTO records (store, id, data, deleted, rev) VALUES (?, ?, ?, 0, ?)
                 ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0, rev = VALUES(rev)"
            );
            $stmt->execute([$name, $id, json_encode($it, JSON_UNESCAPED_UNICODE), $rev]);
        }
        if ($ids) {
            $place = implode(',', array_fill(0, count($ids), '?'));
            $rev = next_rev($pdo);
            $stmt = $pdo->prepare(
                "UPDATE records SET deleted = 1, rev = ? WHERE store = ? AND deleted = 0 AND id NOT IN ($place)"
            );
            $stmt->execute(array_merge([$rev, $name], $ids));
        }
        json_out(['ok' => true, 'count' => count($ids)]);
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if (!is_string($id) || $id === '') {
            json_out(['error' => 'id required'], 400);
        }
        $rev = next_rev($pdo);
        $stmt = $pdo->prepare("UPDATE records SET deleted = 1, rev = ? WHERE store = ? AND id = ?");
        $stmt->execute([$rev, $name, $id]);
        json_out(['ok' => true]);
    }

    json_out(['error' => 'method not allowed'], 405);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 500);
}
