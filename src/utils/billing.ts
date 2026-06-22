import { type Product, type CartItem, type Order, type MonthlyBreakdown, type InvoiceBlock, type ExtraCost } from "../types";
import { isVehicleCategory } from "./productUtils";
import { isFullyReturned } from "./orderStatus";

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
  // Always set to 00:00:00 local time
  return new Date(dateStr + 'T00:00:00');
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
  const hasVehicle = (order.items || []).some(
    (i: any) => i && i.type === "rent" && isVehicleCategory(i.category)
  );
  const endDate = billingEndDate(order);
  // 期待される月の集合（レンタル開始日〜課金終了日）。保存済み breakdown がこの全期間を
  // カバーしていない場合（例: 過去開始の長期/さかのぼり契約なのに作成月1か月分しか無い）も再計算する。
  // これが無いと、さかのぼり登録した注文の過去月の請求書が生成されない（作成月のみ・他月が欠落）。
  const expectedMonths = monthsInSpan(order.rentalStartDate, endDate);
  return (order.items || []).map((item: any) => {
    const mb = item?.monthlyBreakdown;
    const storedMonths: string[] = Array.isArray(mb) ? mb.map((b: any) => b?.monthStr).filter(Boolean) : [];
    const spansFull =
      expectedMonths.length > 0 &&
      storedMonths.length === expectedMonths.length &&
      expectedMonths.every((m) => storedMonths.includes(m));
    const needsRecompute = !Array.isArray(mb) || mb.length === 0 || !spansFull;
    if (
      item &&
      item.type === "rent" &&
      needsRecompute &&
      item.rentPrice &&
      order.rentalStartDate &&
      endDate
    ) {
      try {
        const { totalPrice, breakdown, totalBilledDays, totalActualDays } = calculateRentalPrice(
          item.rentPrice,
          order.rentalStartDate,
          endDate,
          hasVehicle,
          isVehicleCategory(item.category),
          item.rentPriceLongTerm
        );
        // 再計算した breakdown と整合するよう、金額・日数も新しい値で上書きする
        //（古い1か月分の calculatedPrice を残すと全期間の breakdown と総額が食い違うため）。
        return {
          ...item,
          monthlyBreakdown: breakdown,
          calculatedPrice: totalPrice,
          rentalDays: totalActualDays,
          billedDays: totalBilledDays,
        };
      } catch {
        return item;
      }
    }
    return item;
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
        const itemPrice = (item.buyPrice || 0) * item.quantity;
        subtotal += itemPrice;
        itemsBreakdown.push({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.buyPrice || 0,
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
    // 弁償費が未計上ならここで注入（キャッシュ済みブロックにも反映。冪等・削除尊重）。
    injectCompensationCharge(order, cached);
    return cached;
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
          buySubtotal += (item.buyPrice || 0) * item.quantity;
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
      status: order.status === "完了" || isFullyReturned(order.status) ? "paid" : (monthStr >= thisMonthStr ? "accumulating" : "pending"),
      extraCosts: []
    };

    return recalculateInvoiceBlock(block);
  });

  // 保安車両の燃料補給費（満タン返却に満たなかった場合）を最終ブロックに計上する。
  // 給油レシートは order.fuelCharge.receiptPhoto に保存され、請求書 PDF に添付される。
  const fuel = (order as any).fuelCharge;
  if (fuel && Number(fuel.amount) > 0 && blocks.length > 0) {
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
