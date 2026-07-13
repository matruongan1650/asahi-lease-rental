/**
 * orderStatus.ts — 注文ステータスの表記ゆれを吸収する共通ヘルパー。
 *
 * 返却完了の状態は、確定経路によって「返却済」（持込/現場回収の確定: returnProcessing）
 * と「返却済み」（admin 全量回収: AdminRecovery / staff: StaffJobDetail）の双方が
 * 書き込まれ、過去データにも両方が混在している。各画面が片方しか判定しないと
 * 「請求書が出ない」「履歴タブに出ない」等の不整合が起きるため、ここで一元化する。
 */
export const RETURNED_STATUSES = ["返却済", "返却済み"] as const;
export const CLOSED_STATUSES = ["返却済", "返却済み", "完了", "キャンセル"] as const;

/** 全量返却が確定した注文か（表記ゆれを吸収）。 */
export function isFullyReturned(status?: string | null): boolean {
  return RETURNED_STATUSES.includes(String(status ?? "") as (typeof RETURNED_STATUSES)[number]);
}

/** これ以上アクティブでない（クローズ済み）注文か。 */
export function isClosedOrder(status?: string | null): boolean {
  return CLOSED_STATUSES.includes(String(status ?? "") as (typeof CLOSED_STATUSES)[number]);
}

// 返却手続きを開始できる（実際に納品済みで、まだ返却/回収が進行中でない）状態。
// 未配送(処理中/確認済み/準備中/配送中)・返却進行中(検品待ち/回収中/回収予定)・クローズ(キャンセル/返却済/完了)は不可。
const RETURN_ELIGIBLE_STATUSES = ["レンタル中", "配送済み", "一部返却", "遅延", "延滞"];
/** 顧客が返却手続きを開始できる注文か（ステータスで判定）。 */
export function isReturnEligible(status?: string | null): boolean {
  return RETURN_ELIGIBLE_STATUSES.includes(String(status ?? ""));
}

/** 日付文字列を YYYY-MM-DD（ゼロ埋め）へ正規化。不正は ""。 */
function ymdNorm(s: any): string {
  const m = String(s || "").replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

/**
 * 「回収しに行ける」レンタル注文か: 納品済み・未回収・未クローズで、未返却のレンタル残がある。
 * 未納品（処理中/確認済み/準備中/配送中）や回収済み（検品待ち・staffStatus=回収完了）を
 * 延滞・未回収の母集団に混ぜない（ダッシュボードの延滞過大計上防止, M8/M15/M27）。
 */
export function isRecoverableRentalOrder(o: any): boolean {
  if (!o || isClosedOrder(o.status)) return false;
  const status = String(o.status || "");
  const staffStatus = String(o.staffStatus || "");
  if (status === "検品待ち" || staffStatus === "回収完了") return false; // 回収済み・倉庫検品待ち
  const delivered = Boolean(o.deliveryConfirmedAt)
    || ["配送完了", "回収予定", "回収中"].includes(staffStatus)
    || ["配送済み", "レンタル中", "回収中", "一部返却", "遅延", "延滞"].includes(status);
  if (!delivered) return false;
  return (o.items || []).some((i: any) =>
    i && i.type === "rent" && Math.max(0, Number(i.quantity || 0) - Number(i.returnedQuantity || 0)) > 0);
}

/** レンタル終了予定日を過ぎて未回収（=延滞）の注文か。課金の自動延長対象と同じ母集団で判定する。 */
export function isOverdueRentalOrder(o: any, now: Date = new Date()): boolean {
  if (!isRecoverableRentalOrder(o)) return false;
  const end = ymdNorm(o?.rentalEndDate);
  if (!end) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return end < today;
}
