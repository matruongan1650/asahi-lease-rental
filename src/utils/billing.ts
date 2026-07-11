import { type Product, type CartItem, type Order, type MonthlyBreakdown, type InvoiceBlock, type ExtraCost } from "../types";
import { isVehicleCategory } from "./productUtils";
import { isFullyReturned, isClosedOrder } from "./orderStatus";

/**
 * 長期割引（単価B / rentPriceLongTerm）が適用される累計レンタル日数のしきい値。
 * この日数「以上」で長期単価に切り替わる（例: 17 → 17日目以降は長期単価）。
 * 課金ロジックとお客様サイトの表示（「長期(17日〜)」）で同じ値を使い、表示と請求のズレを防ぐ。
 */
export const LONG_TERM_THRESHOLD_DAYS = 17;

/**
 * 商品の保証料設定（flat / tiered）と数量から、その明細1行分の保証料合計を算出する。
 * Checkout の計算と同じロジック（管理画面のレンタル登録でも同じ金額になるよう共通化）。
 */
export function computeGuaranteeFeeFlat(product: any, qty: number): number {
  if (!product?.isGuarantee) return 0;
  const n = (v: any) => Number(v) || 0;
  if (product.guaranteeType === 'flat') return n(product.guaranteeRate) * qty;
  const g = product.guaranteeFees;
  if (!g) return 0;
  if (qty <= 50) return n(g.range1);
  if (qty <= 100) return n(g.range2);
  if (qty <= 150) return n(g.range3);
  if (qty <= 200) return n(g.range4);
  if (qty <= 250) return n(g.range5) || n(g.range4);
  return n(g.range6) || n(g.range5) || n(g.range4);
}

// 消費税率（既定 10%）。設定（systemSettings.taxRate）から setTaxRate で上書きできる。
// 既定値は現行動作と同じなので、未設定でも挙動は変わらない。
let _taxRate = 0.10;
/** 税率を設定（0 < rate < 1）。例: 8% → 0.08。 */
export function setTaxRate(rate: number): void {
  if (typeof rate === "number" && rate > 0 && rate < 1) _taxRate = rate;
}
/** 現在の消費税率を返す。 */
export function getTaxRate(): number {
  return _taxRate;
}

export interface RentalPeriodDetailed {
  monthStr: string; // e.g. "2026-06"
  days: number;
  discounted: boolean;
  price: number;
}

export function parseDateLocal(dateStr: string): Date {
  // スラッシュ("2026/06/01")・ゼロ埋め無し("2026/6/8")・余分な時刻部分を許容してローカル 00:00 で解釈する。
  // （正規化しないと slash や非ゼロ埋めで Invalid Date になり、請求 breakdown が空＝¥0 になる事故が起きる）
  const clean = String(dateStr).replace(/\//g, '-');
  const m = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(clean.slice(0, 10) + 'T00:00:00');
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

/** 期間(YYYY-MM-DD 〜 YYYY-MM-DD)を月単位 "YYYY-MM" の配列に展開（両端の月を含む）。 */
export function monthsInSpan(startStr?: string, endStr?: string): string[] {
  if (!startStr || !endStr) return [];
  const start = parseDateLocal(String(startStr).replace(/\//g, "-").slice(0, 10));
  const end = parseDateLocal(String(endStr).replace(/\//g, "-").slice(0, 10));
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];
  const out: string[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out;
}

/**
 * Checks if the list of cart items contains any vehicle.
 */
export function detectOrderType(items: CartItem[]): boolean {
  return items.some(item => isVehicleCategory(item.category) && item.type === 'rent');
}

/**
 * Gets the minimum chargeable days based on order type.
 */
export function getMinDays(hasVehicle: boolean): number {
  return hasVehicle ? 3 : 10;
}

/**
 * Calculates the flat warranty fee for a product based on quantity.
 * Only applied once (not per day, first month only).
 */
export function getWarrantyFeePerUnit(product: Product, qty: number): number {
  const wf = product.warrantyFees;
  if (!wf || !wf.enabled) return 0;
  if (qty >= 151 && qty <= 200) return Number(wf["151_200"]) || 0;
  if (qty >= 101 && qty <= 150) return Number(wf["101_150"]) || 0;
  if (qty >= 51 && qty <= 100) return Number(wf["51_100"]) || 0;
  if (qty >= 1 && qty <= 50) return Number(wf["1_50"]) || 0;
  if (qty > 200) return Number(wf["151_200"]) || 0; // use highest tier for >200
  return 0;
}

export function calcWarrantyFee(product: Product, qty: number): number {
  const perUnit = getWarrantyFeePerUnit(product, qty);
  return perUnit * qty;
}

/**
 * Main pricing engine function.
 * Calculates rental price, monthly breakdown, billed days, and actual days.
 */
export function calculateRentalPrice(
  rentPrice: number,
  rentalStartDate: string | undefined, // YYYY-MM-DD
  rentalEndDate: string | undefined,   // YYYY-MM-DD
  hasVehicle: boolean,
  isVehicleItem: boolean,
  rentPriceLongTerm?: number
): { totalPrice: number; breakdown: RentalPeriodDetailed[]; totalBilledDays: number; totalActualDays: number } {
  const minChargeableDays = getMinDays(hasVehicle);

  // If no dates, we assume at least the minimum chargeable days for preview in Cart
  if (!rentalStartDate || !rentalEndDate) {
    return {
      totalPrice: rentPrice * minChargeableDays,
      breakdown: [],
      totalBilledDays: minChargeableDays,
      totalActualDays: minChargeableDays,
    };
  }

  const start = parseDateLocal(rentalStartDate);
  const end = parseDateLocal(rentalEndDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return {
      totalPrice: rentPrice * minChargeableDays,
      breakdown: [],
      totalBilledDays: minChargeableDays,
      totalActualDays: minChargeableDays,
    };
  }

  const totalActualDays = daysBetween(start, end);

  const breakdown: RentalPeriodDetailed[] = [];
  let cur = new Date(start.getTime()); // copy
  let totalPrice = 0;
  let totalBilledDays = 0;

  while (cur <= end) {
    const lastOfMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const segEnd = end < lastOfMonth ? new Date(end.getTime()) : new Date(lastOfMonth.getTime());
    
    const actual = daysBetween(cur, segEnd);
    const cumActual = daysBetween(start, segEnd);
    
    const isFirst = cur.getTime() === start.getTime();
    
    // Minimum chargeable days is only applied to the very first month block
    const minApplied = isFirst && actual < minChargeableDays;
    const billed = minApplied ? minChargeableDays : actual;
    
    // Tier B Long-term discount applies if cumulative days >= LONG_TERM_THRESHOLD_DAYS
    const tier = cumActual >= LONG_TERM_THRESHOLD_DAYS ? 'B' : 'A';
    const applyDiscount = tier === 'B';
    
    const rawPricePerDay = (applyDiscount && rentPriceLongTerm !== undefined)
      ? rentPriceLongTerm
      : rentPrice;

    const monthlyPrice = billed * rawPricePerDay;

    breakdown.push({
      monthStr: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
      days: billed,
      discounted: applyDiscount,
      price: monthlyPrice
    });

    totalPrice += monthlyPrice;
    totalBilledDays += billed;

    cur = new Date(segEnd.getFullYear(), segEnd.getMonth() + 1, 1);
  }

  return { totalPrice: Math.floor(totalPrice), breakdown, totalBilledDays, totalActualDays };
}

/**
 * Calculates totals including 10% consumer tax.
 */
export function calculateTotalPayment(subtotal: number): { subtotal: number; tax: number; total: number } {
  const tax = Math.floor(subtotal * _taxRate);
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

/**
 * 注文のレンタル品目に monthlyBreakdown が無い場合に補完する。
 * （admin 手動作成・旧データ・外部同期データなどは breakdown を持たないことがあり、
 *   そのままだと請求書が ¥0 / 明細空欄になるため、注文の期間と単価から再計算する。）
 * 元の items は変更せず、補完済みのコピーを返す。
 */
/**
 * 課金の終了日（YYYY-MM-DD）。
 * - 返却済み: 実際の返却日（スタッフ回収日）まで課金。
 * - レンタル中で返却予定日を過ぎても未返却: 「本日」まで自動延長（= 自動で延長料金が発生）。
 * - それ以外（処理中・キャンセル等）: 返却予定日のまま（延長しない）。
 */
const ACTIVE_RENTAL_STATUSES = ["配送済み", "レンタル中", "回収予定", "回収中"];
export function billingEndDate(order: any): string | undefined {
  if (order?.actualReturnDate) return order.actualReturnDate;
  const end = order?.rentalEndDate;
  if (!end) return end;
  const isActive =
    ACTIVE_RENTAL_STATUSES.includes(String(order?.status || "")) ||
    order?.staffStatus === "配送完了";
  if (!isActive) return end;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const endClean = String(end).replace(/\//g, "-").slice(0, 10);
  // 返却予定日 < 本日（未返却） → 本日まで自動延長
  return endClean >= todayStr ? end : todayStr;
}

export function ensureMonthlyBreakdowns(order: Order): Order["items"] {
  if (!order) return [];
  // 最低課金日数の基準(車両=3日 / 非車両=10日)は「注文全体に車両があるか」で決まる。
  // 一部返却で車両と非車両が別注文に分割されると、分割後の items だけで再判定すると基準が変わり
  // 過大/過小請求になる(C9)。分割時に元注文の基準を minDaysHasVehicle として刻んであれば優先する。
  const hasVehicle = typeof (order as any).minDaysHasVehicle === "boolean"
    ? (order as any).minDaysHasVehicle
    : (order.items || []).some((i: any) => i && i.type === "rent" && isVehicleCategory(i.category));
  const endDate = billingEndDate(order);
  // 確定済み(キャッシュ済み invoiceBlocks がある)注文では breakdown を作り直さない。
  // 作り直すと、frozen なブロック合計と PDF 明細がズレ／管理者の手動単価(calculatedPrice)上書きが消える。
  // span 全体の再計算は「未確定(invoiceBlocks 空)」の注文にのみ適用する。
  const hasCachedBlocks = !!(order.invoiceBlocks && order.invoiceBlocks.length > 0);
  // 日付はスラッシュ/ゼロ埋め無しを含み得るので正規化（calculateRentalPrice が壊れて breakdown 空＝¥0 になるのを防ぐ）。
  const startNorm = order.rentalStartDate ? String(order.rentalStartDate).replace(/\//g, "-").slice(0, 10) : "";
  const endNorm = endDate ? String(endDate).replace(/\//g, "-").slice(0, 10) : "";
  return (order.items || []).map((item: any) => {
    const mb = item?.monthlyBreakdown;
    // 未確定(invoiceBlocks 空)の注文は常に rentPrice + billingEndDate から breakdown を作り直す。
    // これでさかのぼり登録・期限超過の自動延長(同一月内の日数延長を含む)・月集合の変化が正しく反映される。
    // 管理者が単価を手動上書きした注文(priceOverride)も「月割り」は作り直すが、calculatedPrice は
    // 上書き額を温存し、下のスケーリングで recomputed breakdown を上書き総額へ比例配分して整合させる。
    // 確定(キャッシュ済み)注文は frozen。breakdown が空のときだけ補完する。
    const needsRecompute = !Array.isArray(mb) || mb.length === 0 || !hasCachedBlocks;
    let result: any = item;
    if (
      item &&
      item.type === "rent" &&
      needsRecompute &&
      item.rentPrice &&
      startNorm &&
      endNorm
    ) {
      try {
        const { totalPrice, breakdown, totalBilledDays, totalActualDays } = calculateRentalPrice(
          item.rentPrice,
          startNorm,
          endNorm,
          hasVehicle,
          isVehicleCategory(item.category),
          item.rentPriceLongTerm
        );
        // 未確定の span 再計算時は新値で上書き（古い1か月分の値を残すと breakdown と総額が食い違う）。
        // 確定注文での空補完時は既存の手動上書き値を尊重する。
        result = {
          ...item,
          monthlyBreakdown: breakdown,
          // 確定注文 or 手動上書きは calculatedPrice を温存（override は下のスケーリングで breakdown を総額へ整合）。
          // それ以外は再計算した自然総額を採用（期限延長を反映）。日数は常に再計算値（実期間）を使う。
          calculatedPrice: (hasCachedBlocks || item.priceOverride) ? (item.calculatedPrice ?? totalPrice) : totalPrice,
          rentalDays: hasCachedBlocks ? (item.rentalDays ?? totalActualDays) : totalActualDays,
          billedDays: hasCachedBlocks ? (item.billedDays ?? totalBilledDays) : totalBilledDays,
        };
      } catch {
        result = item;
      }
    }
    // 管理者が単価(calculatedPrice)を手動上書きすると、月別 breakdown の合計が calculatedPrice と食い違い、
    // 請求ブロック(breakdown 基準)と明細(calculatedPrice 基準)・総額がズレる。breakdown を calculatedPrice に
    // 比例スケールして、ブロック合計＝明細＝総額を一致させ、上書きを請求へ反映する（端数は最終月で吸収）。
    if (result && result.type === "rent" && Array.isArray(result.monthlyBreakdown) && result.monthlyBreakdown.length && result.calculatedPrice != null) {
      const sum = result.monthlyBreakdown.reduce((s: number, b: any) => s + Number(b?.price || 0), 0);
      const target = Number(result.calculatedPrice) || 0;
      if (sum > 0 && target > 0 && Math.abs(sum - target) > 1) {
        const factor = target / sum;
        let acc = 0;
        const scaled = result.monthlyBreakdown.map((b: any, i: number, arr: any[]) => {
          if (i === arr.length - 1) return { ...b, price: Math.max(0, target - acc) };
          const p = Math.round(Number(b?.price || 0) * factor);
          acc += p;
          return { ...b, price: p };
        });
        result = { ...result, monthlyBreakdown: scaled };
      }
    }
    return result;
  });
}

/**
 * 注文日(order.date, "YYYY/M/D • HH:MM" など)から請求対象月キー "YYYY-MM" を得る。
 * 0埋め無し(2026/6/8)や ja-JP 形式、返却分(-R)注文でも正しく "2026-06" を返す。
 * （旧実装の slice(0,7) は "2026-6-" のように壊れて月別請求の突合に失敗していた）。
 */
export function orderMonthKey(order: any): string {
  const clean = String(order?.date || "").split("•")[0]?.trim() || "";
  const m = clean.match(/(\d{4})[\/\-.](\d{1,2})/);
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, "0")}` : "";
}

/**
 * Computes monthly invoice details for an order for a specific calendar month.
 */
export function calculateMonthlyInvoice(order: Order, monthStr: string): { subtotal: number; tax: number; total: number; items: any[] } {
  let subtotal = 0;
  const itemsBreakdown: any[] = [];
  const items = ensureMonthlyBreakdowns(order);

  items.forEach(item => {
    if (item.type === 'buy') {
      // Buy items are billed in the order month
      const orderMonth = orderMonthKey(order);
      if (orderMonth === monthStr) {
        // calculatedPrice を単価の正とする（管理者の手動上書きを反映。未上書き時は buyPrice と同値）。
        const buyUnit = Number(item.calculatedPrice ?? item.buyPrice) || 0;
        const itemPrice = buyUnit * item.quantity;
        subtotal += itemPrice;
        itemsBreakdown.push({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: buyUnit,
          total: itemPrice,
          type: 'buy'
        });
      }
    } else {
      // Rent items are split across months
      const block = item.monthlyBreakdown?.find(b => b.monthStr === monthStr);
      if (block) {
        const rentalFee = block.price * item.quantity;
        let guaranteeFee = 0;
        
        // Guarantee fee (保証料) is only calculated once, in the first rental month block
        const isFirstMonth = item.monthlyBreakdown?.[0]?.monthStr === monthStr;
        if (isFirstMonth && item.guaranteeFeeFlat) {
          guaranteeFee = item.guaranteeFeeFlat; // Flat fee calculated in cart/checkout
        }

        const itemTotal = rentalFee + guaranteeFee;
        subtotal += itemTotal;

        itemsBreakdown.push({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          days: block.days,
          price: block.days > 0 ? block.price / block.days : 0, // price per day (0除算ガード)
          rentalFee,
          guaranteeFee,
          total: itemTotal,
          type: 'rent'
        });
      }
    }
  });

  const totals = calculateTotalPayment(subtotal);
  return {
    ...totals,
    items: itemsBreakdown
  };
}

/**
 * Recalculates an invoice block's subtotal, tax, and total based on its base values
 * and any positive/negative extra costs, applying 10% tax appropriately.
 */
export function recalculateInvoiceBlock(block: InvoiceBlock): InvoiceBlock {
  const extraCosts = block.extraCosts || [];
  
  // Taxable extra costs
  const taxableExtra = extraCosts.filter(e => e.isTaxable).reduce((sum, e) => sum + e.amount, 0);
  // Non-taxable extra costs
  const nonTaxableExtra = extraCosts.filter(e => !e.isTaxable).reduce((sum, e) => sum + e.amount, 0);
  
  // Base taxable amount includes baseSubtotal and guaranteeFee
  const baseTaxable = block.baseSubtotal + block.guaranteeFee;
  
  const totalTaxable = baseTaxable + taxableExtra;
  // 値引/返金（マイナス課税額）が混ざるブロックでは Math.floor が ¥1 過大控除になるため
  // 0方向への切り捨て(Math.trunc)を使う。正の額では floor と同値。
  const tax = Math.trunc(totalTaxable * _taxRate);

  block.subtotal = block.baseSubtotal + block.guaranteeFee + extraCosts.reduce((sum, e) => sum + e.amount, 0);
  block.tax = tax;
  block.total = totalTaxable + nonTaxableExtra + tax;
  return block;
}

/** 自動注入される ExtraCost の id（再生成のたびに下流で再注入されるため引き継がない）。 */
const AUTO_EXTRA_COST_IDS = new Set(["fuel-refill", "compensation-charge", "delivery-fee"]);

/**
 * 請求ブロックを再生成する際、旧ブロックの「入金状態(status/paidAt)」と「手動追加費用」を月ごとに
 * 引き継ぐ。課金項目の編集・期限延長・返却確定でブロックを作り直しても、admin が付けた入金済み印や
 * 手動 追加費用 が消えないようにする（過少請求・入金済み月の未収復活＝二重請求リスクの防止）。
 * - status/paidAt: 同一 monthPeriod の旧ブロックから継承。opts.closing=true（注文が返却済/完了へ
 *   クローズ）の場合は継承しない（別サイクルとして未入金から開始）。
 * - extraCosts: 自動注入(fuel-refill/compensation-charge/delivery-fee)は引き継がず、手動追加分だけ
 *   新ブロックへ再付与して recalculateInvoiceBlock で合計に反映（自動分は下流の inject* が再注入）。
 */
export function regenerateBlocksPreservingState(
  prevBlocks: InvoiceBlock[] | undefined,
  newBlocks: InvoiceBlock[],
  opts: { closing?: boolean } = {},
): InvoiceBlock[] {
  const prevByMonth = new Map<string, InvoiceBlock>();
  (prevBlocks || []).forEach((b) => { if (b && b.monthPeriod) prevByMonth.set(b.monthPeriod, b); });
  const result = (newBlocks || []).map((nb) => {
    const pb = prevByMonth.get(nb.monthPeriod);
    if (!pb) return nb;
    // 手動追加費用の引き継ぎ（同一idが新ブロックに既にあれば二重付与しない）
    const manual = (pb.extraCosts || []).filter((c: any) => c && !AUTO_EXTRA_COST_IDS.has(String(c.id || "")));
    if (manual.length > 0) {
      const existing = new Set((nb.extraCosts || []).map((c: any) => String(c.id || "")));
      const add = manual.filter((c: any) => !existing.has(String(c.id || "")));
      if (add.length > 0) {
        nb.extraCosts = [...(nb.extraCosts || []), ...add];
        recalculateInvoiceBlock(nb);
      }
    }
    // 入金状態の引き継ぎ（クローズ時は持ち越さない）
    if (!opts.closing) {
      if ((pb as any).status) (nb as any).status = (pb as any).status;
      if ((pb as any).paidAt) (nb as any).paidAt = (pb as any).paidAt;
    }
    return nb;
  });
  // C10: 新スパンから消えた月(早期全量返却で末尾月が落ちる等)の手動追加費用を失わないよう、
  // 最後の新ブロックへ退避する。入金済みだった月が消える場合は警告（回収済み売上の追跡が切れるため）。
  const newMonths = new Set((newBlocks || []).map((b) => b && b.monthPeriod));
  const dropped = (prevBlocks || []).filter((b) => b && b.monthPeriod && !newMonths.has(b.monthPeriod));
  if (dropped.length > 0 && result.length === 0) {
    // 新スパンがゼロブロック（全量早期返却で請求月なし等）: 退避先が無いため手動費用は載せられない。
    // 少なくとも失われる手動費用を警告して照合できるようにする。
    const lostManual = dropped.some((d) => ((d as any).extraCosts || []).some(
      (c: any) => c && !AUTO_EXTRA_COST_IDS.has(String(c.id || "")),
    ));
    if (lostManual) console.warn("[regenerateBlocksPreservingState] 新ブロックが空のため、消えた月の手動追加費用を退避できません（要確認）。");
  }
  if (dropped.length > 0 && result.length > 0) {
    const last = result[result.length - 1];
    const existing = new Set((last.extraCosts || []).map((c: any) => String(c.id || "")));
    let added = false;
    for (const d of dropped) {
      const manual = ((d as any).extraCosts || []).filter(
        (c: any) => c && !AUTO_EXTRA_COST_IDS.has(String(c.id || "")) && !existing.has(String(c.id || "")),
      );
      if (manual.length > 0) {
        (last as any).extraCosts = [...((last as any).extraCosts || []), ...manual];
        manual.forEach((c: any) => existing.add(String(c.id || "")));
        added = true;
      }
      if (!opts.closing && String((d as any).status || "") === "paid") {
        console.warn(`[regenerateBlocksPreservingState] 入金済み月 ${d.monthPeriod} が新スパンから消えました（要確認）。`);
      }
    }
    if (added) recalculateInvoiceBlock(last);
  }
  return result;
}

/**
 * 稼働中（未クローズ）の注文で、課金終了日(billingEndDate)がキャッシュ済みブロックの最終月より先へ
 * 進んでいれば、不足している「新しい月」のブロックだけを末尾へ追記する（月次請求の自動ロールフォワード）。
 * - 既存のキャッシュ月は一切変更しない（入金済み・確定額・PDF 明細を壊さない = append-only）。
 * - クローズ済み（返却済/完了/キャンセル）は凍結。返却時に締めた最終請求を後から伸ばさない。
 * - 追記月はフル span 再計算（ensureMonthlyBreakdowns 経由）から採るため、長期割引の累計日数も正しい。
 * - 追記は「当月まで」に限定する。将来の返却予定日を持つ契約でも、未経過の将来月を先に請求ブロック化して
 *   AR を水増ししない（将来分は実際にその月へ到達したとき/返却確定時に載る）。
 * - 過去のまま「集計中(accumulating)」で残った月は「未入金(pending)」へ確定させる（新月が当月へ繰り上がる
 *   ため。入金済み・手動状態は変更しない）。これで期限超過の当月請求が、イベント無しでも自動で現れる。
 */
function appendRolledForwardMonths(order: Order, cached: InvoiceBlock[]): InvoiceBlock[] {
  const thisMonthStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  })();
  // 過去のまま「集計中(accumulating)」の月を「未入金(pending)」へ確定させる。以前は「新月の追記に
  // 成功した時」しか実行されず、納品時に全期間キャッシュ済みの長期契約では経過月が永久に集計中の
  // まま AR/延滞から漏れていた(I3)。追記の有無に関係なく毎回適用する（入金済み・手動状態は不変）。
  const settlePast = (arr: InvoiceBlock[]) => arr.map((b) =>
    b && (b as any).status === "accumulating" && b.monthPeriod && b.monthPeriod < thisMonthStr
      ? ({ ...b, status: "pending" } as InvoiceBlock)
      : b,
  );
  // クローズ済み注文はもう積み上がらない: 残骸の「集計中」は月を問わず未入金へ確定する
  //（settleAccumulating(R15) 導入前にクローズされた既存データの救済）。
  if (isClosedOrder(order.status)) {
    return cached.map((b) =>
      b && (b as any).status === "accumulating" ? ({ ...b, status: "pending" } as InvoiceBlock) : b,
    );
  }
  const end = billingEndDate(order);
  if (!end) return settlePast(cached);
  const endMonth = String(end).replace(/\//g, "-").slice(0, 7);
  if (endMonth.length !== 7) return settlePast(cached);
  // 追記対象は「当月まで」。将来返却予定(未来の rentalEndDate)でも未経過の将来月は先取り請求しない。
  const targetMonth = endMonth > thisMonthStr ? thisMonthStr : endMonth;
  const lastCachedMonth = cached.reduce(
    (m, b) => (b && b.monthPeriod && b.monthPeriod > m ? b.monthPeriod : m),
    "",
  );
  if (!lastCachedMonth || targetMonth <= lastCachedMonth) return settlePast(cached);
  // フル span を再計算し、最終キャッシュ月より後 〜 当月 の月ブロックだけ採用（既存月・将来月は不変）。
  const fresh = getOrGenerateInvoiceBlocks({ ...order, invoiceBlocks: undefined } as Order);
  const appended = fresh
    .filter((b) => b && b.monthPeriod && b.monthPeriod > lastCachedMonth && b.monthPeriod <= targetMonth)
    .map((b) => {
      // 追記月は純粋なレンタル料のみ。自動費用（配送料=初月 / 弁償費・燃料費=クローズ月）は
      // キャッシュ済みブロック側に既に載っているため、追記した中間月へ二重計上しない（防御）。
      const hasAuto = (b.extraCosts || []).some((c: any) => AUTO_EXTRA_COST_IDS.has(String(c?.id || "")));
      if (!hasAuto) return b;
      const cleaned = { ...b, extraCosts: (b.extraCosts || []).filter((c: any) => !AUTO_EXTRA_COST_IDS.has(String(c?.id || ""))) };
      return recalculateInvoiceBlock(cleaned);
    });
  if (appended.length === 0) return settlePast(cached);
  return [...settlePast(cached), ...appended];
}

/**
 * Generates monthly invoice blocks dynamically from order items and dates if not already present.
 */
export function getOrGenerateInvoiceBlocks(order: Order): InvoiceBlock[] {
  if (!order) return [];
  if (order.invoiceBlocks && order.invoiceBlocks.length > 0) {
    const cached = order.invoiceBlocks.map((block) => {
      const extraCosts = (block.extraCosts || []).map((cost) => ({
        ...cost,
        amount: Math.round(Number(cost.amount) || 0),
        isTaxable: cost.isTaxable !== false,
      }));
      const extraTotal = extraCosts.reduce((sum, cost) => sum + cost.amount, 0);
      const guaranteeFee = Math.round(Number(block.guaranteeFee) || 0);
      const storedSubtotal = Math.round(Number(block.subtotal) || 0);
      const baseSubtotal = Math.round(
        Number(block.baseSubtotal ?? Math.max(0, storedSubtotal - guaranteeFee - extraTotal)) || 0,
      );

      return recalculateInvoiceBlock({
        ...block,
        actualDays: Number(block.actualDays) || 0,
        chargeableDays: Number(block.chargeableDays) || 0,
        guaranteeFee,
        baseSubtotal,
        subtotal: storedSubtotal,
        tax: Math.round(Number(block.tax) || 0),
        total: Math.round(Number(block.total) || 0),
        extraCosts,
      });
    });
    // 弁償費・配送料が未計上ならここで注入（キャッシュ済みブロックにも反映。冪等・削除尊重）。
    injectCompensationCharge(order, cached);
    injectDeliveryCharge(order, cached);
    // 稼働中（未クローズ）の注文は、当月へ繰り越した月次請求ブロックを自動追記する
    //（イベント無しでも期限超過中の当月請求が現れる。既存の確定/入金済み月は不変）。
    return appendRolledForwardMonths(order, cached);
  }

  // breakdown が無い品目は補完してから月ブロックを構築（¥0 請求書の防止）
  const ensuredItems = ensureMonthlyBreakdowns(order);

  const monthsSet = new Set<string>();
  ensuredItems.forEach(item => {
    if (item.type === 'rent' && item.monthlyBreakdown) {
      item.monthlyBreakdown.forEach(b => {
        if (b.monthStr) {
          monthsSet.add(b.monthStr);
        }
      });
    }
  });

  const orderDateClean = order.date?.split("•")[0]?.trim() || "";
  const orderMonth = orderMonthKey(order); // "2026-06"（0埋め無し/ja-JP/返却分にも対応）

  const hasBuy = ensuredItems.some(i => i.type === 'buy');
  if (hasBuy || monthsSet.size === 0) {
    if (orderMonth && orderMonth.length === 7) {
      monthsSet.add(orderMonth);
    }
  }

  const months = Array.from(monthsSet).sort();
  const today = new Date();
  const thisMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const blocks: InvoiceBlock[] = months.map(monthStr => {
    const [year, month] = monthStr.split("-").map(Number);
    
    // Find start and end date for this block period
    let startDate = "";
    let endDate = "";

    if (order.rentalStartDate) {
      const startClean = order.rentalStartDate.replace(/\//g, "-");
      const startLocal = parseDateLocal(startClean);
      if (startLocal.getFullYear() === year && (startLocal.getMonth() + 1) === month) {
        startDate = order.rentalStartDate.replace(/-/g, "/");
      } else {
        startDate = `${year}/${String(month).padStart(2, "0")}/01`;
      }
    } else {
      startDate = orderDateClean;
    }

    // 課金終了日（返却済み=実返却日 / 未返却で期限超過=本日まで自動延長）。
    const billEnd = billingEndDate(order);
    if (billEnd) {
      const endClean = String(billEnd).replace(/\//g, "-");
      const endLocal = parseDateLocal(endClean);
      if (endLocal.getFullYear() === year && (endLocal.getMonth() + 1) === month) {
        endDate = String(billEnd).replace(/-/g, "/");
      } else {
        const lastDay = new Date(year, month, 0).getDate();
        endDate = `${year}/${String(month).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}`;
      }
    } else {
      endDate = orderDateClean;
    }

    // Calculate actual days in this block for rent items
    let actualDays = 0;
    if (order.rentalStartDate && billEnd) {
      try {
        const blockStart = parseDateLocal(startDate.replace(/\//g, "-"));
        const blockEnd = parseDateLocal(endDate.replace(/\//g, "-"));
        if (!isNaN(blockStart.getTime()) && !isNaN(blockEnd.getTime()) && blockEnd >= blockStart) {
          actualDays = daysBetween(blockStart, blockEnd);
        }
      } catch (e) {}
    }

    // Sum details from items for this specific month
    let rentSubtotal = 0;
    let buySubtotal = 0;
    let guaranteeFee = 0;
    let chargeableDays = 0;
    let tierApplied: 'Price_A' | 'Price_B' = 'Price_A';

    ensuredItems.forEach(item => {
      if (item.type === 'rent') {
        const breakdown = item.monthlyBreakdown?.find(b => b.monthStr === monthStr);
        if (breakdown) {
          rentSubtotal += breakdown.price * item.quantity;
          chargeableDays += breakdown.days;
          if (breakdown.discounted) {
            tierApplied = 'Price_B';
          }
          
          // Guarantee fee applies in the very first rental month block
          const isFirstMonth = item.monthlyBreakdown?.[0]?.monthStr === monthStr;
          if (isFirstMonth && item.guaranteeFeeFlat) {
            guaranteeFee += item.guaranteeFeeFlat;
          }
        }
      } else if (item.type === 'buy') {
        if (monthStr === orderMonth) {
          // calculatedPrice を単価の正とする（管理者の手動上書きを反映。未上書き時は buyPrice と同値）。
          buySubtotal += (Number(item.calculatedPrice ?? item.buyPrice) || 0) * item.quantity;
        }
      }
    });

    const baseSubtotal = rentSubtotal + buySubtotal;

    const block: InvoiceBlock = {
      id: `block-${order.id}-${monthStr}`,
      monthPeriod: monthStr,
      startDate,
      endDate,
      actualDays,
      chargeableDays,
      tierApplied,
      guaranteeFee,
      baseSubtotal,
      subtotal: baseSubtotal,
      tax: 0,
      total: 0,
      // クローズ済み(完了/返却済)注文の動的生成は「未入金(pending)」を既定にする。以前は無条件 paid で、
      // ブロック未永続化のままクローズされた注文（顧客チェックアウト由来・過去データ等）の未収が
      // AR/延滞から silent に消えていた(I2)。過去契約の移行登録だけは AdminRental 側で明示的に
      // paid を付与する（ユーザー裁定: 移行登録=精算済みの履歴）。クローズ済みに accumulating は付けない。
      status: (order.status === "完了" || isFullyReturned(order.status)) ? "pending" : (monthStr >= thisMonthStr ? "accumulating" : "pending"),
      extraCosts: []
    };

    return recalculateInvoiceBlock(block);
  });

  // 保安車両の燃料補給費（満タン返却に満たなかった場合）を最終ブロックに計上する。
  // 給油レシートは order.fuelCharge.receiptPhoto に保存され、請求書 PDF に添付される。
  const fuel = (order as any).fuelCharge;
  // admin が給油費行を削除した(fuelDismissed)場合は再注入しない（弁償費/配送料の dismiss と同じ扱い）。
  if (fuel && Number(fuel.amount) > 0 && blocks.length > 0 && !(order as any).fuelDismissed) {
    const last = blocks[blocks.length - 1];
    last.extraCosts = last.extraCosts || [];
    if (!last.extraCosts.some((e: any) => e.id === "fuel-refill")) {
      last.extraCosts.push({
        id: "fuel-refill",
        note: fuel.note || "燃料補給費（満タン返却不足分）",
        amount: Math.round(Number(fuel.amount)),
        isTaxable: true,
      } as any);
      recalculateInvoiceBlock(last);
    }
  }

  injectCompensationCharge(order, blocks);
  injectDeliveryCharge(order, blocks);

  return blocks;
}

export interface CompensationLine {
  itemId?: string;
  name: string;
  type: "missing" | "broken";
  qty: number;
  unit: number;
  amount: number;
}
export interface CompensationCharge {
  amount: number;
  note: string;
  lines: CompensationLine[];
}

/**
 * itemIssues（紛失・破損）から弁償費を算出する。
 * 単価 = 商品マスタの弁償価格(compensationPrice) ?? 販売価格(buyPrice) ?? 注文明細の buyPrice。
 * 最終検品の確定時に呼び、結果を order.compensationCharge に保存する（価格を確定時点で固定）。
 */
export function computeCompensationCharge(order: any, products: any[]): CompensationCharge | null {
  const issues = Array.isArray(order?.itemIssues) ? order.itemIssues : [];
  if (!issues.length) return null;
  const items = Array.isArray(order?.items) ? order.items : [];
  const lines: CompensationLine[] = [];
  let amount = 0;
  issues.forEach((iss: any) => {
    const qtyReported = Number(iss?.quantity || 0);
    if (qtyReported <= 0) return;
    const item = items.find((i: any) => i && (i.id === iss.itemId || i.name === iss.itemName));
    // 報告数量はレンタル数量を上限にクランプ（過大入力による過剰弁償を防ぐ多層防御）。
    const maxQty = Number(item?.quantity || 0);
    const qty = maxQty > 0 ? Math.min(qtyReported, maxQty) : qtyReported;
    const prod = (products || []).find((p: any) => p && (p.id === iss.itemId || (item && p.name === item.name)));
    const unit = Number(prod?.compensationPrice ?? prod?.buyPrice ?? item?.buyPrice ?? 0);
    if (unit <= 0) return;
    const sub = unit * qty;
    amount += sub;
    lines.push({
      itemId: iss.itemId,
      name: item?.name || prod?.name || iss.itemName || "品目",
      type: iss.type === "broken" ? "broken" : "missing",
      qty,
      unit,
      amount: sub,
    });
  });
  if (amount <= 0) return null;
  const note = "破損・紛失弁償（" + lines.map((l) => `${l.name} ${l.type === "broken" ? "破損" : "紛失"}×${l.qty}`).join("、") + "）";
  return { amount: Math.round(amount), note, lines };
}

/**
 * order.compensationCharge を最終ブロックへ ExtraCost(id="compensation-charge") として注入する。
 * 冪等（既にあれば再追加しない＝admin の金額編集を保持）。order.compensationDismissed なら注入しない（admin 削除を尊重）。
 */
function injectCompensationCharge(order: any, blocks: InvoiceBlock[]): void {
  const comp = (order as any)?.compensationCharge;
  if (!comp || !(Number(comp.amount) > 0)) return;
  if ((order as any)?.compensationDismissed) return;
  if (!blocks.length) return;
  const already = blocks.some((b) => (b.extraCosts || []).some((e: any) => e.id === "compensation-charge"));
  if (already) return;
  const last = blocks[blocks.length - 1];
  last.extraCosts = last.extraCosts || [];
  last.extraCosts.push({
    id: "compensation-charge",
    itemName: "破損・紛失弁償費",
    note: comp.note || "破損・紛失弁償費",
    amount: Math.round(Number(comp.amount)),
    isTaxable: true,
  } as any);
  recalculateInvoiceBlock(last);
}

/**
 * 管理者が入力した配送料(order.delivery)を先頭ブロックへ ExtraCost(id="delivery-fee") として注入する。
 * order.subtotal/total には含まれるのに請求書・PDF へ出ていなかった（請求漏れ）ため、ブロックにも計上する。
 * 冪等（既にあれば再追加しない）。先頭ブロックのみに付け、複数月で二重計上しない。
 */
function injectDeliveryCharge(order: any, blocks: InvoiceBlock[]): void {
  const delivery = Math.round(Number(order?.delivery) || 0);
  if (!(delivery > 0) || !blocks.length) return;
  if ((order as any)?.deliveryDismissed) return; // admin が配送料行を削除したら再計上しない（弁償費と同方針）
  const already = blocks.some((b) => (b.extraCosts || []).some((e: any) => e.id === "delivery-fee"));
  if (already) return;
  const first = blocks[0];
  first.extraCosts = first.extraCosts || [];
  first.extraCosts.push({
    id: "delivery-fee",
    itemName: "配送料",
    note: "配送料",
    amount: delivery,
    isTaxable: true,
  } as any);
  recalculateInvoiceBlock(first);
}
