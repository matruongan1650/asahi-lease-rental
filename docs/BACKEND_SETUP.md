# データ同期バックエンド

3つのポータル（Admin / Staff / Customer）が**端末をまたいで**データを共有するための自前バックエンド。
フロントエンドはすべて `OrderBus`（`src/lib/orderBus.ts`）経由でデータを読み書きし、
`/api/sync` の**ポーリング**（既定3秒）で全クライアントへ反映する。

バックエンドは `src/lib/dataBackend.ts` の `DATA_BACKEND` で切替:
- `"api"` … 自前バックエンド（**既定**）。/api/store・/api/sync 規約。**XServer(PHP+MySQL)** でも **Vercel(Node)** でも動く。
- `"firebase"` … Firestore
- `"local"` … localStorage のみ（同一ブラウザ内）

データモデルは汎用 KV/ドキュメント: テーブル `records(store, id, data, deleted, rev, updated_at)`。
スキーマは初回 API 呼び出し時に自動作成（手動マイグレーション不要）。

**マルチクライアント安全**: `setAll` は全置換ではなく差分送信。他クライアントが追加したばかりのレコードを消さない。
**既存ローカルデータ保持**: 初回接続時、サーバーに無いローカル限定レコードを自動アップロード（`asahi._synced_v1` で一度だけ）。

---

## ▶ 本命: XServer (PHP + MySQL) にデプロイ

XServer レンタルサーバー（PHP + MariaDB）で完結する構成。Node も外部DBも不要。

### 1. MySQL データベースを作成
XServer パネル → **データベース → MySQL設定**:
1. 「MySQLデータベース追加」でデータベースを作成（例 `kansei123_asahi`）。
2. 「MySQLユーザ追加」でユーザーを作成。
3. 作成した DB にユーザーを**アクセス権限追加**。
4. ホスト名は通常 `localhost`（パネルに記載があればそれを使用）。

### 2. config.php を用意
`public/api/config.sample.php` をコピーして `public/api/config.php` を作成し、上記の値を記入:
```php
<?php
return [
  'host'    => 'localhost',
  'db'      => 'kansei123_asahi',
  'user'    => 'kansei123_app',
  'pass'    => '********',
  'charset' => 'utf8mb4',
];
```
> `config.php` は Git 管理外（.gitignore 済み）。サーバー上に直接置くか、ビルド後 dist にコピーしてアップロードする。

### 3. ビルド
```bash
npm run build
```
`dist/` に `index.html` + `assets/` + `api/*.php` + `.htaccess` が出力される（`public/` の内容がコピーされる）。

### 4. FTP でアップロード
`dist/` の中身を**まるごと**公開ディレクトリ（例 `ドメイン/public_html/`）へアップロード:
- `index.html`, `assets/`
- `api/`（`store.php`, `sync.php`, `db.php`, `health.php`）
- `.htaccess`
- `api/config.php`（手順2で作成。**sample ではなく実ファイル**）

> ドメイン直下に置くこと（サブディレクトリ配置時は `.htaccess` の `RewriteBase` と `src/lib/dataBackend.ts` の `API_BASE` を調整）。

### 5. 動作確認
- `https://あなたのドメイン/api/health` → `{"ok":true,"backend":"php-mysql"}` なら DB 接続OK。
- サイトを開く → 商品/注文などが3サイトで共有される（約3秒で反映）。

---

## ローカル開発での動作確認

`vite dev` だけでは PHP は動かない。クラウド同期を試すには次のいずれか:

- **Node のお試しサーバー**（PHP と同じ規約・インメモリ）:
  ```bash
  npm run server   # :8787（DATABASE_URL があれば Neon、無ければインメモリ）
  npm run dev      # Vite :4000（/api を :8787 へプロキシ）
  ```
- もしくは XServer 上で直接確認。

`vite dev` 単体（`npm run dev` のみ）では `/api` が無いためローカル(localStorage)のみで動作する（フォールバック）。

---

## （代替）Vercel + Neon にデプロイ
1. GitHub に push → Vercel で Import（`vercel.json` 同梱）。
2. Settings → Environment Variables に `DATABASE_URL`（Neon 接続文字列）。
3. Deploy。`api/[...path].ts`（共有 Express app）が /api を処理。

| ファイル | 役割 |
|---|---|
| `public/api/*.php` | **XServer** 用 API（PHP + MySQL） |
| `public/.htaccess` | XServer ルーティング（/api→php, SPA フォールバック） |
| `api/[...path].ts`, `server/*` | Vercel/Node 用 API（代替） |
| `src/lib/dataBackend.ts` | バックエンド切替フラグ |
| `src/lib/backendSync.ts` | クライアント fetch ラッパー |

---

## 注意
- API は認証なし（誰でも `/api` を叩ける）。本番で厳格にするなら API キー/認証の追加を検討。
- MariaDB 10.5 は `INSERT ... ON DUPLICATE KEY UPDATE ... VALUES()` をサポート（このコードが使用）。
