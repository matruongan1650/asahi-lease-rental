/**
 * orderBus.ts — Cross-tab real-time sync via localStorage + BroadcastChannel
 *
 * TypeScript port of shared/order-bus.jsx.
 * Replaces Firebase for local development. All 3 apps (customer, admin, mobile) share data.
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
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch
} from "firebase/firestore";
import { db, FIREBASE_ENABLED } from "./firebaseInit";
import { DATA_BACKEND, SYNC_POLL_MS } from "./dataBackend";
import { apiSync, apiUpsert, apiRemove } from "./backendSync";


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

const _firestoreUnsubs: Record<string, () => void> = {};

function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => removeUndefined(v)).filter(v => v !== undefined);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}


// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _key(store: BusStore): string {
  return "asahi." + store;
}

function _read<T extends BusRecord = BusRecord>(store: BusStore): T[] {
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

function _write<T extends BusRecord = BusRecord>(store: BusStore, data: T[]): void {
  const next = JSON.stringify(data);
  let prev: string | null = null;
  try {
    prev = localStorage.getItem(_key(store));
  } catch {
    // ignore read error
  }
  try {
    localStorage.setItem(_key(store), next);
  } catch (e) {
    console.error(`[OrderBus] Failed to write store "${store}" to localStorage.`, e);
    return;
  }
  // データに変化が無ければ通知・ブロードキャストをスキップする。
  // （購読コールバック内で同じ配列を setAll し直すケースの無限ループを防ぐ）
  if (prev === next) {
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
// Vercel backend sync (polling)  —  DATA_BACKEND === "api"
//   /api/sync で差分(rev)をポーリングし、全クライアントへ反映する。
//   書き込みは push/patch/remove/setAll から /api/store へ write-through。
//   _applyingRemote の間はリモート反映中なので書き戻さない（ループ防止）。
// ---------------------------------------------------------------------------

let _applyingRemote = false;
let _vercelPollerStarted = false;
let _firstPoll = false;
let _lastRev = 0;
const _REV_KEY = "asahi._rev";
const _SYNCED_KEY = "asahi._synced_v1";

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

async function _vercelTick(): Promise<void> {
  try {
    const res = await apiSync(_lastRev);
    if (res && Array.isArray(res.changes)) {
      const byStore: Record<string, Array<{ id: string; deleted: boolean; data: BusRecord | null }>> = {};
      const serverIds: Record<string, Set<string>> = {};
      for (const ch of res.changes) {
        (byStore[ch.store] ||= []).push({ id: ch.id, deleted: ch.deleted, data: ch.data as BusRecord | null });
        (serverIds[ch.store] ||= new Set()).add(String(ch.id));
      }
      _applyingRemote = true;
      try {
        for (const store of Object.keys(byStore)) {
          _applyRemoteChanges(store as BusStore, byStore[store]);
        }
      } finally {
        _applyingRemote = false;
      }

      // 初回同期: サーバーに無いローカル限定レコードをアップロードして「以前のローカルデータ」を保持。
      if (_firstPoll) {
        _firstPoll = false;
        for (const store of BUS_STORES) {
          if (store === "orders") continue; // orders は push/patch で個別反映
          const local = _read(store);
          const ids = serverIds[store] || new Set<string>();
          for (const r of local) {
            if (r && r.id !== undefined && r.id !== null && !ids.has(String(r.id))) {
              apiUpsert(store, r as any).catch(() => {});
            }
          }
        }
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
    setTimeout(() => { void _vercelTick(); }, SYNC_POLL_MS);
  }
}

function _startVercelPoller(): void {
  if (_vercelPollerStarted || DATA_BACKEND !== "api") return;
  _vercelPollerStarted = true;
  let established = false;
  try { established = localStorage.getItem(_SYNCED_KEY) === "1"; } catch { /* ignore */ }
  if (established) {
    try { _lastRev = Number(localStorage.getItem(_REV_KEY) || "0") || 0; } catch { _lastRev = 0; }
    _firstPoll = false;
  } else {
    _lastRev = 0; // 初回はフル同期（since=0）でサーバー全件を取得しローカルとマージ
    _firstPoll = true;
  }
  void _vercelTick();
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

    // Vercel バックエンド使用時はポーリング同期を開始（全ストア共通、1回だけ）。
    _startVercelPoller();

    // Immediately fire with current data
    try {
      callback(_read<T>(store));
    } catch (e) {
      console.warn(`[OrderBus] subscribe initial fire error for "${store}":`, e);
    }

    // "orders" は firebase.ts (subscribeOrders) が Firestore を直接購読するため、
    // OrderBus 側で二重に onSnapshot を張らない（重複・齟齬を防ぐ）。
    if (FIREBASE_ENABLED && store !== "orders") {
      if (!_firestoreUnsubs[store]) {
        console.log(`[OrderBus] Starting Firestore subscription for collection "${store}"`);
        const colRef = collection(db, store);
        let _firstSnap = true;
        const unsubSnap = onSnapshot(colRef, (snap) => {
          let items = snap.docs.map(doc => {
            const docData = doc.data();
            return {
              id: doc.id,
              ...docData
            };
          }) as BusRecord[];

          // 初回スナップショット: 既存のローカルデータを保持する。
          // Firestore に存在しないローカル限定レコードをクラウドへアップロードしてマージし、
          // remote による上書きでローカルデータが消えないようにする。
          if (_firstSnap) {
            _firstSnap = false;
            try {
              const localData = _read(store);
              const remoteIds = new Set(items.map((i) => String(i.id)));
              const localOnly = localData.filter(
                (l) => l && (l.id !== undefined && l.id !== null) && !remoteIds.has(String(l.id))
              );
              if (localOnly.length > 0) {
                items = [...items, ...localOnly];
                const batch = writeBatch(db);
                localOnly.forEach((l) => {
                  batch.set(doc(db, store, String(l.id)), removeUndefined(l));
                });
                batch
                  .commit()
                  .then(() =>
                    console.log(`[OrderBus] preserved ${localOnly.length} local record(s) → uploaded to "${store}"`)
                  )
                  .catch((err) =>
                    console.error(`[OrderBus] failed to upload local records to "${store}":`, err)
                  );
              }
            } catch (e) {
              console.warn(`[OrderBus] first-snapshot local merge failed for "${store}":`, e);
            }
          }

          // Sort items consistently
          items.sort((a: any, b: any) => {
            if (a.seq !== undefined && b.seq !== undefined) {
              return b.seq - a.seq;
            }
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (timeA && timeB) {
              return timeB - timeA;
            }
            return 0;
          });

          // Update local storage cache safely (avoid loop updates by bypassing OrderBus.setAll)
          try {
            localStorage.setItem(_key(store), JSON.stringify(items));
          } catch (e) {
            console.warn(`[OrderBus] Failed to cache Firestore data for "${store}" in localStorage:`, e);
          }

          // Notify all listeners
          _notify(store, items);
        }, (err) => {
          console.error(`[OrderBus] Firestore subscription error for "${store}":`, err);
        });

        _firestoreUnsubs[store] = unsubSnap;
      }
    }

    // Return unsubscribe function
    return () => {
      _listeners[store] = (_listeners[store] || []).filter((fn) => fn !== wrappedCallback);

      // Firestore の onSnapshot は意図的に張りっぱなしにする（アプリ生存中は 1 ストア 1 リスナー）。
      // コンポーネントの再マウント（React StrictMode の二重マウント等）ごとに listener を
      // 貼り直すと、その都度コレクション全件が再読込され Firestore の読み取りクォータを
      // 大量に消費する（RESOURCE_EXHAUSTED / 429 の原因）。そのため listener は破棄しない。
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

    // "orders" の新規作成は firebase.ts の pushOrder（addDoc）が担当するため、
    // ここで setDoc すると同じ注文が二重に Firestore へ登録される。スキップする。
    if (FIREBASE_ENABLED && store !== "orders") {
      const docRef = doc(db, store, record.id);
      setDoc(docRef, removeUndefined(record)).catch(err => {
        console.error(`[OrderBus] push failed for "${store}/${record.id}":`, err);
      });
    }

    if (DATA_BACKEND === "api" && !_applyingRemote) {
      apiUpsert(store, record as any).catch((e) =>
        console.warn(`[OrderBus] backend push failed "${store}/${record.id}":`, e)
      );
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

      if (FIREBASE_ENABLED) {
        const docRef = doc(db, store, targetDocId);
        updateDoc(docRef, removeUndefined({
          ...updates,
          updatedAt: new Date().toISOString()
        })).catch(err => {
          console.error(`[OrderBus] patch failed for "${store}/${targetDocId}":`, err);
        });
      }

      if (DATA_BACKEND === "api" && !_applyingRemote) {
        // マージ後のレコード全体を upsert（バックエンドは id ベースの upsert）。
        apiUpsert(store, data[idx] as any).catch((e) =>
          console.warn(`[OrderBus] backend patch failed "${store}/${targetId}":`, e)
        );
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

      if (FIREBASE_ENABLED) {
        const docRef = doc(db, store, targetDocId);
        deleteDoc(docRef).catch(err => {
          console.error(`[OrderBus] remove failed for "${store}/${targetDocId}":`, err);
        });
      }

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

    // "orders" の setAll は AdminDataContext が Firestore→ローカルへミラーする用途。
    // ここで Firestore へ書き戻すと、auto-id と業務 id の不一致で既存 doc を破壊するためスキップ。
    if (FIREBASE_ENABLED && store !== "orders" && prev !== next) {
      const syncSetAll = async () => {
        try {
          const colRef = collection(db, store);
          const snap = await getDocs(colRef);
          const existingDocIds = snap.docs.map(d => d.id);
          const newIds = new Set(items.map(item => item.id));

          const batch = writeBatch(db);
          // Delete docs not in the new list
          existingDocIds.forEach(docId => {
            if (!newIds.has(docId)) {
              batch.delete(doc(db, store, docId));
            }
          });
          // Set/update docs in the new list
          items.forEach(item => {
            batch.set(doc(db, store, item.id), removeUndefined(item));
          });
          await batch.commit();
          console.log(`[OrderBus] setAll synchronized ${items.length} items to "${store}"`);
        } catch (err) {
          console.error(`[OrderBus] setAll Firestore sync failed for "${store}":`, err);
        }
      };
      syncSetAll();
    }

    // Vercel バックエンド: orders は push/patch で個別反映するため除外（setAll は AdminDataContext のミラー）。
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
            apiUpsert(store, r as any).catch((e) =>
              console.warn(`[OrderBus] backend setAll-upsert failed "${store}/${k}":`, e)
            );
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
    const existing = _read(store);
    if (existing.length === 0 && items && items.length > 0) {
      _write(store, items);

      if (FIREBASE_ENABLED) {
        const batch = writeBatch(db);
        items.forEach(item => {
          batch.set(doc(db, store, item.id), removeUndefined(item));
        });
        batch.commit()
          .then(() => console.log(`[OrderBus] seedIfEmpty seeded ${items.length} documents to "${store}"`))
          .catch(err => {
            console.error(`[OrderBus] seedIfEmpty failed to commit batch for "${store}":`, err);
          });
      }
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
