/**
 * orderBus.ts — Cross-tab real-time sync via localStorage + BroadcastChannel
 *
 * TypeScript port of shared/order-bus.jsx.
 * All 3 apps (customer, admin, mobile) share data through XServer /api sync.
 *
 * Data stores:
 *   asahi.orders       → customer orders
 *   asahi.products     → product catalog (single source of truth)
 *   asahi.fieldReports → damage reports from mobile
 *   asahi.stockMoves   → 入庫/出庫 history
 *   (+ vehicles, maintenance, customers, suppliers, etc.)
 *
 * Usage:
 *   OrderBus.subscribe("orders", callback)  → returns unsubscribe fn
 *   OrderBus.getAll("orders")               → current array
 *   OrderBus.push("orders", item)           → add + broadcast
 *   OrderBus.patch("orders", id, updates)   → merge + broadcast
 *   OrderBus.remove("orders", id)           → delete + broadcast
 *   OrderBus.setAll("orders", items)        → replace all + broadcast
 */

import React, { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { DATA_BACKEND, SYNC_POLL_MS } from "./dataBackend";
import { apiList, apiSync, apiUpsert, apiRemove } from "./backendSync";
import { externalizeImages } from "./imageUpload";
import { byOrderDateDesc } from "../utils/orderSort";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All supported store names */
export type BusStore =
  | "orders"
  | "products"
  | "fieldReports"
  | "stockMoves"
  | "vehicles"
  | "maintenance"
  | "customers"
  | "suppliers"
  | "vendors"
  | "walkinReturns"
  | "returnInspections"
  | "stockIn"
  | "stockOut"
  | "assets"
  | "warehouse"
  | "stocktake"
  | "repairs"
  | "purchaseOrders"
  | "users";

/** Every record stored in the bus must at least have an `id` */
export interface BusRecord {
  id: string;
  firestoreId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** Callback shape for store subscriptions */
export type BusListener<T extends BusRecord = BusRecord> = (data: T[]) => void;

/** Message payload sent through BroadcastChannel */
interface BusMessage {
  store: BusStore;
  ts: number;
}

/** Admin-derived order shape */
export interface DerivedOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  subtotal: number;
  tax: number;
  items: Array<{ type?: string; [key: string]: unknown }>;
  date: string;
  customer: string;
  site: string;
  deliveryDate: string;
  deliveryLocation: string;
  rentalStart: string;
  rentalEnd: string;
  staffStatus: string;
  assignedStaff: string;
  [key: string]: unknown;
}

/** Recent transaction for admin dashboard */
export interface RecentTransaction {
  id: string;
  type: "レンタル" | "販売";
  customer: string;
  amount: number;
  date: string;
  status: string;
}

/** Return value of deriveAdminData */
export interface AdminDerivedData {
  orders: DerivedOrder[];
  rentals: DerivedOrder[];
  sales: DerivedOrder[];
  totalSales: number;
  rentalSales: number;
  productSales: number;
  recentTx: RecentTransaction[];
}

/** Shape of the OrderBus API */
export interface IOrderBus {
  /** Subscribe to a store. Returns an unsubscribe function. Fires immediately with current data. */
  subscribe<T extends BusRecord = BusRecord>(store: BusStore, callback: BusListener<T>): () => void;

  /** Read all records from a store */
  getAll<T extends BusRecord = BusRecord>(store: BusStore): T[];

  /** Push a new record. Auto-generates `id` and `createdAt` if missing. Returns the id. */
  push<T extends BusRecord = BusRecord>(store: BusStore, item: Partial<T> & Record<string, unknown>): string;

  /** Patch (merge) a record by id. Also matches on `firestoreId`. */
  patch(store: BusStore, id: string, updates: Record<string, unknown>): void;

  /** Remove a record by id. Also matches on `firestoreId`. */
  remove(store: BusStore, id: string): void;

  /** Replace the entire store contents */
  setAll<T extends BusRecord = BusRecord>(store: BusStore, items: T[]): void;

  /** Seed a store only if it is currently empty. Returns the count of seeded items. */
  seedIfEmpty<T extends BusRecord = BusRecord>(store: BusStore, items: T[]): number;

  /** Clear a store entirely */
  clear(store: BusStore): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORDER_BUS_CHANNEL = "asahi-lease-bus";

const BUS_STORES: readonly BusStore[] = [
  "orders",
  "products",
  "fieldReports",
  "stockMoves",
  "vehicles",
  "maintenance",
  "customers",
  "suppliers",
  "vendors",
  "walkinReturns",
  "returnInspections",
  "stockIn",
  "stockOut",
  "assets",
  "warehouse",
  "stocktake",
  "repairs",
  "purchaseOrders",
  "users",
] as const;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const _listeners: Record<BusStore, BusListener[]> = {} as Record<BusStore, BusListener[]>;
BUS_STORES.forEach((s) => {
  _listeners[s] = [];
});

let _bc: BroadcastChannel | null = null;
try {
  _bc = new BroadcastChannel(ORDER_BUS_CHANNEL);
} catch (e) {
  console.warn("[OrderBus] BroadcastChannel unavailable — cross-tab sync disabled.", e);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _key(store: BusStore): string {
  return "asahi." + store;
}

// メモリ上の「完全な」データ（写真・サインの base64 を含む）。
// localStorage は容量対策で base64 を間引く（=不完全）ため、クライアント内の正本はこちら。
// これがないと、ポーリングのたびに _applyRemoteChanges が間引かれたキャッシュを土台にして
// 差分の無いレコードから画像が消える（= 全サイトで写真/サインが表示されない原因）。
const _mem: Partial<Record<BusStore, BusRecord[]>> = {};

function _read<T extends BusRecord = BusRecord>(store: BusStore): T[] {
  // メモリに完全版があればそれを使う（画像が間引かれない）。
  const mem = _mem[store];
  if (mem) return mem as unknown as T[];
  // コールドスタート時のみ localStorage から読み込む（起動直後の即時表示用ブートストラップ）。
  try {
    const raw = localStorage.getItem(_key(store));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`[OrderBus] Store "${store}" contained non-array data; returning empty.`);
      return [];
    }
    return parsed.filter(Boolean) as T[];
  } catch {
    console.warn(`[OrderBus] Failed to parse store "${store}"; returning empty.`);
    return [];
  }
}

// 直近に書き込んだ各ストアの直列化文字列（重複通知=無限ループ防止用）。
// localStorage の読み戻しに依存しないので、容量超過でキャッシュが失敗しても
// 重複判定が壊れない。
const _lastSerialized: Partial<Record<BusStore, string>> = {};

// localStorage キャッシュ用に「重い base64（写真・サイン等の data: URL）」を間引く replacer。
// サーバー(MySQL)が正本なので、再起動後はポーリングで画像を取り直せる。キャッシュは構造データ優先。
function _slimReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "string" && value.length > 256 && value.startsWith("data:")) {
    return undefined;
  }
  return value;
}

function _write<T extends BusRecord = BusRecord>(store: BusStore, data: T[]): void {
  // クライアント内の正本（完全版）はメモリに保持する。以降の _read / _applyRemoteChanges は
  // ここを土台にするので、localStorage が間引かれても画像/サインは失われない。
  _mem[store] = data as unknown as BusRecord[];

  const next = JSON.stringify(data);
  const changed = _lastSerialized[store] !== next;
  _lastSerialized[store] = next;

  // 永続化はベストエフォート。容量超過なら重い base64 を除いた軽量版で再試行する。
  // 失敗しても下の通知は必ず行う（=メモリ上の最新データを UI へ届け、同期を止めない）。
  try {
    localStorage.setItem(_key(store), next);
  } catch {
    // フル書き込みが失敗した時点でキャッシュは不完全（画像が間引かれる or 書けない）。
    // 次回起動時にサーバーからフル再同期して画像を復元するためフラグを立てる。
    try { localStorage.setItem(_SLIM_KEY, "1"); } catch { /* ignore */ }
    try {
      localStorage.setItem(_key(store), JSON.stringify(data, _slimReplacer));
    } catch (e2) {
      console.warn(`[OrderBus] localStorage 容量超過のため "${store}" のキャッシュをスキップ（同期は継続）。`, e2);
    }
  }

  // データに変化が無ければ通知・ブロードキャストをスキップする。
  // （購読コールバック内で同じ配列を setAll し直すケースの無限ループを防ぐ）
  if (!changed) {
    return;
  }
  _notify(store, data);
  if (_bc) {
    try {
      _bc.postMessage({ store, ts: Date.now() } satisfies BusMessage);
    } catch (e) {
      console.warn("[OrderBus] Failed to broadcast message.", e);
    }
  }
}

function _notify<T extends BusRecord = BusRecord>(store: BusStore, data: T[]): void {
  const listeners = _listeners[store];
  if (!listeners) return;
  for (const fn of listeners) {
    try {
      fn(data as BusRecord[]);
    } catch (e) {
      console.error(`[OrderBus] Listener error on store "${store}":`, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-tab listeners
// ---------------------------------------------------------------------------

/** Listen for changes from other tabs via BroadcastChannel */
if (_bc) {
  _bc.onmessage = (ev: MessageEvent<BusMessage>) => {
    const { store } = ev.data ?? {};
    if (store && _listeners[store]) {
      const data = _read(store);
      _notify(store, data);
    }
  };
}

/** Fallback: listen for localStorage storage events (fires in other tabs only) */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (ev: StorageEvent) => {
    const store = BUS_STORES.find((s) => ev.key === _key(s));
    if (store) {
      const data = _read(store);
      _notify(store, data);
    }
  });
}

// ---------------------------------------------------------------------------
// Generate unique ID
// ---------------------------------------------------------------------------

function _generateId(): string {
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------------
// XServer backend sync (polling)  —  DATA_BACKEND === "api"
//   /api/sync で差分(rev)をポーリングし、全クライアントへ反映する。
//   書き込みは push/patch/remove/setAll から /api/store へ write-through。
//   _applyingRemote の間はリモート反映中なので書き戻さない（ループ防止）。
// ---------------------------------------------------------------------------

let _applyingRemote = false;
let _apiPollerStarted = false;
let _firstPoll = false;
let _lastRev = 0;
const _REV_KEY = "asahi._rev";
const _SYNCED_KEY = "asahi._synced_v1";
// 容量超過でローカルキャッシュから base64（写真・サイン）を間引いた場合に立てるフラグ。
// 次回起動時、増分同期では間引かれた画像が戻らない（サーバーの rev は進んでいないため）ので、
// このフラグがあれば rev=0 でフル再同期し、サーバーから完全なレコード（画像つき）を取り直す。
const _SLIM_KEY = "asahi._cache_slimmed_v1";

function _applyRemoteChanges(store: BusStore, changes: Array<{ id: string; deleted: boolean; data: BusRecord | null }>): void {
  const cur = _read(store);
  const map = new Map<string, BusRecord>(cur.map((r) => [String(r.id), r]));
  for (const ch of changes) {
    if (ch.deleted) map.delete(String(ch.id));
    else if (ch.data) map.set(String(ch.id), ch.data);
  }
  const merged = Array.from(map.values());
  merged.sort((a: any, b: any) => {
    if (typeof a.seq === "number" && typeof b.seq === "number") return b.seq - a.seq;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ta && tb) return tb - ta;
    return 0;
  });
  _write(store, merged);
}

async function _reloadAuthoritativeSnapshot(): Promise<number> {
  let maxRev = 0;
  _applyingRemote = true;
  try {
    for (const store of BUS_STORES) {
      const rows = await apiList(store);
      _write(store, rows as BusRecord[]);
    }
    const fresh = await apiSync(0);
    if (fresh && typeof fresh.rev === "number") {
      maxRev = fresh.rev;
    }
  } finally {
    _applyingRemote = false;
  }
  _firstPoll = false;
  try { localStorage.setItem(_SYNCED_KEY, "1"); } catch { /* ignore */ }
  try { localStorage.setItem(_REV_KEY, String(maxRev)); } catch { /* ignore */ }
  return maxRev;
}

async function _apiTick(): Promise<void> {
  try {
    const res = await apiSync(_lastRev);
    if (res && typeof res.rev === "number" && res.rev < _lastRev) {
      _lastRev = await _reloadAuthoritativeSnapshot();
      return;
    }
    if (res && Array.isArray(res.changes)) {
      const byStore: Record<string, Array<{ id: string; deleted: boolean; data: BusRecord | null }>> = {};
      for (const ch of res.changes) {
        (byStore[ch.store] ||= []).push({ id: ch.id, deleted: ch.deleted, data: ch.data as BusRecord | null });
      }
      _applyingRemote = true;
      try {
        for (const store of Object.keys(byStore)) {
          _applyRemoteChanges(store as BusStore, byStore[store]);
        }
      } finally {
        _applyingRemote = false;
      }

      // 初回同期: サーバーが唯一の正。クライアントのローカル（seed/デモ）を一括アップロード
      // しない（以前はこれでデモアカウント等が共有サーバーへ再注入されていた）。
      // ユーザーが実際に作成・編集したレコードのみ push/patch/setAll 経由で個別に同期される。
      if (_firstPoll) {
        _firstPoll = false;
        try { localStorage.setItem(_SYNCED_KEY, "1"); } catch { /* ignore */ }
      }
    }
    if (res && typeof res.rev === "number" && res.rev >= _lastRev) {
      _lastRev = res.rev;
      try { localStorage.setItem(_REV_KEY, String(_lastRev)); } catch { /* ignore */ }
    }
  } catch {
    // サーバー未起動 / オフライン → ローカルのみで継続（次回再試行）。
  } finally {
    setTimeout(() => { void _apiTick(); }, SYNC_POLL_MS);
  }
}

function _startApiPoller(): void {
  if (_apiPollerStarted || DATA_BACKEND !== "api") return;
  _apiPollerStarted = true;
  let established = false;
  try { established = localStorage.getItem(_SYNCED_KEY) === "1"; } catch { /* ignore */ }
  let cacheSlimmed = false;
  try { cacheSlimmed = localStorage.getItem(_SLIM_KEY) === "1"; } catch { /* ignore */ }

  if (established && !cacheSlimmed) {
    try { _lastRev = Number(localStorage.getItem(_REV_KEY) || "0") || 0; } catch { _lastRev = 0; }
    _firstPoll = false;
  } else if (established && cacheSlimmed) {
    // 前回、容量超過でキャッシュから画像/サインを間引いている。
    // 増分同期（保存済み rev 以降）では戻らないので、rev=0 でフル再同期し
    // サーバーから完全なレコード（画像つき）を取り直す。
    _lastRev = 0;
    _firstPoll = false;
  } else {
    _lastRev = 0; // 初回はフル同期（since=0）でサーバー全件を取得しローカルとマージ
    _firstPoll = true;
  }
  void _apiTick();
}

/**
 * レコード内の base64 画像をサーバーにアップロードして URL 化し、
 * ローカル（メモリ/キャッシュ）も URL 版に置換してから /api へ upsert する。
 * これにより base64 がレコードに残らず、容量・同期・再起動消失の問題を根絶する。
 * 画像が無いレコードは即 upsert（高速パス）。
 */
async function _upsertExternalized(store: BusStore, recordId: string): Promise<void> {
  let data = _read(store);
  let idx = data.findIndex((r) => String(r.id) === String(recordId));
  if (idx < 0) return;
  const original = data[idx];

  let ext: BusRecord = original;
  try {
    ext = await externalizeImages(original);
  } catch {
    ext = original;
  }

  // 画像をアップロードして URL 化した場合のみローカルを書き換える。
  if (ext !== original) {
    data = _read(store);
    idx = data.findIndex((r) => String(r.id) === String(recordId));
    if (idx >= 0) {
      data[idx] = ext;
      _write(store, data);
    }
  }

  apiUpsert(store, ext as any).catch((e) =>
    console.warn(`[OrderBus] backend upsert failed "${store}/${recordId}":`, e)
  );
}

// ---------------------------------------------------------------------------
// OrderBus singleton
// ---------------------------------------------------------------------------

export const OrderBus: IOrderBus = {
  subscribe<T extends BusRecord = BusRecord>(store: BusStore, callback: BusListener<T>): () => void {
    if (!_listeners[store]) {
      console.warn(`[OrderBus] Unknown store "${store}" — creating listener array.`);
      _listeners[store] = [];
    }
    const wrappedCallback = callback as BusListener;
    _listeners[store].push(wrappedCallback);

    // XServer バックエンド使用時はポーリング同期を開始（全ストア共通、1回だけ）。
    _startApiPoller();

    // Immediately fire with current data
    try {
      callback(_read<T>(store));
    } catch (e) {
      console.warn(`[OrderBus] subscribe initial fire error for "${store}":`, e);
    }

    // クラウド同期は XServer(MySQL) の /api ポーリング（_startApiPoller）のみ。

    // Return unsubscribe function
    return () => {
      _listeners[store] = (_listeners[store] || []).filter((fn) => fn !== wrappedCallback);
    };
  },

  getAll<T extends BusRecord = BusRecord>(store: BusStore): T[] {
    return _read<T>(store);
  },

  push<T extends BusRecord = BusRecord>(store: BusStore, item: Partial<T> & Record<string, unknown>): string {
    const data = _read<T>(store);
    const record = { ...item } as T & BusRecord;

    if (!record.id) {
      record.id = _generateId();
    }
    if (!record.createdAt) {
      record.createdAt = new Date().toISOString();
    }

    // Prepend (newest first)
    data.unshift(record);
    _write(store, data);

    if (DATA_BACKEND === "api" && !_applyingRemote) {
      void _upsertExternalized(store, String(record.id));
    }

    return record.id;
  },

  patch(store: BusStore, id: string, updates: Record<string, unknown>): void {
    const data = _read(store);
    const idx = data.findIndex((d) => d.id === id || d.firestoreId === id);
    if (idx >= 0) {
      const targetId = data[idx].id;
      const firestoreId = data[idx].firestoreId;
      const targetDocId = (firestoreId || targetId) as string;

      data[idx] = {
        ...data[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      _write(store, data);

      if (DATA_BACKEND === "api" && !_applyingRemote) {
        // マージ後のレコード全体を upsert（base64 画像はアップロードして URL 化）。
        void _upsertExternalized(store, String(targetId));
      }
    } else {
      console.warn(`[OrderBus] patch: record with id "${id}" not found in store "${store}".`);
    }
  },

  remove(store: BusStore, id: string): void {
    const data = _read(store);
    const item = data.find((d) => d.id === id || d.firestoreId === id);
    if (item) {
      const targetId = item.id;
      const firestoreId = item.firestoreId;
      const targetDocId = (firestoreId || targetId) as string;

      const filtered = data.filter((d) => d.id !== id && d.firestoreId !== id);
      _write(store, filtered);

      if (DATA_BACKEND === "api" && !_applyingRemote) {
        apiRemove(store, String(targetId)).catch((e) =>
          console.warn(`[OrderBus] backend remove failed "${store}/${targetId}":`, e)
        );
      }
    } else {
      console.warn(`[OrderBus] remove: record with id "${id}" not found in store "${store}".`);
    }
  },

  setAll<T extends BusRecord = BusRecord>(store: BusStore, items: T[]): void {
    const prev = JSON.stringify(_read(store));
    const next = JSON.stringify(items);
    _write(store, items);

    // XServer(API) バックエンド: orders は push/patch で個別反映するため除外（setAll は AdminDataContext のミラー）。
    // ★ 重要: setAll は「全置換」ではなく差分のみ送る。
    // 全置換にすると、他クライアントが追加したばかりのレコードを
    // （こちらのリストに無いという理由で）削除してしまう（マルチクライアントで破壊的）。
    // そのため「このクライアントが前回から実際に変更/削除した分」だけを反映する。
    if (DATA_BACKEND === "api" && store !== "orders" && !_applyingRemote && prev !== next) {
      try {
        const prevArr: BusRecord[] = prev ? JSON.parse(prev) : [];
        const prevJsonById = new Map<string, string>(
          prevArr.filter((r) => r && r.id != null).map((r) => [String(r.id), JSON.stringify(r)])
        );
        const nextIds = new Set(items.filter((r) => r && r.id != null).map((r) => String(r.id)));
        // 追加・変更されたレコードのみ upsert
        for (const r of items) {
          if (!r || r.id == null) continue;
          const k = String(r.id);
          if (prevJsonById.get(k) !== JSON.stringify(r)) {
            void _upsertExternalized(store, k);
          }
        }
        // このクライアントが削除した id のみ remove（サーバー側の未知レコードは消さない）
        for (const r of prevArr) {
          if (r && r.id != null && !nextIds.has(String(r.id))) {
            apiRemove(store, String(r.id)).catch((e) =>
              console.warn(`[OrderBus] backend setAll-remove failed "${store}/${r.id}":`, e)
            );
          }
        }
      } catch (e) {
        console.warn(`[OrderBus] backend setAll diff failed "${store}":`, e);
      }
    }
  },

  seedIfEmpty<T extends BusRecord = BusRecord>(store: BusStore, items: T[]): number {
    // クラウド運用（api）ではサーバーが唯一の正。デモ/初期データをローカルへ seed しない。
    // （seed すると初回ポーリングのマージ後もローカルに残り、admin にデモアカウント等が再表示され、
    //   さらに以前は first-poll で共有サーバーへ再アップロードされてしまっていた。）
    // 真にサーバーが空の初回デプロイ時のみ admin の seedAll で投入する想定。
    if (DATA_BACKEND === "api") return 0;
    const existing = _read(store);
    if (existing.length === 0 && items && items.length > 0) {
      _write(store, items);
      return items.length;
    }
    return 0;
  },

  clear(store: BusStore): void {
    try {
      localStorage.removeItem(_key(store));
    } catch (e) {
      console.error(`[OrderBus] Failed to clear store "${store}":`, e);
    }
    _notify(store, []);
  },
};

// ---------------------------------------------------------------------------
// deriveAdminData — compute admin dashboard KPIs from raw orders
// ---------------------------------------------------------------------------

export function deriveAdminData(rawOrders: BusRecord[]): AdminDerivedData {
  const orders: DerivedOrder[] = rawOrders.map((o) => {
    const personLastName = (o.personLastName as string) || "";
    const personFirstName = (o.personFirstName as string) || "";
    const fullName = (personLastName + " " + personFirstName).trim();

    return {
      ...o,
      id: (o.id || o.firestoreId || "") as string,
      orderNumber: (o.orderNumber as string) || "—",
      status: (o.status as string) || "処理中",
      total: (o.total as number) || 0,
      subtotal: (o.subtotal as number) || 0,
      tax: (o.tax as number) || 0,
      items: (o.items as Array<{ type?: string; [key: string]: unknown }>) || [],
      date: (o.date as string) || "",
      customer:
        (o.companyName as string) ||
        fullName ||
        (o.personName as string) ||
        "ゲスト",
      site: (o.siteName as string) || "—",
      deliveryDate: (o.deliveryDate as string) || "",
      deliveryLocation: (o.deliveryLocation as string) || "",
      rentalStart: (o.rentalStartDate as string) || "",
      rentalEnd: (o.rentalEndDate as string) || "",
      staffStatus: (o.staffStatus as string) || "未割当",
      assignedStaff: (o.assignedStaff as string) || "",
    };
  });

  // 新しい注文が先（顧客サイトと一貫）。rentals/sales/recentTx すべてこの順を継承する。
  orders.sort(byOrderDateDesc);

  const rentals = orders.filter((o) =>
    o.items.some((i) => i.type === "rent")
  );
  const sales = orders.filter((o) =>
    o.items.some((i) => i.type === "buy")
  );

  let rentalSales = 0;
  let productSales = 0;

  orders.forEach((o) => {
    let orderRentSub = 0;
    let orderBuySub = 0;
    o.items?.forEach((item) => {
      const itemType = (item.type || item.kind) as string;
      const itemQty = (item.quantity || 1) as number;
      const itemRentPrice = (item.rentPrice || 0) as number;
      const itemBuyPrice = (item.buyPrice || 0) as number;
      const itemCalculated = (item.calculatedPrice) as number | undefined;

      const itemVal = itemCalculated || (itemType === "rent" ? itemRentPrice * itemQty : itemBuyPrice * itemQty);
      if (itemType === "rent") {
        orderRentSub += itemVal;
      } else {
        orderBuySub += itemVal;
      }
    });

    const orderSub = orderRentSub + orderBuySub;
    if (orderSub > 0) {
      rentalSales += (orderRentSub / orderSub) * (o.total || 0);
      productSales += (orderBuySub / orderSub) * (o.total || 0);
    } else {
      const hasRent = o.items?.some((i) => i.type === "rent");
      if (hasRent) {
        rentalSales += o.total || 0;
      } else {
        productSales += o.total || 0;
      }
    }
  });

  rentalSales = Math.round(rentalSales);
  productSales = Math.round(productSales);
  const totalSales = rentalSales + productSales;

  const recentTx: RecentTransaction[] = orders.slice(0, 10).map((o) => {
    const isRental = o.items.some((i) => i.type === "rent");

    let statusLabel: string;
    switch (o.status) {
      case "処理中":
        statusLabel = "進行中";
        break;
      case "完了":
      case "配送済み":
        statusLabel = "完了";
        break;
      default:
        statusLabel = o.status;
    }

    return {
      id: o.orderNumber,
      type: isRental ? "レンタル" : "販売",
      customer: o.customer,
      amount: o.total,
      date: typeof o.date === "string" ? o.date.split("•")[0]?.trim() ?? "" : "",
      status: statusLabel,
    };
  });

  return { orders, rentals, sales, totalSales, rentalSales, productSales, recentTx };
}

// ---------------------------------------------------------------------------
// React Context — OrderBusProvider
// ---------------------------------------------------------------------------

const OrderBusContext = createContext<IOrderBus | null>(null);

export interface OrderBusProviderProps {
  children: ReactNode;
}

/**
 * Provides the OrderBus singleton via React context.
 * Wrap your app (or a subtree) in `<OrderBusProvider>` and consume with `useOrderBus()`.
 */
export function OrderBusProvider({ children }: OrderBusProviderProps): React.ReactElement {
  // The bus is a module-level singleton, so no initialization needed.
  // The provider simply makes it available via context for convenience.
  return React.createElement(OrderBusContext.Provider, { value: OrderBus }, children);
}

/**
 * Access the OrderBus singleton via React context.
 * Must be called inside an `<OrderBusProvider>`.
 */
export function useOrderBus(): IOrderBus {
  const bus = useContext(OrderBusContext);
  if (!bus) {
    throw new Error(
      "[useOrderBus] OrderBusProvider が見つかりません。コンポーネントを <OrderBusProvider> でラップしてください。"
    );
  }
  return bus;
}

// ---------------------------------------------------------------------------
// Expose on window for debugging (development only)
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).OrderBus = OrderBus;
  (window as unknown as Record<string, unknown>).deriveAdminData = deriveAdminData;
}

export default OrderBus;
