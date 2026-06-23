/**
 * stockLedger.ts — 現物在庫（products.stock）の台帳同期ヘルパー。
 *
 * 在庫モデルは「台帳（ledger）」: products.stock = 現物在庫。
 *   受注確定 → 出庫（減算 + stockOut 伝票）/ 倉庫最終検品 → 入庫（加算 + stockIn 伝票）。
 *
 * ★ 在庫が動くタイミング（業務要件）:
 *   1. 受注確定（admin が「受注確定」ボタン）→ deductOrderStock で現物在庫を減算。
 *   2. 回収 → 倉庫の「最終検品」完了 → restoreOrderStock で良品分のみ加算。
 *      （回収完了だけでは戻さない。必ず最終検品を経てから入庫する。）
 *
 * 出庫/入庫はどちらも「出庫管理 / 入庫管理」に伝票（stockOut / stockIn）として残す。
 * 二重計上は注文上のフラグ `stockDeducted`（出庫済み）と `stockRestored`（入庫済み）で防ぐ。
 * 旧データ互換: 旧モデルでは納品時に減算していたため、戻し判定では deliveryConfirmedAt も出庫済みとみなす。
 */
import OrderBus from "../lib/orderBus";
import { isClosedOrder } from "./orderStatus";

// 同一ミリ秒内の連続 push でも ID が衝突しないための単調増加カウンタ。
let ledgerSeq = 0;
function nextSeq(): number {
  ledgerSeq += 1;
  return new Date().getTime() * 1000 + (ledgerSeq % 1000);
}

/** 伝票日時 "YYYY/MM/DD HH:MM"（ローカル時刻）。出庫管理 / 入庫管理の表示形式に合わせる。 */
function stampDate(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}/${p(now.getMonth() + 1)}/${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

/** 現物在庫を増減（products.stock）。商品は id・名称どちらでも特定する。見つかった商品を返す。 */
export function adjustProductStock(productId: string, productName: string, delta: number): any | null {
  if (!delta) return null;
  const list = OrderBus.getAll<any>("products");
  const p = list.find((x: any) => x && (x.id === productId || x.name === productName));
  if (p) {
    OrderBus.patch("products", p.id, { stock: Math.max(0, Number(p.stock || 0) + delta) });
    return p;
  }
  return null;
}

/** itemIssues 配列 → 商品ID別の「在庫に戻さない数量」（紛失・破損）。 */
function issuesByItemId(itemIssues: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  (itemIssues || []).forEach((iss: any) => {
    const id = String(iss?.itemId || "");
    if (id) map[id] = (map[id] || 0) + Number(iss?.quantity || 0);
  });
  return map;
}

/** 出庫済みかどうか（新フラグ stockDeducted、旧データは deliveryConfirmedAt で判定）。 */
function wasDeducted(order: any): boolean {
  return Boolean(order?.stockDeducted || order?.deliveryConfirmedAt);
}

/** OrderBus 上の最新の注文を解決（連打・多端末での二重計上を防ぐためライブのフラグを見る）。 */
function resolveLiveOrder(order: any): any | null {
  const id = String(order?.firestoreId || order?.id || "");
  const num = String(order?.orderNumber || "");
  if (!id && !num) return null;
  const list = OrderBus.getAll<any>("orders");
  return list.find((o: any) => o && (o.id === id || o.firestoreId === id || (num && o.orderNumber === num))) || null;
}

/**
 * 受注確定時の出庫（現物在庫の減算 + stockOut 伝票）。冪等。
 * - 既に出庫済み（stockDeducted / deliveryConfirmedAt）なら何もしない（二重減算防止）。
 * - レンタル品・販売品の両方を減算する。車両など products に無い品目はスキップ（別管理）。
 * 呼び出し側は返り値のフラグを注文へマージすること。
 */
export function deductOrderStock(order: any): { stockDeducted?: boolean; stockDeductedAt?: string } {
  if (!order) return {};
  // ライブの注文でガード（連打・多端末での二重減算防止）。passed order は未保存の場合あり。
  const live = resolveLiveOrder(order);
  if (wasDeducted(live || order)) return {}; // 既に出庫済み
  const at = new Date().toISOString();
  // 先にフラグを同期反映 → 直後の再呼び出し（連打）はガードで弾かれる。
  if (live) OrderBus.patch("orders", String(live.firestoreId || live.id), { stockDeducted: true, stockDeductedAt: at });
  const items = Array.isArray(order.items) ? order.items : (Array.isArray(live?.items) ? live.items : []);
  const dispatch = items.filter((it: any) => it && (it.type === "rent" || it.type === "buy"));
  const date = stampDate();
  const ref = order.orderNumber || order.id || "";
  const dst = order.siteName || order.deliveryLocation || order.companyName || "現場";
  // 出庫前の現物在庫スナップショット。同一商品が複数行ある場合に備え、引いた分をローカルで控える。
  const productList = OrderBus.getAll<any>("products");
  const remaining: Record<string, number> = {};
  dispatch.forEach((it: any) => {
    const qty = Number(it.quantity || 0);
    if (qty <= 0) return;
    const pid = String(it.id || "");
    const pname = String(it.name || "");
    // products に無い品目（車両等）は現物在庫対象外。伝票も作らない。
    const prod = adjustProductStock(pid, pname, -qty);
    if (!prod) return;
    const key = pid || pname;
    const before = productList.find((x: any) => x && (x.id === pid || x.name === pname));
    const avail = remaining[key] != null ? remaining[key] : (before ? Math.max(0, Number(before.stock || 0)) : qty);
    // 実際に在庫から引けた数量（過剰受注で 0 クランプされた分を、返却時に水増ししないため記録）。
    const actual = Math.min(qty, avail);
    remaining[key] = Math.max(0, avail - actual);
    it.stockDeductedQty = actual;
    // 在庫不足のまま受注確定された場合、サイレントに 0 クランプせず警告で気づけるようにする。
    if (actual < qty) {
      console.warn(`[deductOrderStock] 在庫不足のまま出庫: ${pname} 要求${qty} 実出庫${actual}（不足${qty - actual}） order=${ref}`);
    }
    OrderBus.push("stockOut", {
      id: `OUT-${nextSeq()}`,
      item: it.name,
      qty: actual,
      date,
      dst,
      type: it.type === "buy" ? "販売" : "レンタル",
      staff: "システム（受注確定）",
      seq: nextSeq(),
      icon: "boxOut",
      ref,
      orderId: ref,
    });
  });
  // 記録した実減算数（stockDeductedQty）をライブ注文へ永続化（受注確定経路では items を別途保存しないため）。
  if (live) OrderBus.patch("orders", String(live.firestoreId || live.id), { items });
  // 品目が無くても「処理済み」として印を付け、再呼び出しでの二重減算を防ぐ。
  return { stockDeducted: true, stockDeductedAt: at };
}

/**
 * 倉庫最終検品時の入庫（良品分のみ現物在庫へ加算 + stockIn 伝票）。冪等。
 * - 未出庫（stockDeducted / deliveryConfirmedAt なし）の注文は戻す在庫がないため何もしない。
 * - 既に stockRestored 済みなら二重加算しない。
 * - 紛失・破損（issues）分は在庫へ戻さない。販売品（buy）は戻さない。
 * 戻した場合は { stockRestored: true } を返すので、呼び出し側で注文更新へマージすること。
 *
 * @param issuesList 省略時は order.itemIssues を使用。
 */
export function restoreOrderStock(order: any, issuesList?: any[], opts?: { includeBuy?: boolean }): { stockRestored?: boolean } {
  if (!order) return {};
  // ライブの注文でガード（連打・多端末での二重加算防止）。
  const live = resolveLiveOrder(order);
  const guard = live || order;
  if (!wasDeducted(guard)) return {}; // 未出庫 → 戻す在庫なし
  if (guard.stockRestored) return {}; // 既に戻し済み（ライブ判定で二重加算防止）
  const issues = issuesByItemId(issuesList !== undefined ? issuesList : (order.itemIssues || []));
  // 通常はレンタル品のみ戻す（売却済み販売品は戻さない）。納品前キャンセル(出庫取消)のみ includeBuy で
  // 販売品も戻す（受注確定で減算した buy 在庫が永久欠損するのを防ぐ）。
  const includeBuy = !!(opts && opts.includeBuy);
  const targetItems = Array.isArray(order.items)
    ? order.items.filter((it: any) => it && (it.type === "rent" || (includeBuy && it.type === "buy")))
    : [];
  const date = stampDate();
  const ref = order.orderNumber || order.id || "";
  let restored = false;
  targetItems.forEach((it: any) => {
    const id = String(it.id || it.productId || "");
    // 戻し上限 = 受注時に実際に在庫から引けた数量。過剰受注で 0 クランプされた分は戻さない（在庫水増し防止）。
    const cap = it.stockDeductedQty != null ? Math.max(0, Number(it.stockDeductedQty)) : Number(it.quantity || 0);
    const stillOut = Math.max(0, Number(it.quantity || 0) - Number(it.returnedQuantity || 0));
    const back = Math.max(0, Math.min(stillOut, cap) - Number(issues[id] || 0));
    if (back > 0) {
      const prod = adjustProductStock(id, it.name, back);
      if (prod) {
        OrderBus.push("stockIn", {
          id: `IN-${nextSeq()}`,
          item: it.name,
          qty: back,
          date,
          src: ref,
          type: "回収戻し",
          staff: "システム（最終検品）",
          seq: nextSeq(),
          icon: "boxIn",
          ref,
          orderId: ref,
        });
        restored = true;
      } else {
        // 商品マスタに該当が無く在庫へ戻せなかった（id/名称不一致）。サイレント欠損を防ぐため警告する。
        console.warn(`[restoreOrderStock] 商品が見つからず入庫できません: id=${id}, name=${it.name}, qty=${back}, order=${ref}`);
      }
    }
  });
  return restored ? { stockRestored: true } : {};
}

/**
 * 注文ステータスが「返却・クローズ」へ遷移するときだけ在庫を戻す（admin 手動確定の救済経路）。
 * 通常の戻しは倉庫最終検品（restoreOrderStock 直接呼び出し）で行う。
 * 返却以外への遷移では何もしない。注文へマージすべきフラグ更新を返す。
 */
export function settleReturnStock(order: any, nextStatus?: string): { stockRestored?: boolean } {
  if (!order) return {};
  if (!isClosedOrder(nextStatus)) return {};
  // closed→closed の遷移では在庫を動かさない。既にクローズ済みの注文を別のクローズ状態へ編集しても
  // 再入庫しない（現場報告で返却済にした未検品注文を後から完了へ変える等での幽霊在庫を防止）。
  // 未クローズ→クローズの初回遷移(admin 救済入庫)だけ在庫を動かす。
  const liveCur = resolveLiveOrder(order) || order;
  if (isClosedOrder(liveCur?.status)) return {};
  // 納品済み(現物が客先)の注文をキャンセルしても自動で在庫を戻さない。
  // 戻すと倉庫に無い在庫を水増ししてしまう（納品前キャンセル＝出庫取消は従来どおり戻す）。
  // 返却済/完了 など正規の返却クローズは現物が戻っているので従来どおり restoreOrderStock に委譲。
  if (String(nextStatus) === "キャンセル" && (order as any).deliveryConfirmedAt) {
    return {};
  }
  // 納品前キャンセル(出庫取消)は販売品(buy)も在庫へ戻す。返却済/完了 など正規クローズは rent のみ
  //（売却完了した販売品は手元に戻らないため戻さない）。
  const isPreDeliveryCancel = String(nextStatus) === "キャンセル" && !(order as any).deliveryConfirmedAt;
  return restoreOrderStock(order, undefined, { includeBuy: isPreDeliveryCancel });
}
