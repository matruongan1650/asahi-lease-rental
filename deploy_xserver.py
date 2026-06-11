#!/usr/bin/env python3
"""
XServer へ dist/ をまるごとアップロードするデプロイスクリプト。
認証情報は .env.deploy（.gitignore 済み）から読む。チャットにパスワードを出さない。

使い方:
  1) .env.deploy に FTP_HOST / FTP_USER / FTP_PASS / FTP_REMOTE_DIR を記入
  2) npm run build
  3) python3 deploy_xserver.py
"""
import os
import sys
from ftplib import FTP, FTP_TLS


def load_env(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env(".env.deploy")

HOST = os.environ.get("FTP_HOST", "").strip()
USER = os.environ.get("FTP_USER", "").strip()
PASS = os.environ.get("FTP_PASS", "")
REMOTE = os.environ.get("FTP_REMOTE_DIR", "/shuyei.online/public_html").strip()
LOCAL = os.environ.get("LOCAL_DIR", "dist").strip()

if not (HOST and USER and PASS):
    print("[deploy] .env.deploy に FTP_HOST / FTP_USER / FTP_PASS を設定してください。")
    sys.exit(1)
if not os.path.isdir(LOCAL):
    print(f"[deploy] '{LOCAL}' がありません。先に `npm run build` を実行してください。")
    sys.exit(1)


def connect():
    try:
        ftp = FTP_TLS(HOST, timeout=60)
        ftp.login(USER, PASS)
        ftp.prot_p()
        print("[deploy] FTPS で接続しました")
        return ftp
    except Exception as e:  # noqa: BLE001
        print(f"[deploy] FTPS 失敗 ({e}) → 通常 FTP を試します")
        ftp = FTP(HOST, timeout=60)
        ftp.login(USER, PASS)
        print("[deploy] FTP で接続しました")
        return ftp


def ensure_remote_dir(ftp, path: str) -> None:
    ftp.cwd("/")
    for part in [p for p in path.split("/") if p]:
        try:
            ftp.cwd(part)
        except Exception:  # noqa: BLE001
            ftp.mkd(part)
            ftp.cwd(part)


def upload_contents(ftp, local_dir: str) -> None:
    for name in sorted(os.listdir(local_dir)):
        if name in (".DS_Store", "__MACOSX"):
            continue
        lp = os.path.join(local_dir, name)
        if os.path.isdir(lp):
            try:
                ftp.mkd(name)
            except Exception:  # noqa: BLE001
                pass
            ftp.cwd(name)
            upload_contents(ftp, lp)
            ftp.cwd("..")
        else:
            with open(lp, "rb") as fh:
                ftp.storbinary("STOR " + name, fh)
            print(f"  ✓ {ftp.pwd()}/{name}")


def cleanup_old_assets(ftp) -> None:
    """assets/ 内でローカルに存在しないハッシュ付き旧バンドルを削除する。
    （古い index.html をキャッシュしたブラウザが旧UIを読み続けるのを防ぐ）"""
    local_assets = os.path.join(LOCAL, "assets")
    if not os.path.isdir(local_assets):
        return
    keep = set(os.listdir(local_assets))
    try:
        ftp.cwd("assets")
    except Exception:  # noqa: BLE001
        return
    try:
        remote_files = ftp.nlst()
    except Exception:  # noqa: BLE001
        remote_files = []
    for name in remote_files:
        base = name.split("/")[-1]
        if base in (".", ".."):
            continue
        if base not in keep:
            try:
                ftp.delete(base)
                print(f"  ✗ 旧アセット削除: assets/{base}")
            except Exception as e:  # noqa: BLE001
                print(f"  ! 削除失敗 assets/{base}: {e}")
    ftp.cwd("..")


def main() -> None:
    print(f"[deploy] {LOCAL}/ → {HOST}{REMOTE}")
    ftp = connect()
    try:
        ensure_remote_dir(ftp, REMOTE)
        upload_contents(ftp, LOCAL)
        cleanup_old_assets(ftp)
        print("[deploy] 完了 ✅")
    finally:
        try:
            ftp.quit()
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    main()
