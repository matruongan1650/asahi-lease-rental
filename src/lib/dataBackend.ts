/**
 * dataBackend.ts — データ同期バックエンドの選択スイッチ。
 *
 *   "local"    : localStorage + BroadcastChannel のみ（同一ブラウザ内のみ同期）
 *   "firebase" : Firestore クラウド同期
 *   "vercel"   : 自前バックエンド（/api + Postgres/Neon、ポーリング同期）
 *
 * Vercel バックエンドはサーバーレスのためプッシュ通知が無く、
 * SYNC_POLL_MS 間隔のポーリングで全クライアントへ反映する。
 */
export type DataBackend = "local" | "firebase" | "api";

// "api" = 自前バックエンド（/api 経由のポーリング同期）。
// Vercel(Node) でも XServer(PHP+MySQL) でも、同じ /api/store・/api/sync 規約で動く。
export const DATA_BACKEND: DataBackend = "api";

/** ポーリング間隔（ミリ秒）。短いほどリアルタイム性↑、サーバー負荷↑。 */
export const SYNC_POLL_MS = 3000;

/** API のベースパス（同一オリジン）。 */
export const API_BASE = "/api";
