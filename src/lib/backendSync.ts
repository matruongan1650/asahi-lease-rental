/**
 * backendSync.ts — 自前バックエンド (/api) との通信ラッパー（クライアント側）。
 * すべて同一オリジンの fetch。失敗時は呼び出し側（OrderBus）でローカルフォールバックする。
 */
import { API_BASE, apiHeaders } from "./dataBackend";

export interface SyncChange {
  store: string;
  id: string;
  deleted: boolean;
  data: Record<string, unknown> | null;
  /** レコード別 rev（楽観的排他用。旧サーバー応答には無い場合がある）。 */
  rev?: number;
}
export interface SyncResponse {
  rev: number;
  changes: SyncChange[];
}

/**
 * 楽観的排他の衝突（HTTP 409）。サーバーの最新レコードと rev を運ぶ。
 * 呼び出し側（OrderBus）は「サーバー最新 + 自分の変更フィールド」で再ベースして再送する。
 */
export class ConflictError extends Error {
  current: Record<string, unknown> | null;
  rev: number;
  deleted: boolean;
  constructor(current: Record<string, unknown> | null, rev: number, deleted: boolean) {
    super(`[backendSync] conflict (server rev=${rev})`);
    this.name = "ConflictError";
    this.current = current;
    this.rev = rev;
    this.deleted = deleted;
  }
}

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: apiHeaders({ "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) }),
  });
  if (!res.ok) {
    if (res.status === 409) {
      // 楽観的排他の衝突: サーバー最新レコードを typed error で返す（呼び出し側が再ベース）。
      const body = (await res.json().catch(() => null)) as { current?: Record<string, unknown> | null; rev?: number; deleted?: boolean } | null;
      throw new ConflictError(body?.current ?? null, Number(body?.rev ?? 0), Boolean(body?.deleted));
    }
    const text = await res.text().catch(() => "");
    throw new Error(`[backendSync] ${init?.method || "GET"} ${path} → ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export function apiList(store: string): Promise<Array<Record<string, unknown>>> {
  return jfetch(`/store?name=${encodeURIComponent(store)}`);
}

/**
 * レコードを upsert する。baseRev を渡すと X-Base-Rev ヘッダで楽観的排他を要求し、
 * サーバー側 rev と不一致なら ConflictError（409）になる。省略時は従来の全置換。
 */
export function apiUpsert(store: string, record: Record<string, unknown>, baseRev?: number): Promise<unknown> {
  return jfetch(`/store?name=${encodeURIComponent(store)}`, {
    method: "POST",
    body: JSON.stringify(record),
    ...(typeof baseRev === "number" && Number.isFinite(baseRev)
      ? { headers: { "X-Base-Rev": String(baseRev) } }
      : {}),
  });
}

export function apiRemove(store: string, id: string): Promise<unknown> {
  return jfetch(`/store?name=${encodeURIComponent(store)}&id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiSetAll(store: string, items: Array<Record<string, unknown>>): Promise<unknown> {
  return jfetch(`/store?name=${encodeURIComponent(store)}`, {
    method: "PUT",
    body: JSON.stringify(items),
  });
}

export function apiSync(since: number): Promise<SyncResponse> {
  return jfetch(`/sync?since=${since}`);
}
