/**
 * 請求書データ検証スクリプト（手動実行: npx tsx src/utils/testInvoiceGen.ts）
 * 月またぎ・最低日数・保証料・燃料費・breakdown 欠落の補完を検証する。
 */
import { getOrGenerateInvoiceBlocks, calculateRentalPrice, calculateMonthlyInvoice } from "./billing";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
let fails = 0;
function check(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

// ── ケース1: 6/11〜8/1（非車両・¥5/日・8個・保証料¥4,000） ──
const { breakdown } = calculateRentalPrice(5, "2026-06-11", "2026-08-01", false, false);
const base: any = {
  id: "o1", date: "2026/06/11 • 09:00", status: "レンタル中",
  rentalStartDate: "2026-06-11", rentalEndDate: "2026-08-01",
  items: [{ id: "c1", name: "カラーコーン", type: "rent", quantity: 8, rentPrice: 5, guaranteeFeeFlat: 4000, monthlyBreakdown: breakdown }],
};
const blocks = getOrGenerateInvoiceBlocks({ ...base });
check("ブロック数（3ヶ月）", blocks.map(b => b.monthPeriod), ["2026-06", "2026-07", "2026-08"]);
check("6月 期間", [blocks[0].startDate, blocks[0].endDate, blocks[0].actualDays], ["2026/06/11", "2026/06/30", 20]);
check("7月 期間", [blocks[1].startDate, blocks[1].endDate, blocks[1].actualDays], ["2026/07/01", "2026/07/31", 31]);
check("8月 期間", [blocks[2].startDate, blocks[2].endDate, blocks[2].actualDays], ["2026/08/01", "2026/08/01", 1]);
check("保証料は初月のみ", blocks.map(b => b.guaranteeFee), [4000, 0, 0]);
// 金額: 単価×日数×数量（長期 Price_B は rentPriceLongTerm 未設定なら A と同額）
check("6月 base小計 = 5円×20日×8", blocks[0].baseSubtotal, 5 * 20 * 8);
check("7月 base小計 = 5円×31日×8", blocks[1].baseSubtotal, 5 * 31 * 8);
check("8月 base小計 = 5円×1日×8", blocks[2].baseSubtotal, 5 * 1 * 8);
check("6月 税 = floor((800+4000)×0.1)", blocks[0].tax, Math.floor((800 + 4000) * 0.1));
check("ブロック合計の総和 = 月次請求の総和", sum(blocks.map(b => b.total)),
  sum(["2026-06", "2026-07", "2026-08"].map(m => calculateMonthlyInvoice({ ...base }, m).total)));

// ── ケース2: breakdown 欠落（旧データ/手動作成）でも同じ請求になるか ──
const noBd = { ...base, items: [{ ...base.items[0], monthlyBreakdown: undefined }] };
const blocks2 = getOrGenerateInvoiceBlocks(noBd);
check("breakdown 欠落: ブロック数", blocks2.length, 3);
check("breakdown 欠落: 合計一致", blocks2.map(b => b.total), blocks.map(b => b.total));

// ── ケース3: 実使用3日（非車両）→ 最低10日課金 ──
const r3 = calculateRentalPrice(100, "2026-06-11", "2026-06-13", false, false);
check("非車両 最低10日", [r3.totalActualDays, r3.totalBilledDays, r3.totalPrice], [3, 10, 1000]);

// ── ケース4: 車両あり注文の車両品目 実2日 → 最低3日 ──
const r4 = calculateRentalPrice(8000, "2026-06-11", "2026-06-12", true, true);
check("車両 最低3日", [r4.totalActualDays, r4.totalBilledDays, r4.totalPrice], [2, 3, 24000]);

// ── ケース5: 燃料補給費が最終ブロックに課税計上 ──
const fuelBlocks = getOrGenerateInvoiceBlocks({ ...base, fuelCharge: { amount: 4200, note: "燃料補給費" } } as any);
const last = fuelBlocks[fuelBlocks.length - 1];
check("燃料費 extraCosts", last.extraCosts?.map((e: any) => [e.id, e.amount, e.isTaxable]), [["fuel-refill", 4200, true]]);
check("燃料費込み合計 = (40+4200)+tax", last.total, 40 + 4200 + Math.floor((40 + 4200) * 0.1));

console.log(fails === 0 ? "\nALL OK" : `\n${fails} FAILED`);
