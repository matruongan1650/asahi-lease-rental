/**
 * server/db.ts — データ同期バックエンドのストレージ層。
 *
 * 抽象化された KV/ドキュメントモデル:
 *   records(store, id, data jsonb, deleted, rev, updated_at)  PK(store,id)
 * すべての書き込みでグローバル連番 rev を採番し、`/api/sync?since=<rev>` の
 * 差分ポーリングで全クライアントへ反映する。
 *
 * DATABASE_URL があれば Neon(Postgres)、無ければインメモリ（ローカル開発/テスト用）。
 */

export interface ChangeRow {
  store: string;
  id: string;
  data: unknown;
  deleted: boolean;
  rev: number;
}

export interface QueryOpts {
  hasType?: string;        // "rent" | "buy"
  statusIn?: string[];     // OR over statuses
  q?: string;              // full-text contains
  limit: number;
  offset: number;
  counts?: boolean;        // also return status-grouped counts (over hasType+q range)
}
export interface QueryResult {
  rows: any[];
  total: number;
  sumTotal: number;
  statusCounts: Record<string, number>;
}

export interface Db {
  init(): Promise<void>;
  list(store: string): Promise<Array<{ id: string; data: unknown }>>;
  upsert(store: string, id: string, data: unknown): Promise<void>;
  remove(store: string, id: string): Promise<void>;
  setAll(store: string, items: Array<{ id: string; data: unknown }>): Promise<void>;
  changesSince(since: number): Promise<{ rows: ChangeRow[]; rev: number }>;
  queryRecords(store: string, opts: QueryOpts): Promise<QueryResult>;
  kind: "neon" | "memory";
}

// ---------------------------------------------------------------------------
// In-memory adapter (ローカル開発・テスト用。プロセス再起動で消える)
// ---------------------------------------------------------------------------

function createMemoryDb(): Db {
  const stores = new Map<string, Map<string, { data: unknown; deleted: boolean; rev: number }>>();
  let revCounter = 0;

  function bump(): number {
    revCounter += 1;
    return revCounter;
  }
  function getStore(store: string) {
    let m = stores.get(store);
    if (!m) {
      m = new Map();
      stores.set(store, m);
    }
    return m;
  }

  return {
    kind: "memory",
    async init() {
      /* no-op */
    },
    async list(store) {
      const m = getStore(store);
      return Array.from(m.entries())
        .filter(([, v]) => !v.deleted)
        .sort((a, b) => b[1].rev - a[1].rev)
        .map(([id, v]) => ({ id, data: v.data }));
    },
    async upsert(store, id, data) {
      getStore(store).set(id, { data, deleted: false, rev: bump() });
    },
    async remove(store, id) {
      const m = getStore(store);
      const cur = m.get(id);
      if (cur) m.set(id, { ...cur, deleted: true, rev: bump() });
      else m.set(id, { data: null, deleted: true, rev: bump() });
    },
    async setAll(store, items) {
      const m = getStore(store);
      const keep = new Set(items.map((it) => String(it.id)));
      for (const [id, v] of m.entries()) {
        if (!keep.has(id) && !v.deleted) m.set(id, { ...v, deleted: true, rev: bump() });
      }
      for (const it of items) m.set(String(it.id), { data: it.data, deleted: false, rev: bump() });
    },
    async changesSince(since) {
      const rows: ChangeRow[] = [];
      for (const [store, m] of stores.entries()) {
        for (const [id, v] of m.entries()) {
          if (v.rev > since) rows.push({ store, id, data: v.data, deleted: v.deleted, rev: v.rev });
        }
      }
      rows.sort((a, b) => a.rev - b.rev);
      const rev = rows.length ? rows[rows.length - 1].rev : since;
      return { rows, rev };
    },
    async queryRecords(store, opts) {
      const m = getStore(store);
      const all = Array.from(m.entries())
        .filter(([, v]) => !v.deleted)
        .sort((a, b) => b[1].rev - a[1].rev)
        .map(([id, v]) => ({ id, ...(v.data as any) }));
      let base = all;
      if (opts.hasType) base = base.filter((o: any) => Array.isArray(o.items) && o.items.some((i: any) => i?.type === opts.hasType));
      if (opts.q) {
        const ql = opts.q.toLowerCase();
        base = base.filter((o: any) => JSON.stringify(o).toLowerCase().includes(ql));
      }
      const statusCounts: Record<string, number> = {};
      if (opts.counts) for (const o of base) { const s = String((o as any).status || ""); statusCounts[s] = (statusCounts[s] || 0) + 1; }
      let filtered = base;
      if (opts.statusIn && opts.statusIn.length) {
        const set = new Set(opts.statusIn);
        filtered = base.filter((o: any) => set.has(String(o.status || "")));
      }
      const total = filtered.length;
      const sumTotal = filtered.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
      const rows = filtered.slice(opts.offset, opts.offset + opts.limit);
      return { rows, total, sumTotal, statusCounts };
    },
  };
}

// ---------------------------------------------------------------------------
// Neon (Postgres) adapter
// ---------------------------------------------------------------------------

function createNeonDb(connectionString: string): Db {
  // DATABASE_URL 未設定環境ではロードしないよう、関数内で動的 import する。
  let sqlPromise: Promise<any> | null = null;
  async function getSql(): Promise<any> {
    if (!sqlPromise) {
      sqlPromise = import("@neondatabase/serverless").then((m) => m.neon(connectionString));
    }
    return sqlPromise;
  }

  return {
    kind: "neon",
    async init() {
      const sql = await getSql();
      await sql`CREATE SEQUENCE IF NOT EXISTS records_rev_seq`;
      await sql`
        CREATE TABLE IF NOT EXISTS records (
          store TEXT NOT NULL,
          id TEXT NOT NULL,
          data JSONB NOT NULL,
          deleted BOOLEAN NOT NULL DEFAULT false,
          rev BIGINT NOT NULL DEFAULT nextval('records_rev_seq'),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (store, id)
        )`;
      await sql`CREATE INDEX IF NOT EXISTS records_rev_idx ON records (rev)`;
    },
    async list(store) {
      const sql = await getSql();
      const rows = await sql`
        SELECT id, data FROM records
        WHERE store = ${store} AND deleted = false
        ORDER BY rev DESC`;
      return rows.map((r: any) => ({ id: r.id, data: r.data }));
    },
    async upsert(store, id, data) {
      const sql = await getSql();
      const json = JSON.stringify(data);
      await sql`
        INSERT INTO records (store, id, data, deleted, rev, updated_at)
        VALUES (${store}, ${id}, ${json}::jsonb, false, nextval('records_rev_seq'), now())
        ON CONFLICT (store, id) DO UPDATE
        SET data = ${json}::jsonb, deleted = false, rev = nextval('records_rev_seq'), updated_at = now()`;
    },
    async remove(store, id) {
      const sql = await getSql();
      await sql`
        UPDATE records SET deleted = true, rev = nextval('records_rev_seq'), updated_at = now()
        WHERE store = ${store} AND id = ${id}`;
    },
    async setAll(store, items) {
      const sql = await getSql();
      const ids = items.map((it) => String(it.id));
      // 新しいリストに無い既存 doc を論理削除
      await sql`
        UPDATE records SET deleted = true, rev = nextval('records_rev_seq'), updated_at = now()
        WHERE store = ${store} AND deleted = false AND NOT (id = ANY(${ids}))`;
      for (const it of items) {
        await this.upsert(store, String(it.id), it.data);
      }
    },
    async changesSince(since) {
      const sql = await getSql();
      const rows = await sql`
        SELECT store, id, data, deleted, rev FROM records
        WHERE rev > ${since}
        ORDER BY rev ASC
        LIMIT 5000`;
      const mapped: ChangeRow[] = rows.map((r: any) => ({
        store: r.store,
        id: r.id,
        data: r.data,
        deleted: r.deleted,
        rev: Number(r.rev),
      }));
      const rev = mapped.length ? mapped[mapped.length - 1].rev : since;
      return { rows: mapped, rev };
    },
    async queryRecords(store, opts) {
      const sql = await getSql();
      // jsonb 上でフィルタ。種別は items 配列内の type、検索は data 全文。
      const typeCond = opts.hasType
        ? sql`AND EXISTS (SELECT 1 FROM jsonb_array_elements(data->'items') it WHERE it->>'type' = ${opts.hasType})`
        : sql``;
      const qCond = opts.q ? sql`AND data::text ILIKE ${"%" + opts.q + "%"}` : sql``;
      const statusCond =
        opts.statusIn && opts.statusIn.length ? sql`AND (data->>'status') = ANY(${opts.statusIn})` : sql``;
      const totalRows = await sql`SELECT COUNT(*)::int AS c, COALESCE(SUM((data->>'total')::numeric),0) AS s FROM records WHERE store = ${store} AND deleted = false ${typeCond} ${qCond} ${statusCond}`;
      const total = Number(totalRows[0]?.c || 0);
      const sumTotal = Number(totalRows[0]?.s || 0);
      const pageRows = await sql`
        SELECT data FROM records
        WHERE store = ${store} AND deleted = false ${typeCond} ${qCond} ${statusCond}
        ORDER BY rev DESC LIMIT ${opts.limit} OFFSET ${opts.offset}`;
      const rows = pageRows.map((r: any) => r.data);
      const statusCounts: Record<string, number> = {};
      if (opts.counts) {
        const cRows = await sql`
          SELECT (data->>'status') AS st, COUNT(*)::int AS c FROM records
          WHERE store = ${store} AND deleted = false ${typeCond} ${qCond}
          GROUP BY (data->>'status')`;
        for (const r of cRows) statusCounts[String(r.st || "")] = Number(r.c || 0);
      }
      return { rows, total, sumTotal, statusCounts };
    },
  };
}

// ---------------------------------------------------------------------------
// Factory (singleton)
// ---------------------------------------------------------------------------

let _db: Db | null = null;
let _initPromise: Promise<void> | null = null;

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  _db = url ? createNeonDb(url) : createMemoryDb();
  return _db;
}

/** 初期化は一度だけ実行（スキーマ作成）。 */
export function ensureInit(): Promise<void> {
  if (!_initPromise) {
    _initPromise = getDb()
      .init()
      .catch((e) => {
        console.error("[db] init failed:", e);
        _initPromise = null; // 次回再試行できるように
        throw e;
      });
  }
  return _initPromise;
}
