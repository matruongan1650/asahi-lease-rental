import { getOrGenerateInvoiceBlocks } from "./billing";

export interface RenterGroup {
  personName: string;
  orders: any[];
  subtotal: number;
  tax: number;
  total: number;
  guaranteeFee: number; // 保証料の合計（小計に内包）
}

export interface CompanyGroup {
  companyName: string;
  renters: RenterGroup[];
  subtotal: number;
  tax: number;
  total: number;
  guaranteeFee: number; // 保証料の合計（小計に内包）
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

function companyNameOf(order: any): string {
  return normalizeName(order.companyName || order.customer || order.company || order.customerName);
}

function personNameOf(order: any): string {
  return normalizeName(order.personName || order.employeeName || order.customerName);
}

function orderSubtotal(o: any, monthPeriod?: string): { subtotal: number; tax: number; total: number; guaranteeFee: number; matched: boolean } {
  if (monthPeriod) {
    const blocks = safeBlocks(o);
    const block = blocks.find((b: any) => b.monthPeriod === monthPeriod);
    if (!block) return { subtotal: 0, tax: 0, total: 0, guaranteeFee: 0, matched: false };
    return { subtotal: block.subtotal || 0, tax: block.tax || 0, total: block.total || 0, guaranteeFee: Number(block.guaranteeFee || 0), matched: true };
  }

  const blocks = safeBlocks(o);
  if (blocks.length > 0) {
    return blocks.reduce(
      (acc, block: any) => ({
        subtotal: acc.subtotal + Number(block.subtotal || 0),
        tax: acc.tax + Number(block.tax || 0),
        total: acc.total + Number(block.total || 0),
        guaranteeFee: acc.guaranteeFee + Number(block.guaranteeFee || 0),
        matched: true,
      }),
      { subtotal: 0, tax: 0, total: 0, guaranteeFee: 0, matched: true },
    );
  }

  // ブロックが無い注文は、明細の guaranteeFeeFlat（賃貸品）から保証料を集計する。
  const guaranteeFee = (o.items || [])
    .filter((i: any) => i?.type === "rent")
    .reduce((s: number, i: any) => s + Number(i.guaranteeFeeFlat || 0), 0);
  return {
    subtotal: o.subtotal || 0,
    tax: o.tax || 0,
    total: o.total || 0,
    guaranteeFee,
    matched: true,
  };
}

export function groupOrdersByCompany(orders: any[], opts: GroupOpts = {}): CompanyGroup[] {
  const byCompany = new Map<string, Map<string, any[]>>();

  const filterCompany = opts.companyName ? normalizeName(opts.companyName) : "";

  for (const order of orders) {
    // キャンセル注文は請求対象外（請求書グルーピング・合計に含めない）。
    if (String(order?.status) === "キャンセル") continue;

    const orderCompany = companyNameOf(order);
    // フィルタ比較は表示側(AdminInvoices.companyOf)と同じ「未設定フォールバック後」の名前で行う。
    // 素の空文字と比較すると「(会社名未設定)」を選んだとき何もヒットせず、一覧に請求行があるのに
    // 会社別発行が常に0件で発行不能になる(I7)。
    if (filterCompany && (orderCompany || EMPTY_COMPANY) !== filterCompany) continue;

    const matched = orderSubtotal(order, opts.monthPeriod).matched;
    if (!matched) continue;

    const company = orderCompany || EMPTY_COMPANY;
    const person = personNameOf(order) || EMPTY_PERSON;

    if (!byCompany.has(company)) byCompany.set(company, new Map());
    const personMap = byCompany.get(company)!;
    if (!personMap.has(person)) personMap.set(person, []);
    personMap.get(person)!.push(order);
  }

  const groups: CompanyGroup[] = [];

  for (const [companyName, personMap] of byCompany) {
    const renters: RenterGroup[] = [];
    let cSubtotal = 0, cTax = 0, cTotal = 0, cGuarantee = 0, cCount = 0;

    for (const [personName, ordersOfPerson] of personMap) {
      let rSubtotal = 0, rTax = 0, rTotal = 0, rGuarantee = 0;
      for (const o of ordersOfPerson) {
        const v = orderSubtotal(o, opts.monthPeriod);
        rSubtotal += v.subtotal;
        rTax += v.tax;
        rTotal += v.total;
        rGuarantee += v.guaranteeFee;
      }
      renters.push({
        personName,
        orders: ordersOfPerson,
        subtotal: rSubtotal,
        tax: rTax,
        total: rTotal,
        guaranteeFee: rGuarantee,
      });
      cSubtotal += rSubtotal;
      cTax += rTax;
      cTotal += rTotal;
      cGuarantee += rGuarantee;
      cCount += ordersOfPerson.length;
    }

    groups.push({
      companyName,
      renters: renters.sort((a, b) => a.personName.localeCompare(b.personName, "ja")),
      subtotal: cSubtotal,
      tax: cTax,
      total: cTotal,
      guaranteeFee: cGuarantee,
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
      acc.guaranteeFee += g.guaranteeFee;
      acc.orderCount += g.orderCount;
      acc.renterCount += g.renters.length;
      return acc;
    },
    { subtotal: 0, tax: 0, total: 0, guaranteeFee: 0, orderCount: 0, renterCount: 0 },
  );
}
