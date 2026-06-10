import { getOrGenerateInvoiceBlocks } from "./billing";

export interface RenterGroup {
  personName: string;
  orders: any[];
  subtotal: number;
  tax: number;
  total: number;
}

export interface CompanyGroup {
  companyName: string;
  renters: RenterGroup[];
  subtotal: number;
  tax: number;
  total: number;
  orderCount: number;
}

const EMPTY_COMPANY = "(会社名未設定)";
const EMPTY_PERSON = "(担当者未設定)";

/**
 * 日本語名を正規化します：トリム、全角スペース（U+3000）の半角スペース化、および連続するスペースの統合。
 * 「田中 一郎」、「田中　一郎」、「田中  一郎」が別々の担当者として扱われるのを防ぎます。
 */
function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/　/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface GroupOpts {
  /** monthPeriod (YYYY-MM) が指定された場合、その月に少なくとも1つの invoiceBlock を持つ注文/担当者/会社のみを収集します */
  monthPeriod?: string;
  /** この会社名の注文のみを取得します */
  companyName?: string;
}

function safeBlocks(o: any) {
  // getOrGenerateInvoiceBlocks は order.items.forEach を使用するため、items が undefined の場合に備えます
  if (!o || !Array.isArray(o.items)) return [];
  try { return getOrGenerateInvoiceBlocks(o); }
  catch { return []; }
}

function orderSubtotal(o: any, monthPeriod?: string): { subtotal: number; tax: number; total: number; matched: boolean } {
  if (monthPeriod) {
    const blocks = safeBlocks(o);
    const block = blocks.find((b: any) => b.monthPeriod === monthPeriod);
    if (!block) return { subtotal: 0, tax: 0, total: 0, matched: false };
    return { subtotal: block.subtotal || 0, tax: block.tax || 0, total: block.total || 0, matched: true };
  }
  return {
    subtotal: o.subtotal || 0,
    tax: o.tax || 0,
    total: o.total || 0,
    matched: true,
  };
}

export function groupOrdersByCompany(orders: any[], opts: GroupOpts = {}): CompanyGroup[] {
  const byCompany = new Map<string, Map<string, any[]>>();

  const filterCompany = opts.companyName ? normalizeName(opts.companyName) : "";

  for (const order of orders) {
    const orderCompany = normalizeName(order.companyName);
    if (filterCompany && orderCompany !== filterCompany) continue;

    const matched = orderSubtotal(order, opts.monthPeriod).matched;
    if (!matched) continue;

    const company = orderCompany || EMPTY_COMPANY;
    const person = normalizeName(order.personName) || EMPTY_PERSON;

    if (!byCompany.has(company)) byCompany.set(company, new Map());
    const personMap = byCompany.get(company)!;
    if (!personMap.has(person)) personMap.set(person, []);
    personMap.get(person)!.push(order);
  }

  const groups: CompanyGroup[] = [];

  for (const [companyName, personMap] of byCompany) {
    const renters: RenterGroup[] = [];
    let cSubtotal = 0, cTax = 0, cTotal = 0, cCount = 0;

    for (const [personName, ordersOfPerson] of personMap) {
      let rSubtotal = 0, rTax = 0, rTotal = 0;
      for (const o of ordersOfPerson) {
        const v = orderSubtotal(o, opts.monthPeriod);
        rSubtotal += v.subtotal;
        rTax += v.tax;
        rTotal += v.total;
      }
      renters.push({
        personName,
        orders: ordersOfPerson,
        subtotal: rSubtotal,
        tax: rTax,
        total: rTotal,
      });
      cSubtotal += rSubtotal;
      cTax += rTax;
      cTotal += rTotal;
      cCount += ordersOfPerson.length;
    }

    groups.push({
      companyName,
      renters: renters.sort((a, b) => a.personName.localeCompare(b.personName, "ja")),
      subtotal: cSubtotal,
      tax: cTax,
      total: cTotal,
      orderCount: cCount,
    });
  }

  return groups.sort((a, b) => a.companyName.localeCompare(b.companyName, "ja"));
}

/** 複数の CompanyGroup の数値を集計します（内訳請求書合計用） */
export function aggregateTotals(groups: CompanyGroup[]) {
  return groups.reduce(
    (acc, g) => {
      acc.subtotal += g.subtotal;
      acc.tax += g.tax;
      acc.total += g.total;
      acc.orderCount += g.orderCount;
      acc.renterCount += g.renters.length;
      return acc;
    },
    { subtotal: 0, tax: 0, total: 0, orderCount: 0, renterCount: 0 },
  );
}
