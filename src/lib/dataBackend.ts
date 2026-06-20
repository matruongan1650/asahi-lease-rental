/**
 * dataBackend.ts — データ同期バックエンドの選択スイッチ。
 *
 *   "local"    : localStorage + BroadcastChannel のみ（同一ブラウザ内のみ同期）
 *   "api"      : XServer(PHP + MariaDB) の /api/store・/api/sync で同期
 *
 * XServer バックエンドはプッシュ通知ではなく、
 * SYNC_POLL_MS 間隔のポーリングで全クライアントへ反映する。
 */
export type DataBackend = "local" | "api";

// "api" = XServer(PHP + MariaDB) バックエンド（/api 経由のポーリング同期）。
export const DATA_BACKEND: DataBackend = "api";

/** ポーリング間隔（ミリ秒）。短いほどリアルタイム性↑、サーバー負荷↑。 */
export const SYNC_POLL_MS = 3000;

/**
 * API のベースパス。
 * - Web admin/customer: 同一オリジンの /api
 * - Android staff APK: Vite staff build で XServer の絶対URLを注入
 */
export const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

/**
 * データ API の共有トークン（ビルド時に注入）。サーバ側 config の api_token と一致させる。
 * 未設定なら送らない（＝サーバ側も認証を有効化していない前提）。
 */
export const API_TOKEN = (import.meta.env.VITE_API_TOKEN || "").trim();

// auth.php が発行する署名付きユーザートークン。サーバはこれで呼び出し元(userId/role)を信頼し、
// 顧客の orders/users 読み取りを本人分にスコープする。ログイン時に取得して保持する。
const USER_TOKEN_KEY = "asahi.userToken";

export function getUserToken(): string {
  try { return localStorage.getItem(USER_TOKEN_KEY) || ""; } catch { return ""; }
}
export function setUserToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(USER_TOKEN_KEY, token);
    else localStorage.removeItem(USER_TOKEN_KEY);
  } catch { /* ignore */ }
}

/**
 * 資格情報を auth.php に渡して署名付きユーザートークンを取得・保存する。
 * 失敗しても投げない（取得できなければ送らない＝サーバは後方互換で従来どおり動作）。
 */
export async function acquireUserToken(loginId: string, password: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/auth.php`, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ loginId, password }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data.token === "string" && data.token) setUserToken(data.token);
  } catch { /* ネットワーク不調等は無視（後方互換でトークン無し動作） */ }
}

/** API リクエスト用ヘッダ。共有トークン + （あれば）ユーザートークンを付与する。 */
export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) };
  if (API_TOKEN) h["X-Api-Token"] = API_TOKEN;
  const ut = getUserToken();
  if (ut) h["X-User-Token"] = ut;
  return h;
}
