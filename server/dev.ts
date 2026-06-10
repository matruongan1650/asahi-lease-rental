/**
 * server/dev.ts — ローカル開発用 API サーバー。
 * `npm run server` で起動。Vite (npm run dev) は /api を :8787 へプロキシする。
 * DATABASE_URL があれば Neon、無ければインメモリ（再起動で消える）で動作。
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { app } from "./app";
import { getDb } from "./db";

const port = Number(process.env.API_PORT || 8787);
app.listen(port, () => {
  console.log(`[api] dev server → http://localhost:${port}  (backend: ${getDb().kind})`);
  if (getDb().kind === "memory") {
    console.log("[api] DATABASE_URL 未設定 → インメモリ運用（再起動で消えます）。Neon を使うには .env.local に DATABASE_URL を設定してください。");
  }
});
