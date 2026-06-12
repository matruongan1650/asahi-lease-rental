/**
 * firebase.ts — 旧 Firebase 互換レイヤー（Firebase は廃止済み）。
 *
 * 注文の作成・更新・購読はすべて OrderBus 経由で行い、
 * クラウド同期は XServer(MySQL) の /api ポーリング（dataBackend "api"）が担う。
 * 既存の呼び出し側（OrderContext / AdminDataContext / MobileLiveContext）の
 * インターフェースを壊さないため、ファイル名と関数シグネチャを維持している。
 */
import OrderBus from "./orderBus";

/** Firebase は廃止。常に false。 */
export const FIREBASE_ENABLED = false;

/**
 * 注文の新規作成。
 * OrderBus への登録（とサーバーへの upsert）は呼び出し側 (OrderContext) が
 * OrderBus.push で行うため、ここでは ID を返すだけにして二重登録を防ぐ。
 */
export async function pushOrder(order: Record<string, unknown>): Promise<string> {
  return (order?.id as string) || "";
}

/** 注文の部分更新（OrderBus → /api → 全端末へ同期）。 */
export async function patchOrder(id: string, updates: Record<string, unknown>): Promise<void> {
  OrderBus.patch("orders", id, updates);
}

/** 注文の購読。即時に現在のデータでコールバックされ、変更時にも通知される。 */
export function subscribeOrders(
  callback: (orders: Array<Record<string, unknown>>) => void
): () => void {
  return OrderBus.subscribe("orders", callback as any);
}
