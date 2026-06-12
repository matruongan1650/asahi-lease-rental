import { CompanyGroup, RenterGroup, aggregateTotals } from "./rentalInvoiceGrouping";
import { A4_PX_WIDTH, A4_PX_HEIGHT, renderSectionsToPdf, mountOffscreen } from "./pdfMultiPage";
import { getOrGenerateInvoiceBlocks } from "./billing";

const ISSUER = {
  name: "アサヒリース 株式会社",
  zip: "〒194-0021",
  address1: "東京都町田市中町1-30-8 菅井町田ビル3-Ｄ",
  tel: "042-709-3221",
  fax: "042-709-3222",
  regNo: "T1234567890123",
};

const labelDate = () => new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
function todayShort() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function generateInvoiceNo(prefix: string, seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  const y = new Date().getFullYear();
  return `${prefix}-${y}-${String(Math.abs(h) % 100000).padStart(5, "0")}`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

function thStyle(extra = "") {
  return `border:1px solid #94a3b8;background:#f1f5f9;padding:6px 8px;font-weight:bold;text-align:center;font-size:11px;${extra}`;
}
function tdStyle(extra = "") {
  return `border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;${extra}`;
}

function totalsRow(label: string, value: number, emphasize = false) {
  return `
    <div style="display:flex;justify-content:space-between;padding:8px 12px;${emphasize ? "background:#1e293b;color:#fff;font-weight:bold;font-size:13px;" : "font-size:11px;"}">
      <span>${escapeHtml(label)}</span>
      <span style="font-family:ui-monospace,'SFMono-Regular','Consolas',monospace;">¥${value.toLocaleString()}</span>
    </div>
  `;
}

function pageBaseStyle(): string {
  return `
    width:${A4_PX_WIDTH}px;
    height:${A4_PX_HEIGHT}px;
    background:#ffffff;
    color:#0f172a;
    padding:48px 56px;
    font-family:'Noto Sans JP',sans-serif;
    font-size:12px;
    box-sizing:border-box;
    line-height:1.55;
    position:relative;
    overflow:hidden;
    display:flex;
    flex-direction:column;
  `;
}

function topHeaderHtml({ title, companyName, invoiceNo, periodLabel }: { title: string; companyName: string; invoiceNo: string; periodLabel?: string }) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
      <div style="flex:1;">
        <h1 style="font-size:26px;font-weight:900;letter-spacing:6px;border-bottom:3px solid #0f172a;padding-bottom:6px;margin:0;display:inline-block;">${escapeHtml(title)}</h1>
        <div style="margin-top:16px;font-size:18px;font-weight:bold;">
          <span style="border-bottom:2px solid #0f172a;padding:0 8px 4px 8px;">${escapeHtml(companyName)} 御中</span>
        </div>
        <div style="margin-top:12px;font-size:11px;color:#475569;">下記の通りご請求申し上げます。</div>
        ${periodLabel ? `<div style="margin-top:4px;font-size:11px;color:#475569;">対象期間: <span style="font-weight:bold;color:#0f172a;">${escapeHtml(periodLabel)}</span></div>` : ""}
      </div>
      <div style="font-size:10px;text-align:right;line-height:1.7;min-width:240px;flex-shrink:0;">
        <div>請求書番号: <span style="font-weight:bold;color:#0f172a;font-family:ui-monospace,monospace;">${escapeHtml(invoiceNo)}</span></div>
        <div>発行日: ${escapeHtml(labelDate())}</div>
        <div style="margin-top:8px;text-align:left;display:inline-block;border-left:3px solid #3A4DE8;padding-left:8px;">
          <div style="font-weight:bold;font-size:13px;letter-spacing:1px;">${escapeHtml(ISSUER.name)}</div>
          <div style="color:#475569;font-size:9.5px;">${escapeHtml(ISSUER.zip)}</div>
          <div style="color:#475569;font-size:9.5px;">${escapeHtml(ISSUER.address1)}</div>
          <div style="color:#475569;font-size:9.5px;">TEL: ${escapeHtml(ISSUER.tel)} / FAX: ${escapeHtml(ISSUER.fax)}</div>
          <div style="color:#475569;font-size:9.5px;">登録番号: ${escapeHtml(ISSUER.regNo)}</div>
        </div>
      </div>
    </div>
  `;
}

function computeRenterPeriod(renter: RenterGroup): string {
  const starts = renter.orders.map((o: any) => o.rentalStartDate).filter(Boolean) as string[];
  const ends = renter.orders.map((o: any) => o.rentalEndDate).filter(Boolean) as string[];
  if (starts.length === 0 || ends.length === 0) return "";
  starts.sort();
  ends.sort();
  return `${starts[0]} 〜 ${ends[ends.length - 1]}`;
}

export interface PrintItem {
  name: string;
  detail: string;
  quantity: number | string;
  unitPrice: number;
  lineTotal: number;
  typeLabel: string;
}

export function getPrintItems(order: any, monthPeriod?: string): PrintItem[] {
  const items: PrintItem[] = [];
  
  if (monthPeriod) {
    const blocks = getOrGenerateInvoiceBlocks(order);
    const block = blocks.find((b: any) => b.monthPeriod === monthPeriod);
    if (!block) return [];

    order.items?.forEach((it: any) => {
      if (it.type === 'buy') {
        const orderMonth = order.date?.split('•')[0]?.trim().slice(0, 7) || "";
        if (orderMonth === monthPeriod) {
          items.push({
            name: it.name || "-",
            detail: "販売品",
            quantity: it.quantity ?? 1,
            unitPrice: it.buyPrice || 0,
            lineTotal: (it.buyPrice || 0) * (it.quantity ?? 1),
            typeLabel: "販売"
          });
        }
      } else if (it.type === 'rent') {
        const breakdown = it.monthlyBreakdown?.find((b: any) => b.monthStr === monthPeriod);
        if (breakdown) {
          const rentalFee = breakdown.price * (it.quantity ?? 1);
          items.push({
            name: it.name || "-",
            detail: `${breakdown.days}日間`,
            quantity: it.quantity ?? 1,
            unitPrice: breakdown.price, // unit price for this period
            lineTotal: rentalFee,
            typeLabel: "賃貸"
          });

          const isFirstMonth = it.monthlyBreakdown?.[0]?.monthStr === monthPeriod;
          if (isFirstMonth && it.guaranteeFeeFlat) {
            items.push({
              name: `${it.name || "-"} (基本補償料)`,
              detail: "初回のみ",
              quantity: it.quantity ?? 1,
              unitPrice: it.guaranteeFeeFlat / (it.quantity ?? 1),
              lineTotal: it.guaranteeFeeFlat,
              typeLabel: "手数料"
            });
          }
        }
      }
    });

    if (block.extraCosts) {
      block.extraCosts.forEach((ec: any) => {
        items.push({
          name: ec.note || "追加費用",
          detail: ec.id === "fuel-refill" ? "燃料補給" : "その他",
          quantity: 1,
          unitPrice: ec.amount,
          lineTotal: ec.amount,
          typeLabel: "手数料"
        });
      });
    }

  } else {
    // Overall invoice
    order.items?.forEach((it: any) => {
      const price = it.calculatedPrice ?? it.buyPrice ?? 0;
      const detail = it.type === "rent"
        ? `${it.rentalDays ?? "-"}日間` + (it.billedDays && it.rentalDays && it.billedDays > it.rentalDays ? ` (請求${it.billedDays}日)` : "")
        : "販売品";
        
      items.push({
        name: it.name || "-",
        detail,
        quantity: it.quantity ?? 1,
        unitPrice: price,
        lineTotal: price * (it.quantity ?? 1),
        typeLabel: it.type === "rent" ? "賃貸" : "販売"
      });

      if (it.type === 'rent' && it.guaranteeFeeFlat) {
        items.push({
          name: `${it.name || "-"} (基本補償料)`,
          detail: "初回のみ",
          quantity: it.quantity ?? 1,
          unitPrice: it.guaranteeFeeFlat / (it.quantity ?? 1),
          lineTotal: it.guaranteeFeeFlat,
          typeLabel: "手数料"
        });
      }
    });

    const blocks = getOrGenerateInvoiceBlocks(order);
    blocks.forEach((b: any) => {
      if (b.extraCosts) {
        b.extraCosts.forEach((ec: any) => {
          items.push({
            name: ec.note || "追加費用",
            detail: `(${b.monthPeriod}) ${ec.id === "fuel-refill" ? "燃料補給" : "その他"}`,
            quantity: 1,
            unitPrice: ec.amount,
            lineTotal: ec.amount,
            typeLabel: "手数料"
          });
        });
      }
    });
  }

  return items;
}

export interface PrintRow {
  type: "order-header" | "item-row";
  order: any;
  item?: PrintItem;
  index?: number;
  isContinuation?: boolean;
}

/**
 * Split order rows into multiple pages using printable height budget.
 */
export function paginateRows(rows: PrintRow[], isFirstPageOfRenter: boolean): PrintRow[][] {
  const pages: PrintRow[][] = [];
  let currentPageRows: PrintRow[] = [];
  
  let i = 0;
  let isPage1 = isFirstPageOfRenter;
  
  while (i < rows.length) {
    const isFirst = pages.length === 0 && isPage1;
    // Page 1 has top header + renter info: height ~385px
    // Continuation pages have smaller header: height ~95px
    const headerHeight = isFirst ? 385 : 95;
    const availableHeight = 1027 - headerHeight;
    
    let currentHeight = 0;
    
    // Check if we split an order and need a continuation header
    let prevRow: PrintRow | null = null;
    if (pages.length > 0) {
      const prevPage = pages[pages.length - 1];
      prevRow = prevPage[prevPage.length - 1];
    }
    
    let nextRow = rows[i];
    let needsContinuation = false;
    if (prevRow && nextRow && nextRow.type === "item-row" && nextRow.order.id === prevRow.order.id) {
      needsContinuation = true;
      currentHeight += 35; // order continuation header row height
    }
    
    if (needsContinuation) {
      currentPageRows.push({
        type: "order-header",
        order: nextRow.order,
        isContinuation: true
      });
    }
    
    while (i < rows.length) {
      const row = rows[i];
      const rowHeight = row.type === "order-header" ? 35 : 45;
      
      const isLastRow = (i === rows.length - 1);
      const totalsNeeded = isLastRow ? 240 : 0;
      
      if (currentHeight + rowHeight + totalsNeeded <= availableHeight) {
        currentPageRows.push(row);
        currentHeight += rowHeight;
        i++;
      } else {
        if (currentPageRows.length === 0 || (currentPageRows.length === 1 && needsContinuation)) {
          // Force fit at least one row to prevent infinite loop
          currentPageRows.push(row);
          currentHeight += rowHeight;
          i++;
        }
        break;
      }
    }
    
    pages.push(currentPageRows);
    currentPageRows = [];
    isPage1 = false;
  }
  
  return pages;
}

/**
 * Render Company Summary Cover Page (表紙)
 */
export function renderCompanyCoverPage(
  group: CompanyGroup,
  overallPageCount: number,
  monthPeriod?: string,
  overallPageIndex = 0
): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("style", pageBaseStyle());

  const invoiceNoSeed = `${group.companyName}_cover_${monthPeriod ?? ""}`;
  const invoiceNo = generateInvoiceNo("INV-C", invoiceNoSeed);
  const periodLabel = monthPeriod ? `${monthPeriod.replace("-", "/")}分` : "全期間分";

  const rows = group.renters
    .map((r, idx) => `
      <tr>
        <td style="${tdStyle('text-align:center;')}">${idx + 1}</td>
        <td style="${tdStyle('font-weight:600;')}">${escapeHtml(r.personName)} 様</td>
        <td style="${tdStyle('text-align:center;')}">${r.orders.length} 件</td>
        <td style="${tdStyle('text-align:right;font-family:ui-monospace,monospace;font-weight:600;')}">¥${r.total.toLocaleString()}</td>
      </tr>
    `)
    .join("");

  host.innerHTML = `
    <!-- Top Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
      <div style="flex:1;">
        <h1 style="font-size:26px;font-weight:900;letter-spacing:6px;border-bottom:3px solid #0f172a;padding-bottom:6px;margin:0;display:inline-block;">請求書</h1>
        <div style="margin-top:16px;font-size:18px;font-weight:bold;">
          <span style="border-bottom:2px solid #0f172a;padding:0 8px 4px 8px;">${escapeHtml(group.companyName)} 御中</span>
        </div>
        <div style="margin-top:12px;font-size:11px;color:#475569;">下記の通りご請求申し上げます。</div>
        <div style="margin-top:4px;font-size:11px;color:#475569;">対象期間: <span style="font-weight:bold;color:#0f172a;">${escapeHtml(periodLabel)}</span></div>
      </div>
      <div style="font-size:10px;text-align:right;line-height:1.7;min-width:240px;flex-shrink:0;">
        <div>請求書番号: <span style="font-weight:bold;color:#0f172a;font-family:ui-monospace,monospace;">${escapeHtml(invoiceNo)}</span></div>
        <div>発行日: ${escapeHtml(labelDate())}</div>
        <div style="margin-top:8px;text-align:left;display:inline-block;border-left:3px solid #3A4DE8;padding-left:8px;">
          <div style="font-weight:bold;font-size:13px;letter-spacing:1px;">${escapeHtml(ISSUER.name)}</div>
          <div style="color:#475569;font-size:9.5px;">${escapeHtml(ISSUER.zip)}</div>
          <div style="color:#475569;font-size:9.5px;">${escapeHtml(ISSUER.address1)}</div>
          <div style="color:#475569;font-size:9.5px;">TEL: ${escapeHtml(ISSUER.tel)} / FAX: ${escapeHtml(ISSUER.fax)}</div>
          <div style="color:#475569;font-size:9.5px;">登録番号: ${escapeHtml(ISSUER.regNo)}</div>
        </div>
      </div>
    </div>

    <!-- Summary Total Block -->
    <div style="border:1.5px solid #0f172a;background:#f8fafc;padding:14px;margin-bottom:20px;border-radius:4px;">
      <h2 style="margin:0;font-size:20px;font-weight:800;color:#1e3a8a;display:flex;justify-content:space-between;align-items:center;">
        <span>ご請求金額：</span>
        <span style="font-family:ui-monospace,monospace;font-size:24px;">¥${group.total.toLocaleString()} -</span>
      </h2>
      <div style="margin-top:6px;font-size:10.5px;color:#475569;display:flex;justify-content:flex-end;gap:16px;">
        <span>小計 (税抜): ¥${group.subtotal.toLocaleString()}</span>
        <span>消費税 (10%): ¥${group.tax.toLocaleString()}</span>
      </div>
    </div>

    <!-- Renter List Table -->
    <div style="flex:1;">
      <h3 style="font-size:11.5px;font-weight:bold;color:#334155;margin-bottom:6px;border-left:3px solid #1e3a8a;padding-left:8px;">ご請求内訳（担当者別）</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr>
            <th style="${thStyle('width:50px;')}">No.</th>
            <th style="${thStyle('text-align:left;')}">ご担当者名</th>
            <th style="${thStyle('width:120px;')}">注文件数</th>
            <th style="${thStyle('width:160px;text-align:right;')}">金額（税込）</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="background:#f1f5f9;font-weight:bold;">
            <td colspan="2" style="${tdStyle('text-align:right;')}">合計</td>
            <td style="${tdStyle('text-align:center;')}">${group.orderCount} 件</td>
            <td style="${tdStyle('text-align:right;font-family:ui-monospace,monospace;')}">¥${group.total.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Bank Details and Footer -->
    <div>
      <div style="font-size:9.5px;color:#64748b;line-height:1.6;margin-bottom:10px;">
        ※ お支払いは月末締め翌月末払いでお願いいたします。<br/>
        ※ 振込手数料はお客様にてご負担ください。<br/>
        ※ 本書はインボイス制度の適格請求書を兼ねます。
      </div>
      <div style="font-size:9.5px;border:1px solid #cbd5e1;border-radius:6px;padding:8px 12px;line-height:1.6;background:#fbfbfb;">
        <div style="font-weight:bold;color:#0f172a;margin-bottom:2px;">お振込先</div>
        <div>〇〇銀行 〇〇支店 (普) 1234567 / 口座名義：アサヒリース株式会社</div>
      </div>
      <div style="position:absolute;bottom:20px;right:56px;font-size:10px;color:#64748b;font-family:ui-monospace,monospace;">
        ページ ${overallPageIndex + 1} / ${overallPageCount}
      </div>
    </div>
  `;

  return host;
}

export interface RenterInvoicePageOpts {
  mode: "company-invoice" | "renter-invoice" | "order-invoice" | "breakdown-detail";
  companyName: string;
  renter: RenterGroup;
  companyTotal?: CompanyGroup;
  pageRows: PrintRow[];
  pageIndex: number;
  pageCount: number;
  overallPageIndex: number;
  overallPageCount: number;
  monthPeriod?: string;
}

/**
 * Render a single paginated page of detailed items for a renter.
 */
export function renderRenterInvoicePage(opts: RenterInvoicePageOpts): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("style", pageBaseStyle());

  const showFullHeader = opts.pageIndex === 0 && (opts.mode === "renter-invoice" || opts.mode === "order-invoice");
  const showCoverHeader = opts.pageIndex === 0 && (opts.mode === "company-invoice" || opts.mode === "breakdown-detail");

  const invoiceNoSeed = `${opts.companyName}_${opts.renter.personName}_${opts.renter.orders[0]?.id ?? ""}_${opts.monthPeriod ?? ""}`;
  const invoiceNo = generateInvoiceNo(opts.mode === "order-invoice" ? "ORD" : "INV", invoiceNoSeed);

  const periodLabel = opts.monthPeriod
    ? `${opts.monthPeriod.replace("-", "/")}分`
    : computeRenterPeriod(opts.renter);

  // Render headers
  let headerHtml = "";
  if (showFullHeader) {
    headerHtml = topHeaderHtml({
      title: "請求書",
      companyName: opts.companyName,
      invoiceNo,
      periodLabel
    });
  } else if (showCoverHeader) {
    headerHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #3A4DE8;padding-bottom:8px;margin-bottom:14px;">
        <div>
          <h2 style="font-size:18px;font-weight:800;color:#1e3a8a;margin:0;">請求書（内訳明細）</h2>
          <div style="font-size:12px;font-weight:bold;color:#475569;margin-top:2px;">${escapeHtml(opts.companyName)} 御中</div>
        </div>
        <div style="font-size:10px;text-align:right;color:#475569;line-height:1.6;min-width:240px;flex-shrink:0;">
          <div>請求書番号: <span style="font-family:ui-monospace,monospace;">${escapeHtml(invoiceNo)}</span></div>
          ${periodLabel ? `<div>対象期間: ${escapeHtml(periodLabel)}</div>` : ""}
        </div>
      </div>
    `;
  } else {
    // Continuation Page Header
    headerHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #cbd5e1;padding-bottom:6px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:bold;color:#475569;">
          請求書（内訳） - ${escapeHtml(opts.companyName)} 御中
        </div>
        <div style="font-size:10px;color:#64748b;font-family:ui-monospace,monospace;">
          担当者内訳: ${opts.pageIndex + 1} / ${opts.pageCount}
        </div>
      </div>
    `;
  }

  // Renter sub-header (only on renter's first page)
  let renterHeaderHtml = "";
  if (opts.pageIndex === 0) {
    renterHeaderHtml = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;border-bottom:1px dashed #cbd5e1;padding-bottom:8px;">
        <div>
          <div style="font-size:10px;color:#475569;font-weight:bold;letter-spacing:1px;">発注担当者</div>
          <div style="font-size:14px;font-weight:bold;margin-top:2px;">${escapeHtml(opts.renter.personName)} 様</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;color:#475569;">対象注文: ${opts.renter.orders.length}件</div>
          <div style="margin-top:2px;font-size:12px;font-weight:bold;color:#1e3a8a;">
            担当者合計: <span style="font-family:ui-monospace,monospace;font-size:13px;margin-left:4px;">¥${opts.renter.total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    `;
  } else {
    renterHeaderHtml = `
      <div style="font-size:10.5px;color:#475569;margin-bottom:8px;display:flex;justify-content:space-between;">
        <span>担当者: <strong>${escapeHtml(opts.renter.personName)} 様</strong> (続き)</span>
      </div>
    `;
  }

  // Table rows HTML
  const tableRowsHtml = opts.pageRows.map(row => {
    if (row.type === "order-header") {
      const o = row.order;
      const label = row.isContinuation ? `${o.orderNumber} (続き)` : o.orderNumber;
      const duration = `${o.rentalStartDate || "-"} 〜 ${o.rentalEndDate || "-"}`;
      return `
        <tr style="background:#eff6ff;">
          <td colspan="6" style="${tdStyle('font-weight:bold;color:#1e3a8a;')}">
            <span style="color:#64748b;">注文日時</span>
            <span style="font-family:ui-monospace,monospace;margin-left:4px;margin-right:12px;">${escapeHtml(o.date || "-")}</span>
            <span style="color:#64748b;">伝票番号</span>
            <span style="font-family:ui-monospace,monospace;margin-left:6px;">${escapeHtml(label || "-")}</span>
            <span style="margin-left:12px;color:#64748b;">現場</span> ${escapeHtml(o.siteName || "-")}
            <span style="margin-left:12px;color:#64748b;">工事No</span> ${escapeHtml(o.constructionNumber || "-")}
            <span style="margin-left:12px;color:#64748b;">期間</span> ${escapeHtml(duration)}
          </td>
        </tr>
      `;
    } else {
      const it = row.item!;
      const idx = row.index!;
      return `
        <tr>
          <td style="${tdStyle('text-align:center;')}">${idx + 1}</td>
          <td style="${tdStyle()}">
            <div style="font-weight:600;">${escapeHtml(it.name)}</div>
            <div style="font-size:10px;color:#64748b;">${escapeHtml(it.detail)}</div>
          </td>
          <td style="${tdStyle('text-align:center;')}">${it.quantity}</td>
          <td style="${tdStyle('text-align:right;font-family:ui-monospace,monospace;')}">¥${Number(it.unitPrice).toLocaleString()}</td>
          <td style="${tdStyle('text-align:right;font-weight:600;font-family:ui-monospace,monospace;')}">¥${Number(it.lineTotal).toLocaleString()}</td>
          <td style="${tdStyle('text-align:center;color:#64748b;')}">${it.typeLabel}</td>
        </tr>
      `;
    }
  }).join("");

  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      <thead>
        <tr>
          <th style="${thStyle('width:36px;')}">No.</th>
          <th style="${thStyle('text-align:left;')}">商品 / 内容</th>
          <th style="${thStyle('width:54px;')}">数量</th>
          <th style="${thStyle('width:90px;')}">単価</th>
          <th style="${thStyle('width:100px;')}">金額</th>
          <th style="${thStyle('width:54px;')}">区分</th>
        </tr>
      </thead>
      <tbody>${tableRowsHtml}</tbody>
    </table>
  `;

  // Totals & Bank details (only on final page of this renter)
  const isLastPageOfRenter = opts.pageIndex === opts.pageCount - 1;
  let totalsHtml = "";
  if (isLastPageOfRenter) {
    totalsHtml = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:8px;gap:24px;">
        <div style="flex:1;font-size:9px;color:#64748b;line-height:1.6;">
          ※ お支払いは月末締め翌月末払いでお願いいたします。<br/>
          ※ 振込手数料はお客様にてご負担ください。<br/>
          ※ 本書はインボイス制度の適格請求書を兼ねます。
        </div>
        <div style="width:240px;border:1.5px solid #0f172a;flex-shrink:0;">
          ${totalsRow("小計", opts.renter.subtotal)}
          ${totalsRow("消費税 (10%)", opts.renter.tax)}
          ${totalsRow("担当者合計", opts.renter.total, true)}
          ${opts.companyTotal ? `<div style="border-top:1px dashed #94a3b8;padding:6px 12px;font-size:9px;color:#475569;display:flex;justify-content:space-between;"><span>会社合計参考</span><span style="font-weight:bold;color:#0f172a;font-family:ui-monospace,monospace;">¥${opts.companyTotal.total.toLocaleString()}</span></div>` : ""}
        </div>
      </div>
      <div style="margin-top:8px;font-size:9.5px;border:1px solid #cbd5e1;border-radius:6px;padding:6px 10px;line-height:1.5;background:#fbfbfb;">
        <div style="font-weight:bold;color:#0f172a;margin-bottom:2px;">お振込先</div>
        <div>〇〇銀行 〇〇支店 (普) 1234567 / 口座名義：アサヒリース株式会社</div>
      </div>
    `;
  }

  host.innerHTML = `
    ${headerHtml}
    ${renterHeaderHtml}
    <div style="flex:1;">
      ${tableHtml}
    </div>
    ${totalsHtml}
    <div style="position:absolute;bottom:20px;right:56px;font-size:10px;color:#64748b;font-family:ui-monospace,monospace;display:flex;gap:12px;">
      <span>担当者内訳: ${opts.pageIndex + 1} / ${opts.pageCount}</span>
      <span>|</span>
      <span>全体ページ: ${opts.overallPageIndex + 1} / ${opts.overallPageCount}</span>
    </div>
  `;

  return host;
}

export function renderBreakdownSummary(groups: CompanyGroup[], overallPageCount: number, monthPeriod?: string): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("style", pageBaseStyle());

  const total = aggregateTotals(groups);

  host.innerHTML = `
    ${topHeaderHtml({
      title: "内訳請求書",
      companyName: "全取引先合計",
      invoiceNo: generateInvoiceNo("AGG", String(total.total) + (monthPeriod ?? "")),
      periodLabel: monthPeriod ? `${monthPeriod.replace("-", "/")}分` : undefined,
    })}

    <div style="margin-bottom:18px;font-size:12px;">
      対象 ${groups.length} 社 / 担当者 ${total.renterCount} 名 / 注文 ${total.orderCount} 件分の請求金額を取りまとめてご請求申し上げます。
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr>
          <th style="${thStyle('width:40px;')}">No.</th>
          <th style="${thStyle('text-align:left;')}">会社名 / 担当者</th>
          <th style="${thStyle('width:70px;')}">件数</th>
          <th style="${thStyle('width:100px;')}">小計</th>
          <th style="${thStyle('width:100px;')}">消費税</th>
          <th style="${thStyle('width:120px;background:#dbeafe;')}">合計 (税込)</th>
        </tr>
      </thead>
      <tbody>
        ${groups.flatMap((g, gi) => [
          `<tr style="background:#f8fafc;">
             <td style="${tdStyle('text-align:center;font-weight:bold;')}">${gi + 1}</td>
             <td style="${tdStyle('font-weight:bold;')}">${escapeHtml(g.companyName)}</td>
             <td style="${tdStyle('text-align:center;')}">${g.orderCount}</td>
             <td style="${tdStyle('text-align:right;font-family:ui-monospace,monospace;')}">¥${g.subtotal.toLocaleString()}</td>
             <td style="${tdStyle('text-align:right;font-family:ui-monospace,monospace;')}">¥${g.tax.toLocaleString()}</td>
             <td style="${tdStyle('text-align:right;font-weight:bold;background:#dbeafe;font-family:ui-monospace,monospace;')}">¥${g.total.toLocaleString()}</td>
           </tr>`,
          ...g.renters.map(r => `
            <tr>
              <td style="${tdStyle()}"></td>
              <td style="${tdStyle('padding-left:32px;color:#475569;')}">└ ${escapeHtml(r.personName)}</td>
              <td style="${tdStyle('text-align:center;')}">${r.orders.length}</td>
              <td style="${tdStyle('text-align:right;font-family:ui-monospace,monospace;')}">¥${r.subtotal.toLocaleString()}</td>
              <td style="${tdStyle('text-align:right;font-family:ui-monospace,monospace;')}">¥${r.tax.toLocaleString()}</td>
              <td style="${tdStyle('text-align:right;font-family:ui-monospace,monospace;')}">¥${r.total.toLocaleString()}</td>
            </tr>`),
        ]).join("")}
        <tr style="font-weight:bold;">
          <td colspan="2" style="${tdStyle('text-align:right;background:#0f172a;color:#fff;')}">総合計</td>
          <td style="${tdStyle('text-align:center;background:#0f172a;color:#fff;')}">${total.orderCount}</td>
          <td style="${tdStyle('text-align:right;background:#0f172a;color:#fff;font-family:ui-monospace,monospace;')}">¥${total.subtotal.toLocaleString()}</td>
          <td style="${tdStyle('text-align:right;background:#0f172a;color:#fff;font-family:ui-monospace,monospace;')}">¥${total.tax.toLocaleString()}</td>
          <td style="${tdStyle('text-align:right;background:#0f172a;color:#fff;font-family:ui-monospace,monospace;')}">¥${total.total.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:18px;font-size:10px;color:#475569;line-height:1.8;">
      ※ 次ページ以降、各取引先・担当者ごとの明細を綴じております。<br/>
      ※ 担当者ごとに改ページ、各担当者の明細が A4 1枚に収まらない場合は自動的に次ページへ続きます。
    </div>

    <div style="position:absolute;bottom:20px;right:56px;font-size:10px;color:#64748b;font-family:ui-monospace,monospace;">
      ページ 1 / ${overallPageCount}
    </div>
  `;

  return host;
}

// ============================================================
// High-level issuer helpers
// ============================================================

export async function issueOrderInvoice(order: any) {
  const renter: RenterGroup = {
    personName: order.personName?.trim() || "(担当者未設定)",
    orders: [order],
    subtotal: order.subtotal || 0,
    tax: order.tax || 0,
    total: order.total || 0,
  };

  const rows: PrintRow[] = [{ type: "order-header", order }];
  const pItems = getPrintItems(order);
  pItems.forEach((it, idx) => {
    rows.push({ type: "item-row", order, item: it, index: idx });
  });

  const pages = paginateRows(rows, true);
  const totalPages = pages.length;

  const nodes = pages.map((pageRows, pi) =>
    renderRenterInvoicePage({
      mode: "order-invoice",
      companyName: order.companyName?.trim() || "(会社名未設定)",
      renter,
      pageRows,
      pageIndex: pi,
      pageCount: pages.length,
      overallPageIndex: pi,
      overallPageCount: totalPages,
    })
  );

  const cleanup = mountOffscreen(nodes);
  try {
    await renderSectionsToPdf(nodes, `請求書_${order.orderNumber || "no-num"}.pdf`);
  } finally {
    cleanup();
  }
}

export async function issueRenterInvoice(companyName: string, renter: RenterGroup, monthPeriod?: string) {
  const rows: PrintRow[] = renter.orders.flatMap(o => {
    const headerRow: PrintRow = { type: "order-header", order: o };
    const pItems = getPrintItems(o, monthPeriod);
    const itemRows: PrintRow[] = pItems.map((it, idx) => ({
      type: "item-row",
      order: o,
      item: it,
      index: idx
    }));
    return [headerRow, ...itemRows];
  });

  const pages = paginateRows(rows, true);
  const totalPages = pages.length;

  const nodes = pages.map((pageRows, pi) =>
    renderRenterInvoicePage({
      mode: "renter-invoice",
      companyName,
      renter,
      pageRows,
      pageIndex: pi,
      pageCount: pages.length,
      overallPageIndex: pi,
      overallPageCount: totalPages,
      monthPeriod,
    })
  );

  const cleanup = mountOffscreen(nodes);
  try {
    await renderSectionsToPdf(nodes, `請求書_${companyName}_${renter.personName}_${todayShort()}.pdf`);
  } finally {
    cleanup();
  }
}

export async function issueCompanyInvoice(group: CompanyGroup, monthPeriod?: string) {
  if (!group.renters || group.renters.length === 0) {
    throw new Error(`「${group.companyName}」に該当する担当者がありません。`);
  }

  // 1. Paginate all renters' details
  const renterPagesList: PrintRow[][][] = [];
  let totalDetailPages = 0;

  for (const r of group.renters) {
    const rows: PrintRow[] = r.orders.flatMap(o => {
      const headerRow: PrintRow = { type: "order-header", order: o };
      const pItems = getPrintItems(o, monthPeriod);
      const itemRows: PrintRow[] = pItems.map((it, idx) => ({
        type: "item-row",
        order: o,
        item: it,
        index: idx
      }));
      return [headerRow, ...itemRows];
    });

    const pages = paginateRows(rows, true);
    totalDetailPages += pages.length;
    renterPagesList.push(pages);
  }

  const totalPages = 1 + totalDetailPages; // 1 cover page + details

  // 2. Generate cover page
  const coverNode = renderCompanyCoverPage(group, totalPages, monthPeriod, 0);

  // 3. Generate detailed pages
  const detailNodes: HTMLElement[] = [];
  let overallIndex = 1;

  group.renters.forEach((r, ri) => {
    const pages = renterPagesList[ri];
    pages.forEach((pageRows, pi) => {
      const node = renderRenterInvoicePage({
        mode: "company-invoice",
        companyName: group.companyName,
        renter: r,
        companyTotal: group,
        pageRows,
        pageIndex: pi,
        pageCount: pages.length,
        overallPageIndex: overallIndex,
        overallPageCount: totalPages,
        monthPeriod,
      });
      detailNodes.push(node);
      overallIndex++;
    });
  });

  const allNodes = [coverNode, ...detailNodes];
  const cleanup = mountOffscreen(allNodes);
  try {
    await renderSectionsToPdf(allNodes, `請求書_${group.companyName}_${todayShort()}.pdf`);
  } finally {
    cleanup();
  }
}

export async function issueAggregatedBreakdown(groups: CompanyGroup[], monthPeriod?: string) {
  if (groups.length === 0) throw new Error("対象データがありません。");

  // 1. Calculate pagination for all companies and renters
  const companyPagesList: {
    group: CompanyGroup;
    coverIndex: number;
    renterPages: { r: RenterGroup; pages: PrintRow[][] }[];
  }[] = [];

  let currentOverallPageIndex = 1; // Page 0 is the Master Cover Page

  for (const g of groups) {
    const coverIndex = currentOverallPageIndex;
    currentOverallPageIndex++; // for company cover page

    const renterPages: { r: RenterGroup; pages: PrintRow[][] }[] = [];
    for (const r of g.renters) {
      const rows: PrintRow[] = r.orders.flatMap(o => {
        const headerRow: PrintRow = { type: "order-header", order: o };
        const pItems = getPrintItems(o, monthPeriod);
        const itemRows: PrintRow[] = pItems.map((it, idx) => ({
          type: "item-row",
          order: o,
          item: it,
          index: idx
        }));
        return [headerRow, ...itemRows];
      });
      const pages = paginateRows(rows, true);
      renterPages.push({ r, pages });
      currentOverallPageIndex += pages.length;
    }
    companyPagesList.push({ group: g, coverIndex, renterPages });
  }

  const totalPages = currentOverallPageIndex;

  // 2. Generate Master Cover Page
  const masterCover = renderBreakdownSummary(groups, totalPages, monthPeriod);

  // 3. Generate all detailed company pages
  const sections: HTMLElement[] = [masterCover];

  for (const { group, coverIndex, renterPages } of companyPagesList) {
    // Generate company cover page
    const companyCover = renderCompanyCoverPage(group, totalPages, monthPeriod, coverIndex);
    sections.push(companyCover);

    // Generate renter pages
    for (const { r, pages } of renterPages) {
      pages.forEach((pageRows, pi) => {
        const pageIndexOverall = sections.length;
        const node = renderRenterInvoicePage({
          mode: "breakdown-detail",
          companyName: group.companyName,
          renter: r,
          companyTotal: group,
          pageRows,
          pageIndex: pi,
          pageCount: pages.length,
          overallPageIndex: pageIndexOverall,
          overallPageCount: totalPages,
          monthPeriod,
        });
        sections.push(node);
      });
    }
  }

  const cleanup = mountOffscreen(sections);
  try {
    await renderSectionsToPdf(sections, `内訳請求書_${monthPeriod ?? todayShort()}.pdf`);
  } finally {
    cleanup();
  }
}
