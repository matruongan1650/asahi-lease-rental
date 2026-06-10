<?php
/**
 * これをコピーして同じ階層に config.php を作成し、XServer の MySQL 情報を入れてください。
 * 値は XServer パネル「データベース → MySQL設定」で確認できます。
 *   - host: 通常 'localhost'（同一サーバー）。指定がある場合は 'mysqlXXXX.xserver.jp' 等。
 *   - db  : 作成した MySQL データベース名（例: kansei123_asahi）
 *   - user: MySQL ユーザー名（例: kansei123_app）
 *   - pass: 上記ユーザーのパスワード
 *
 * config.php はリポジトリに含めない（.gitignore 済み）。サーバー上に直接作成/アップロードする。
 */
return [
    'host'    => 'localhost',
    'db'      => 'your_db_name',
    'user'    => 'your_db_user',
    'pass'    => 'your_db_password',
    'charset' => 'utf8mb4',
];
