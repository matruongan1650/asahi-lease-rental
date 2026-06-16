/**
 * jpHolidays.ts — 日本の土日・祝日判定。お客様サイトの日付選択で営業日のみ選べるようにする。
 *
 * 祝日は内閣府の暦に基づく固定リスト（振替休日・国民の休日を含む）。
 * 年が変わったら NATIONAL_HOLIDAYS に追加してメンテすること。
 */

// YYYY-MM-DD（内閣府「国民の祝日」: 2026・2027 + 振替/国民の休日）
const NATIONAL_HOLIDAYS = new Set<string>([
  // 2026 (令和8)
  "2026-01-01", // 元日
  "2026-01-12", // 成人の日
  "2026-02-11", // 建国記念の日
  "2026-02-23", // 天皇誕生日
  "2026-03-20", // 春分の日
  "2026-04-29", // 昭和の日
  "2026-05-03", // 憲法記念日
  "2026-05-04", // みどりの日
  "2026-05-05", // こどもの日
  "2026-05-06", // 振替休日（5/3が日曜）
  "2026-07-20", // 海の日
  "2026-08-11", // 山の日
  "2026-09-21", // 敬老の日
  "2026-09-22", // 国民の休日
  "2026-09-23", // 秋分の日
  "2026-10-12", // スポーツの日
  "2026-11-03", // 文化の日
  "2026-11-23", // 勤労感謝の日
  // 2027 (令和9)
  "2027-01-01", // 元日
  "2027-01-11", // 成人の日
  "2027-02-11", // 建国記念の日
  "2027-02-23", // 天皇誕生日
  "2027-03-21", // 春分の日
  "2027-03-22", // 振替休日（3/21が日曜）
  "2027-04-29", // 昭和の日
  "2027-05-03", // 憲法記念日
  "2027-05-04", // みどりの日
  "2027-05-05", // こどもの日
  "2027-07-19", // 海の日
  "2027-08-11", // 山の日
  "2027-09-20", // 敬老の日
  "2027-09-23", // 秋分の日
  "2027-10-11", // スポーツの日
  "2027-11-03", // 文化の日
  "2027-11-23", // 勤労感謝の日
]);

/** "YYYY-MM-DD" が祝日か。 */
export function isJpHoliday(dateStr: string): boolean {
  return NATIONAL_HOLIDAYS.has((dateStr || "").slice(0, 10));
}

/** 土曜・日曜か。 */
export function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** 営業日（土日・祝日でない）か。 */
export function isBusinessDay(dateStr: string): boolean {
  return Boolean(dateStr) && !isWeekend(dateStr) && !isJpHoliday(dateStr);
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** dateStr 当日以降で最初の営業日を返す（当日が営業日ならそのまま）。 */
export function nextBusinessDay(dateStr: string): string {
  let d = new Date((dateStr || toKey(new Date())) + "T00:00:00");
  if (isNaN(d.getTime())) d = new Date();
  for (let i = 0; i < 31; i++) {
    const key = toKey(d);
    if (isBusinessDay(key)) return key;
    d.setDate(d.getDate() + 1);
  }
  return toKey(d);
}

/** 選べない理由のラベル（土日 / 祝日）。営業日なら空文字。 */
export function nonBusinessDayReason(dateStr: string): string {
  if (isWeekend(dateStr)) return "土曜・日曜";
  if (isJpHoliday(dateStr)) return "祝日";
  return "";
}
