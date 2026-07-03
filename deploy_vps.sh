#!/usr/bin/env bash
# Vultr VPS への rsync デプロイ（XServer の FTPS 版 deploy_xserver.py の置き換え）。
# 認証情報は .env.deploy（.gitignore 済み）から読む。
#
# .env.deploy の例:
#   VPS_HOST=xxx.xxx.xxx.xxx        # または shuyei.online（DNS 切替後）
#   VPS_USER=deploy                 # SSH の sudo ユーザー
#   VPS_PATH=/var/www/shuyei        # Web ルート（nginx root と一致）
#   VPS_PORT=22
#
# 使い方:  npm run build   →   bash deploy_vps.sh
set -euo pipefail
cd "$(dirname "$0")"

# .env.deploy を読み込む
if [ -f .env.deploy ]; then
  set -a; . ./.env.deploy; set +a
fi
: "${VPS_HOST:?[.env.deploy] VPS_HOST を設定してください}"
: "${VPS_USER:?[.env.deploy] VPS_USER を設定してください}"
VPS_PATH="${VPS_PATH:-/var/www/shuyei}"
VPS_PORT="${VPS_PORT:-22}"

[ -d dist ] || { echo "[deploy] dist/ がありません。先に npm run build を実行してください。"; exit 1; }

echo "[deploy] dist/ → ${VPS_USER}@${VPS_HOST}:${VPS_PATH}"
# --delete で旧ハッシュアセットを掃除。ただし以下は絶対に消さない/上書きしない:
#   - api/config.php  … サーバ専用のDB資格情報・秘密トークン
#   - api/uploads/    … 顧客/スタッフがアップした写真（実データ）
rsync -avz --delete \
  --exclude 'api/config.php' \
  --exclude 'api/uploads/' \
  --exclude '.DS_Store' \
  -e "ssh -p ${VPS_PORT}" \
  dist/ "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"

echo "[deploy] 完了 ✅"
