/**
 * orderSort.ts — 注文の並び順を 3 サイト（顧客・スタッフ・管理）で一貫させるための共通ヘルパー。
 *
 * - 顧客 / 管理: 新しい注文が上（注文日時の降順）。履歴・一覧として直感的。
 * - スタッフ: 期限が近い順（昇順）。配送は納品希望日、回収は返却期限を基準に「急ぎを先に」。
 */

/** 注文の並び替え用タイムスタンプ（ミリ秒）。createdAt → date文字列 → 各日付の順にフォールバック。 */
export function orderTimestamp(o: any): number {
  if (!o) return 0;
  if (o.createdAt) {
    const t = Date.parse(o.createdAt);
    if (!Number.isNaN(t)) return t;
  }
  // 表示用 date 例: "2026/6/15 • 14:30"
  if (typeof o.date === "string" && o.date) {
    const cleaned = o.date.replace(/[•・]/g, " ").replace(/\s+/g, " ").trim();
    const t = Date.parse(cleaned);
    if (!Number.isNaN(t)) return t;
  }
  for (const k of ["deliveryDate", "rentalStartDate", "rentalEndDate"]) {
    if (o[k]) {
      const t = Date.parse(String(o[k]));
      if (!Number.isNaN(t)) return t;
    }
  }
  return 0;
}

/** 新しい注文が先（顧客・管理の一覧用）。 */
export function byOrderDateDesc(a: any, b: any): number {
  return orderTimestamp(b) - orderTimestamp(a);
}

/** 指定フィールド（YYYY-MM-DD 等）の昇順。未設定は最後。スタッフの「期限が近い順」用。 */
export function byDateFieldAsc(field: string) {
  return (a: any, b: any): number => {
    const ta = a && a[field] ? Date.parse(String(a[field])) : NaN;
    const tb = b && b[field] ? Date.parse(String(b[field])) : NaN;
    const va = Number.isNaN(ta) ? Infinity : ta;
    const vb = Number.isNaN(tb) ? Infinity : tb;
    return va - vb;
  };
}
