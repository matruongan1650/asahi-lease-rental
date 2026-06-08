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
 * Chuẩn hoá tên tiếng Nhật: trim, đổi 全角スペース U+3000 → space, gộp khoảng trắng liên tiếp.
 * Tránh việc cùng "田中 一郎" / "田中　一郎" / "田中  一郎" bị chia thành 3 担当者 khác nhau.
 */
function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/　/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface GroupOpts {
  /** Khi truyền monthPeriod (YYYY-MM), chỉ gom các order/担当者/công ty có ít nhất 1 invoiceBlock trong tháng đó */
  monthPeriod?: string;
  /** Chỉ lấy order có companyName này */
  companyName?: string;
}

function safeBlocks(o: any) {
  // getOrGenerateInvoiceBlocks dùng order.items.forEach — phòng trường hợp items === undefined
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

/** Tổng hợp số liệu trong nhiều CompanyGroup (cho 内訳請求書 tổng) */
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
