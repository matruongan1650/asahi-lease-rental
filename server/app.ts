/**
 * server/app.ts — データ同期 API（Express）。
 * ローカル開発（server/dev.ts）と Vercel（api/[...path].ts）の双方で同じ app を使う。
 *
 * Routes:
 *   GET    /api/store?name=<store>            → 全レコード [{id, ...data}]
 *   POST   /api/store?name=<store>   body=rec → upsert（rec.id 必須）
 *   DELETE /api/store?name=<store>&id=<id>    → 論理削除
 *   PUT    /api/store?name=<store>   body=[..]→ setAll（全置換）
 *   GET    /api/sync?since=<rev>              → {rev, changes:[{store,id,data,deleted,rev}]}
 *   GET    /api/health                        → {ok, backend}
 */

import express, { type Request, type Response } from "express";
import { getDb, ensureInit } from "./db";

export const app = express();

app.use(express.json({ limit: "12mb" }));

// 開発時のクロスオリジン保険（Vercel/Vite proxy では同一オリジンなので通常不要）。
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const STORE_RE = /^[a-zA-Z0-9_]+$/;
function validStore(name: unknown): name is string {
  return typeof name === "string" && STORE_RE.test(name) && name.length <= 64;
}

async function withDb<T>(res: Response, fn: () => Promise<T>): Promise<void> {
  try {
    await ensureInit();
    const result = await fn();
    res.json(result as any);
  } catch (e) {
    console.error("[api] error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, backend: getDb().kind });
});

app.get("/api/store", (req: Request, res: Response) => {
  const name = req.query.name;
  if (!validStore(name)) return res.status(400).json({ error: "invalid store name" });
  withDb(res, async () => {
    const rows = await getDb().list(name);
    // クライアントは {id, ...data} 形式を期待（OrderBus レコード）。
    return rows.map((r) => ({ id: r.id, ...(r.data as object) }));
  });
});

app.post("/api/store", (req: Request, res: Response) => {
  const name = req.query.name;
  if (!validStore(name)) return res.status(400).json({ error: "invalid store name" });
  const record = req.body;
  if (!record || typeof record !== "object" || !record.id) {
    return res.status(400).json({ error: "record with id required" });
  }
  withDb(res, async () => {
    await getDb().upsert(name, String(record.id), record);
    return { ok: true };
  });
});

app.delete("/api/store", (req: Request, res: Response) => {
  const name = req.query.name;
  const id = req.query.id;
  if (!validStore(name)) return res.status(400).json({ error: "invalid store name" });
  if (typeof id !== "string" || !id) return res.status(400).json({ error: "id required" });
  withDb(res, async () => {
    await getDb().remove(name, id);
    return { ok: true };
  });
});

app.put("/api/store", (req: Request, res: Response) => {
  const name = req.query.name;
  if (!validStore(name)) return res.status(400).json({ error: "invalid store name" });
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: "array body required" });
  withDb(res, async () => {
    const mapped = items
      .filter((it) => it && it.id !== undefined && it.id !== null)
      .map((it) => ({ id: String(it.id), data: it }));
    await getDb().setAll(name, mapped);
    return { ok: true, count: mapped.length };
  });
});

app.get("/api/sync", (req: Request, res: Response) => {
  const since = Number(req.query.since ?? 0) || 0;
  withDb(res, async () => {
    const { rows, rev } = await getDb().changesSince(since);
    return {
      rev,
      changes: rows.map((r) => ({
        store: r.store,
        id: r.id,
        deleted: r.deleted,
        data: r.deleted ? null : { id: r.id, ...(r.data as object) },
      })),
    };
  });
});

export default app;
