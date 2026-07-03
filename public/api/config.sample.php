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
    'smtp' => [
        'host' => 'smtp.gmail.com',
        'port' => 465,
        'secure' => 'ssl',
        'user' => 'your_gmail_or_google_workspace_account',
        'pass' => 'your_google_app_password',
        'from' => 'your_gmail_or_google_workspace_account',
        'from_name' => 'アサヒリース株式会社',
    ],
    'mail_api_enabled' => false,
    'notify_cron_token' => 'set-a-long-random-token',
    // ── データ API（/store・/sync・/query・/upload）の共有トークン認証 ──────────────
    // 空文字のままだと認証は無効＝誰でも全データを読み書き・削除できてしまう。
    // 本番では必ず長いランダム値（例: bin2hex(random_bytes(32))）を設定すること。
    // ＊フロント側のビルド時環境変数 VITE_API_TOKEN に「同じ値」を設定する必要がある。
    //   （.env.production などに VITE_API_TOKEN=... を置いてビルド／APK 化する）
    'api_token' => '',
    // ── ユーザートークン(X-User-Token)の署名鍵（auth.php / current_user()）──────────────
    // クライアントには配布しない「サーバー専用」の秘密。api_token はアプリのバンドルに含まれ
    // 公開されるため、これを署名鍵に流用すると誰でも role=admin のトークンを偽造できてしまう。
    // 必ず api_token とは別の長いランダム値を設定すること（例: bin2hex(random_bytes(32))）。
    // 空の場合のみ後方互換で api_token にフォールバックする（本番では必ず設定）。
    // ＊この値を変更すると発行済みトークンは無効化され、全ユーザーが再ログインを求められる。
    'auth_secret' => '',
    // ── fail-closed 強制（Phase C）──────────────────────────────────────────────
    // true にすると、機密ストア(orders/users)は有効な X-User-Token 必須となり、未提示/不正の
    // リクエストを拒否する（store/query は 401、sync は機密ストア内容を配信しない）。
    // ★全クライアント(web リロード済み + 新 APK)がトークンを送る状態にしてから有効化すること。
    //   先に有効化すると未更新クライアントが壊れる。auth_secret 変更後は全員の再ログインが前提。
    'enforce_user_token' => false,
    // ── Cloudflare R2（画像・サインの外部保存 / dual-write）────────────────────────
    // 設定すると upload.php がローカル保存に加えて R2 へも PUT する（未設定なら従来通り）。
    // public_base を設定すると返す URL が R2/CDN 側に切り替わる（DNS を Cloudflare へ移した後に
    // カスタムドメインを設定してから入れること。空の間はローカル URL のまま＝安全）。
    // 'r2' => [
    //     'account_id'  => '<Cloudflare Account ID>',
    //     'access_key'  => '<R2 API Token Access Key ID>',
    //     'secret_key'  => '<R2 API Token Secret Access Key>',
    //     'bucket'      => 'asahi-uploads',
    //     'public_base' => '',
    // ],

    // ── パスワードの遅延ハッシュ化（Phase 3）──────────────────────────────────────
    // true にすると、auth.php が平文で認証成功したユーザーを bcrypt へ再ハッシュして保存する
    //（一斉リセット不要・段階移行）。
    // ★クライアント側の平文比較を撤廃し、サーバー認証(auth.php)へ移行してから有効化すること。
    //   先に有効化すると、ハッシュ化済みレコードでクライアントの平文比較が失敗しログイン不能になる。
    'hash_passwords' => false,
];
