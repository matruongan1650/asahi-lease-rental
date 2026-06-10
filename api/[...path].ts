/**
 * Vercel Serverless Function (catch-all).
 * /api/* へのリクエストを共有 Express app に委譲する。
 * Neon を使うには Vercel の環境変数に DATABASE_URL を設定すること。
 */
import app from "../server/app";

export default app;
