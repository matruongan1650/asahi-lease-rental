import { type Product, type CartItem, type Order, type MonthlyBreakdown, type InvoiceBlock, type ExtraCost } from "../types";
import { isVehicleCategory } from "./productUtils";
import { isFullyReturned } from "./orderStatus";

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
    
    // Tier B Long-term discount applies if cumulative days >= 17 days
    const tier = cumActual >= 17 ? 'B' : 'A';
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
  const tax = Math.floor(subtotal * 0.10);
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
  const hasVehicle = (order.items || []).some(
    (i: any) => i && i.type === "rent" && isVehicleCategory(i.category)
  );
  const endDate = billingEndDate(order);
  return (order.items || []).map((item: any) => {
    if (
      item &&
      item.type === "rent" &&
      (!item.monthlyBreakdown || item.monthlyBreakdown.length === 0) &&
      item.rentPrice &&
      order.rentalStartDate &&
      endDate
    ) {
      try {
        const { totalPrice, breakdown } = calculateRentalPrice(
          item.rentPrice,
          order.rentalStartDate,
          endDate,
          hasVehicle,
          isVehicleCategory(item.category),
          item.rentPriceLongTerm
        );
        return { ...item, monthlyBreakdown: breakdown, calculatedPrice: item.calculatedPrice ?? totalPrice };
      } catch {
        return item;
      }
    }
    return item;
  });
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
      const orderMonth = order.date?.split('•')[0]?.trim().replace(/\//g, "-").slice(0, 7) || "";
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
  const tax = Math.floor(totalTaxable * 0.1);
  
  block.subtotal = block.baseSubtotal + block.guaranteeFee + extraCosts.reduce((sum, e) => sum + e.amount, 0);
  block.tax = tax;
  block.total = totalTaxable + nonTaxableExtra + tax;
  return block;
}

/**
 * Generates monthly invoice blocks dynamically from order items and dates if not already present.
 */
export function getOrGenerateInvoiceBlocks(order: Order): InvoiceBlock[] {
  if (order.invoiceBlocks && order.invoiceBlocks.length > 0) {
    return order.invoiceBlocks.map((block) => {
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
  const orderMonth = orderDateClean.replace(/\//g, "-").slice(0, 7); // e.g. "2026-06"

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

  return blocks;
}
