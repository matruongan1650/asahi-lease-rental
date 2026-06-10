<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

try {
    $pdo = db();
    $since = (int) ($_GET['since'] ?? 0);
    $stmt = $pdo->prepare(
        "SELECT store, id, data, deleted, rev FROM records WHERE rev > ? ORDER BY rev ASC LIMIT 5000"
    );
    $stmt->execute([$since]);

    $changes = [];
    $maxRev = $since;
    foreach ($stmt as $row) {
        $rev = (int) $row['rev'];
        if ($rev > $maxRev) {
            $maxRev = $rev;
        }
        $deleted = ((int) $row['deleted']) === 1;
        $changes[] = [
            'store'   => $row['store'],
            'id'      => $row['id'],
            'deleted' => $deleted,
            'data'    => $deleted ? null : json_decode($row['data'], true),
        ];
    }

    json_out(['rev' => $maxRev, 'changes' => $changes]);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 500);
}
