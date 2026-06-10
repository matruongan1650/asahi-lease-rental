/**
 * backendSync.ts — 自前バックエンド (/api) との通信ラッパー（クライアント側）。
 * すべて同一オリジンの fetch。失敗時は呼び出し側（OrderBus）でローカルフォールバックする。
 */
import { API_BASE } from "./dataBackend";

export interface SyncChange {
  store: string;
  id: string;
  deleted: boolean;
  data: Record<string, unknown> | null;
}
export interface SyncResponse {
  rev: number;
  changes: SyncChange[];
}

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[backendSync] ${init?.method || "GET"} ${path} → ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export function apiList(store: string): Promise<Array<Record<string, unknown>>> {
  return jfetch(`/store?name=${encodeURIComponent(store)}`);
}

export function apiUpsert(store: string, record: Record<string, unknown>): Promise<unknown> {
  return jfetch(`/store?name=${encodeURIComponent(store)}`, {
    method: "POST",
    body: JSON.stringify(record),
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
