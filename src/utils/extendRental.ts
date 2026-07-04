/**
 * extendRental.ts — 期間延長（レンタル終了日の延長）の共通ロジック。
 *
 * モバイル(OrderDetail)とデスクトップ(OrderDetailDesktop)がそれぞれ同じ計算を重複実装して
 * 乖離バグを生んでいたため一本化。プレビューと確定が必ず同じ金額になる。
 *
 * 修正内容（extension-flow-hunt の確定バグ対応）:
 * - E1/E3/E5: admin 手動単価(priceOverride)を prorateOverride で比率維持（延長で値引きが消えない）。
 * - E2: プレビューも regenerateBlocksPreservingState 経由（手動追加費用込みで確定額と一致）。
 * - E6: 返却手続き進行中(回収中/検品待ち/requestedReturn あり)の注文は延長不可。
 * - P1: 延滞注文を本日より前へ「延長」できない（請求済みブロックと明細の不一致防止）。
 * - P2: 最低課金日数の基準は order.minDaysHasVehicle を優先（分割注文で 3⇔10 がブレない）。
 */
import {
  calculateRentalPrice,
  calculateTotalPayment,
  getOrGenerateInvoiceBlocks,
  regenerateBlocksPreservingState,
  parseDateLocal,
} from "./billing";
import { isVehicleCategory } from "./productUtils";
import { prorateOverride } from "./returnProcessing";
import { isReturnEligible } from "./orderStatus";

/** 延長ボタンを出してよい注文か。返却手続きが進行中(回収中/検品待ち/返却依頼あり)は不可（E6）。 */
export function canExtendOrder(order: any): boolean {
  if (!order || !order.rentalStartDate || !order.rentalEndDate) return false;
  // レンタル中/配送済み/一部返却/遅延/延滞 のみ（isReturnEligible と同じ「稼働中」集合）。
  if (!isReturnEligible(order.status)) return false;
  const rq = order.requestedReturn || {};
  if (Object.values(rq).some((v: any) => Number(v) > 0)) return false; // 集荷依頼が進行中
  return (order.items || []).some((i: any) => i && i.type === "rent");
}

/** 日付バリデーション。エラーメッセージ（日本語）を返す。問題なければ null。 */
export function validateExtensionDate(order: any, newEndDate: string): string | null {
  const currentEnd = parseDateLocal(order.rentalEndDate);
  const selectedEnd = parseDateLocal(newEndDate);
  if (!newEndDate || isNaN(selectedEnd.getTime())) return "日付を正しく入力してください。";
  if (selectedEnd < currentEnd) return "延長日は現在の返却予定日以降の日付を選択してください。";
  // 延滞中（返却予定日超過・未返却）は課金が本日まで自動延長済み。本日より前の日付へ「延長」すると
  // 明細と請求ブロックが食い違うため拒否する（P1）。
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  if (currentEnd < today && selectedEnd < today) return "延滞中のご注文は本日以降の日付を選択してください。";
  return null;
}

/** date input の min 値（YYYY-MM-DD）。延滞注文は本日を下限にする。 */
export function extensionMinDate(order: any): string | undefined {
  const end = String(order?.rentalEndDate || "");
  if (!end) return undefined;
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return end < todayStr ? todayStr : end;
}

export interface ExtensionResult {
  updatedItems: any[];
  newInvoiceBlocks: any[];
  subtotal: number;
  tax: number;
  total: number;
}

/**
 * 延長後の items・請求ブロック・合計を計算する（純粋関数・保存はしない）。
 * プレビューと確定の両方がこれを使うことで金額のズレを根絶する。
 */
export function computeExtension(order: any, newEndDate: string): ExtensionResult {
  // 最低課金日数(車両3日/非車両10日)の基準は、分割注文で刻まれた凍結値を優先（P2/C9 と同方針）。
  const hasVehicle = typeof order.minDaysHasVehicle === "boolean"
    ? order.minDaysHasVehicle
    : (order.items || []).some((i: any) => i && i.type === "rent" && isVehicleCategory(i.category));

  let totalRentalPrice = 0;
  let totalBuyPrice = 0;
  let totalGuaranteeFee = 0;
  const updatedItems = (order.items || []).map((item: any) => {
    const copy = { ...item };
    if (copy.type === "rent" && copy.rentPrice) {
      const { totalPrice, breakdown, totalBilledDays, totalActualDays } = calculateRentalPrice(
        copy.rentPrice,
        order.rentalStartDate,
        newEndDate,
        hasVehicle,
        isVehicleCategory(copy.category),
        copy.rentPriceLongTerm,
      );
      copy.monthlyBreakdown = breakdown;
      // admin 手動単価(priceOverride)は比率を維持して新スパンへ按分（E1: 延長で値引きが消えない）。
      // override 無しは標準価格。breakdown は ensureMonthlyBreakdowns のスケーリングが整合させる。
      copy.calculatedPrice = prorateOverride(copy, order, totalPrice, hasVehicle);
      copy.rentalDays = totalActualDays;
      copy.billedDays = totalBilledDays;
      totalRentalPrice += copy.calculatedPrice * copy.quantity;
      if (copy.guaranteeFeeFlat) totalGuaranteeFee += copy.guaranteeFeeFlat;
    } else if (copy.type === "buy" && copy.buyPrice) {
      totalBuyPrice += copy.buyPrice * copy.quantity;
    }
    return copy;
  });

  const subtotal0 = totalRentalPrice + totalBuyPrice + totalGuaranteeFee;
  const { tax: tax0, total: total0 } = calculateTotalPayment(subtotal0);
  const tempOrder = {
    ...order,
    rentalEndDate: newEndDate,
    items: updatedItems,
    subtotal: subtotal0,
    tax: tax0,
    total: total0,
    invoiceBlocks: undefined,
  };
  // 元の入金済み印・手動追加費用を月ごとに引き継ぐ（既入金月が未収に戻らない・手動費用が消えない）。
  const newInvoiceBlocks = regenerateBlocksPreservingState(order.invoiceBlocks, getOrGenerateInvoiceBlocks(tempOrder));
  const bt = (newInvoiceBlocks || []).reduce(
    (a: any, b: any) => ({
      subtotal: a.subtotal + (Number(b.subtotal) || 0),
      tax: a.tax + (Number(b.tax) || 0),
      total: a.total + (Number(b.total) || 0),
    }),
    { subtotal: 0, tax: 0, total: 0 },
  );
  const hasBlocks = (newInvoiceBlocks || []).length > 0;
  return {
    updatedItems,
    newInvoiceBlocks,
    subtotal: hasBlocks ? bt.subtotal : subtotal0,
    tax: hasBlocks ? bt.tax : tax0,
    total: hasBlocks ? bt.total : total0,
  };
}
