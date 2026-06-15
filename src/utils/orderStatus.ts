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
