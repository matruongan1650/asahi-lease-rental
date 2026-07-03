# Vultr VPS 移行チェックリスト（アサヒリース）

XServer(共有ホスティング) → **Vultr High Frequency 2GB / Tokyo / Ubuntu 24.04** への移行手順。
構成: **Nginx + PHP 8.3-FPM + MariaDB** を1台に同居（React SPA + `/api/*` PHP + `api/uploads/` 写真）。

App の事実（前提）:
- API は `/api` 同一オリジン（`VITE_API_BASE` 既定 `/api`）。拡張子なし(`/api/store`,`/api/sync`,`/api/query`,`/api/upload`) と `.php`(`/api/auth.php`) 混在。
- アップロード写真は `Web ルート/api/uploads/`。**バックアップ・deploy 除外の対象**。
- `config.php`（サーバ専用の秘密: DB 資格情報・`api_token`・`auth_secret`）は Git 管理外・直アクセス禁止。
- **`api_token` と `auth_secret` は現行と同じ値を維持** → 既存のビルド済み Web / インストール済み APK がそのまま新サーバに接続でき、全ユーザー再ログインも不要。

---

## 0. Vultr コンソールでインスタンス作成
- Type: **Cloud Compute — High Frequency**, Plan: **1 vCPU / 2GB / 64GB NVMe ($12/mo)**
- Location: **Tokyo**, OS: **Ubuntu 24.04 LTS**
- **SSH Key を登録**（パスワードログインは後で無効化）
- Auto Backups: 有効化推奨（+約$2.4/mo）／または §11 の cron
- 作成後、**Vultr Firewall** を作成: `SSH(22)=自分のIPのみ`, `HTTP(80)=anywhere`, `HTTPS(443)=anywhere` を割当

以降 `SERVER_IP` = 割り当てられた IP。まず `ssh root@SERVER_IP`。

## 1. 初期ハーデニング
```bash
apt update && apt -y upgrade
timedatectl set-timezone Asia/Tokyo

# 作業用 sudo ユーザー
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/    # root の鍵を流用

# 2GB スワップ（メモリ逼迫時の保険）
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.conf

# SSH: 鍵のみ・root ログイン禁止
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/'          /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
apt -y install fail2ban ufw
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```
以降は `ssh deploy@SERVER_IP` で作業（`sudo`）。

## 2. LEMP 導入
```bash
sudo apt -y install nginx mariadb-server \
  php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-curl php8.3-xml php8.3-gd php8.3-zip php8.3-intl
sudo mysql_secure_installation     # root PW 設定・匿名/テスト削除
```

## 3. チューニング適用（このリポの deploy/ からコピー）
```bash
# ローカルから: scp deploy/*.cnf deploy/*.conf deploy@SERVER_IP:/tmp/
sudo cp /tmp/mariadb-tuning.cnf /etc/mysql/mariadb.conf.d/60-asahi.cnf
sudo cp /tmp/php-fpm-tuning.conf /etc/php/8.3/fpm/pool.d/z-asahi.conf
# php.ini 主要値
sudo sed -i 's/^;\?date.timezone.*/date.timezone = Asia\/Tokyo/' /etc/php/8.3/fpm/php.ini
sudo sed -i 's/^upload_max_filesize.*/upload_max_filesize = 20M/' /etc/php/8.3/fpm/php.ini
sudo sed -i 's/^post_max_size.*/post_max_size = 21M/'            /etc/php/8.3/fpm/php.ini
sudo systemctl restart mariadb php8.3-fpm
```

## 4. データベース作成
```bash
sudo mysql <<'SQL'
CREATE DATABASE asahi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'asahi_app'@'localhost' IDENTIFIED BY 'PUT_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON asahi.* TO 'asahi_app'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 5. XServer からデータ移行
**A) XServer に SSH がある場合:**
```bash
# XServer 側
mysqldump --single-transaction -u <xs_user> -p <xs_dbname> > asahi_dump.sql
# ローカル or VPS へ転送して取り込み
```
**B) SSH が無い場合:** XServer の **phpMyAdmin → エクスポート（SQL）** で `asahi_dump.sql` を取得。
```bash
# VPS で取り込み（dump を VPS に scp 済み前提）
mysql -u asahi_app -p asahi < asahi_dump.sql
mysql -u asahi_app -p asahi -e "SHOW TABLES; SELECT COUNT(*) FROM records;"   # 確認
```
> `records` テーブル（store/id/data/deleted/rev/updated_at）と rev カウンタが入っていれば OK。

## 6. コード配置 + config.php
```bash
# VPS: Web ルート作成
sudo mkdir -p /var/www/shuyei/api/uploads
sudo chown -R deploy:www-data /var/www/shuyei
sudo chmod -R g+w /var/www/shuyei/api/uploads      # PHP-FPM(www-data) が書ける

# ローカル: ビルドして rsync（.env.deploy を用意 → §12 参照）
npm run build
bash deploy_vps.sh

# VPS: config.php をサーバ上で作成（現行の値をベースに DB だけ差し替え）
#   現行 public/api/config.php の api_token / auth_secret / smtp を「そのまま」使い、
#   host=localhost, db=asahi, user=asahi_app, pass=§4のパスワード に変更。
sudo -u www-data nano /var/www/shuyei/api/config.php
```
> `config.php` は deploy から除外済み（`deploy_vps.sh`）。サーバでのみ管理。

## 7. Nginx サイト有効化
```bash
# scp deploy/nginx-shuyei.conf deploy@SERVER_IP:/tmp/
sudo cp /tmp/nginx-shuyei.conf /etc/nginx/sites-available/shuyei.conf
sudo ln -sf /etc/nginx/sites-available/shuyei.conf /etc/nginx/sites-enabled/shuyei.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
**DNS 切替前のスモークテスト（IP 直叩き）:**
```bash
curl -s -H 'Host: shuyei.online' http://SERVER_IP/api/health.php          # → 200/JSON
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: shuyei.online' \
     'http://SERVER_IP/api/store.php?name=orders'                          # → 401（トークン無し=正常）
curl -s -H 'Host: shuyei.online' http://SERVER_IP/api/store               # 拡張子なしも動くか
```

## 8. DNS 切替
- 事前に `shuyei.online` の A レコード **TTL を 300 秒**へ下げておく（切替前日）。
- 本番切替: A レコード → `SERVER_IP`（`www` も）。伝播を待つ（`dig shuyei.online +short`）。

## 9. HTTPS（Let's Encrypt）※ DNS が VPS を指してから
```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d shuyei.online -d www.shuyei.online --redirect -m an.ma@asahi-lease.jp --agree-tos
# 自動更新は systemd タイマーで有効。確認: sudo certbot renew --dry-run
```

## 10. 最終検証
```bash
curl -s https://shuyei.online/api/health.php                 # 200
curl -s -o /dev/null -w '%{http_code}\n' https://shuyei.online/api/store.php?name=orders   # 401
```
- ブラウザで顧客/管理サイトを開き、ログイン→受注/請求が表示されるか。
- **APK は再ビルド不要**（同一ドメイン `/api` + 同一 `api_token`/`auth_secret`）。実機で同期を確認。
- 写真アップロード（現場報告など）が `/api/uploads/…` に保存・表示されるか。

## 11. バックアップ（Vultr Auto Backup を使わない場合）
```bash
sudo tee /etc/cron.daily/asahi-dbbackup >/dev/null <<'SH'
#!/bin/bash
d=/var/backups/asahi; mkdir -p "$d"
mysqldump --single-transaction -u asahi_app -p'PASSWORD' asahi | gzip > "$d/asahi-$(date +\%F).sql.gz"
find "$d" -name 'asahi-*.sql.gz' -mtime +14 -delete
SH
sudo chmod +x /etc/cron.daily/asahi-dbbackup
```
> 可能ならこの gz を別ロケーション（Vultr Object Storage 等）へも退避。`api/uploads/` も定期同期推奨。

## 12. デプロイ切替（今後の運用）
`.env.deploy` を VPS 用に更新:
```
VPS_HOST=shuyei.online
VPS_USER=deploy
VPS_PATH=/var/www/shuyei
VPS_PORT=22
```
以後のデプロイ:
```bash
npm run build && bash deploy_vps.sh
```
（安定したら `package.json` の `"deploy"` を `... && bash deploy_vps.sh` に変更。切替完了までは XServer 版 `deploy_xserver.py` を残す。）

## 13. ダウンタイム最小化の順序
1. §0–§7 を先に全部済ませ、IP 直叩きで動作確認（XServer は稼働のまま）。
2. 切替直前に XServer を**メンテナンス表示/書込停止**（数分）。
3. XServer の**最終 mysqldump** を VPS に取り込み直す（§5）。
4. DNS を VPS へ（§8）→ certbot（§9）→ 検証（§10）。
5. 1〜2日 XServer を残しておき、問題なければ解約。

---
### 注意
- **メール送信**: Vultr は 25番のアウトバウンドを既定でブロックするが、本アプリは Gmail SMTP **465** を使うため通常は問題なし。もし送信不可なら Vultr サポートに解除申請。
- **SMTP アプリパスワード** も `config.php` に含まれる → サーバ専用で管理。
