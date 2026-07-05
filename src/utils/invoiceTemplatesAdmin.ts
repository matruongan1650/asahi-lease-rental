import { CompanyGroup, RenterGroup, aggregateTotals } from "./rentalInvoiceGrouping";
import { A4_PX_WIDTH, A4_PX_HEIGHT, renderSectionsToPdf, mountOffscreen } from "./pdfMultiPage";
import { ensureMonthlyBreakdowns, getOrGenerateInvoiceBlocks, orderMonthKey, getTaxRate } from "./billing";

// 消費税率のラベル（"10%" 等）。税額計算は getTaxRate() に統一済みなので表示も動的にする。
const taxPctLabel = () => `${Math.round(getTaxRate() * 100)}%`;

// ============================================================
// 発行元（自社）情報・振込先。実際の請求書（PDF）と同じ値に揃える。
// ============================================================
const ISSUER = {
  name: "アサヒリース 株式会社",
  zip: "〒194-0021",
  address1: "東京都町田市中町1-30-8 菅井町田ビル3-Ｄ",
  tel: "042-850-9827",
  fax: "042-850-9837",
  regNo: "T3020001111097", // インボイス登録番号
};

// お振込先（銀行明細どおり）。
const BANK_LINE = "三井住友銀行 町田支店 普通 8136136 アサヒリース(カ";
const BANK_NOTE = "誠に恐れ入りますが振込手数料は貴社にてご負担をお願いいたします。";
const THANKS = "毎度ありがとうございます。下記の通りご請求申し上げます。";

const labelDate = () => new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
function todayShort() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

function yen(v: number) {
  return Math.round(Number(v) || 0).toLocaleString("ja-JP");
}

// 月キー "YYYY-MM" → 締切日ラベル "YYYY年M月DD日 締切分"（DD=当月末日）。
function closingLabel(monthPeriod?: string): string {
  const m = String(monthPeriod || "").match(/^(\d{4})-(\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const lastDay = new Date(y, mo, 0).getDate();
    return `${y}年${mo}月${lastDay}日 締切分`;
  }
  // 月未指定（全期間）は発行日を締切とみなす。
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 締切分`;
}

// "YYYY-MM-DD"（/区切り可）→ "M/D"。納品日の短縮表示に使う。
function fmtMD(dateStr?: string): string {
  const m = String(dateStr || "").replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  return `${Number(m[2])}/${Number(m[3])}`;
}

// ------------------------------------------------------------
// 高さ見積りによるページ分割
// 固定 A4 高（overflow:hidden）で行が切れないよう、行数固定ではなく推定高さで詰める。
// 現場名・商品名が複数行に折り返しても A4 内に収める（超過分は次ページへ）。
// ------------------------------------------------------------
// 全角=1・半角≈0.55 で実効文字幅を数える（日本語主体セルの折り返し行数推定用）。
function effLen(s: string): number {
  let n = 0;
  for (const ch of String(s ?? "")) n += ch.charCodeAt(0) < 128 ? 0.55 : 1;
  return n;
}
// 1セルの折り返し行数（perLine=1行に収まる実効文字数の目安）。最低1行。
function estLines(s: string, perLine: number): number {
  return Math.max(1, Math.ceil(effLen(s) / perLine));
}
// items を「推定高さ合計が budget を超えない」チャンクへ分割。1ページ最低1件は必ず載せる。
function packByHeight<T>(items: T[], estH: (it: T) => number, budget: number): T[][] {
  const pages: T[][] = [];
  let cur: T[] = [];
  let h = 0;
  for (const it of items) {
    const ih = estH(it);
    if (cur.length > 0 && h + ih > budget) { pages.push(cur); cur = []; h = 0; }
    cur.push(it);
    h += ih;
  }
  if (cur.length > 0) pages.push(cur);
  if (pages.length === 0) pages.push([]);
  return pages;
}

// 受注番号（顧客提出用）: 手入力の receiptNumber を優先し、無ければ社内伝票番号にフォールバック。
function receiptNoOf(order: any): string {
  return String(order?.receiptNumber || order?.orderNumber || "").trim();
}

// 現場名・工事番号を 1 セルにまとめる（総括表用）。「工事番号 現場名」の順で結合。
function siteConstructionLabel(order: any): string {
  const cn = String(order?.constructionNumber || "").trim();
  const sn = String(order?.siteName || "").trim();
  return [cn, sn].filter(Boolean).join(" ") || "-";
}

// ------------------------------------------------------------
// 共有スタイル
// ------------------------------------------------------------
function pageBaseStyle(): string {
  return `
    width:${A4_PX_WIDTH}px;
    height:${A4_PX_HEIGHT}px;
    background:#ffffff;
    color:#111827;
    padding:40px 56px 32px;
    font-family:'Noto Sans JP',sans-serif;
    font-size:12px;
    box-sizing:border-box;
    line-height:1.5;
    position:relative;
    overflow:hidden;
    display:flex;
    flex-direction:column;
  `;
}

// 表の基本罫線（濃いグレー）。
const GRID = "#4b5563";
const GRIDL = "#9ca3af";

function thCell(extra = "") {
  return `border:1px solid ${GRID};background:#eef2f5;padding:4px 6px;font-weight:700;text-align:center;font-size:10.5px;${extra}`;
}
function tdCell(extra = "") {
  // table-layout:fixed で列幅を固定するため、長い語（ASCII含む）はセル内で折り返す。
  return `border:1px solid ${GRIDL};padding:4px 6px;font-size:10.5px;word-break:break-word;overflow-wrap:anywhere;${extra}`;
}

// 発行元ブロック（右上）。登録番号を含めるかを選べる。
function issuerBlockHtml(opts: { withRegNo?: boolean } = {}): string {
  return `
    <div style="text-align:left;font-size:10px;line-height:1.65;color:#1f2937;">
      <div style="font-weight:800;font-size:13px;letter-spacing:1px;color:#111827;">${escapeHtml(ISSUER.name)}</div>
      <div>${escapeHtml(ISSUER.zip)}</div>
      <div>${escapeHtml(ISSUER.address1)}</div>
      <div>TEL ${escapeHtml(ISSUER.tel)}</div>
      <div>FAX ${escapeHtml(ISSUER.fax)}</div>
      ${opts.withRegNo ? `<div>登録番号 ${escapeHtml(ISSUER.regNo)}</div>` : ""}
    </div>
  `;
}

// 宛先（会社名 御中）ブロック。
function billToHtml(companyName: string): string {
  return `
    <div style="font-size:19px;font-weight:800;letter-spacing:1px;">
      <span style="border-bottom:1.5px solid #111827;padding:0 40px 3px 4px;">${escapeHtml(companyName)}</span>
      <span style="font-weight:700;font-size:13px;margin-left:8px;">御中</span>
    </div>
  `;
}

// 振込先＋注意書き（各ページ下部）。
function bankFooterHtml(): string {
  return `
    <div style="font-size:9.5px;color:#374151;line-height:1.55;">
      <div>振込先：${escapeHtml(BANK_LINE)}</div>
      <div>${escapeHtml(BANK_NOTE)}</div>
    </div>
  `;
}

// ============================================================
// 明細行データ（現場別請求書 1 品目 = 1 行）
// ============================================================
interface InvoiceLineRow {
  kubun: string;       // 区分（日額/販売/保証料/その他）
  name: string;        // 商品名
  qty: number | string;
  days: number | string; // 期間（日数）
  deliveryDate: string;  // 納品日（M/D）
  unitPrice: number | string; // 日額単価（1単位あたり日額）
  amount: number;      // 金額（税抜・行合計）
  remarks: string;     // 備考
}

/**
 * 注文 1 件の請求明細行を作る。monthPeriod 指定時はその月のブロック、未指定時は全期間で集計。
 * 日額単価 = breakdown.price / days（1単位・1日あたり）、金額 = 単価 × 数量 × 期間 と一致する。
 */
function getInvoiceLineRows(order: any, monthPeriod?: string): InvoiceLineRow[] {
  const rows: InvoiceLineRow[] = [];
  const items = ensureMonthlyBreakdowns(order);
  const deliveryMD = fmtMD(order?.deliveryDate) || fmtMD(order?.rentalStartDate);

  const pushGuarantee = (it: any) => {
    const g = Number(it?.guaranteeFeeFlat) || 0;
    if (g > 0) {
      rows.push({
        kubun: "保証料", name: `${it.name || "-"} 基本保証料`, qty: 1, days: "", deliveryDate: "",
        unitPrice: g, amount: g, remarks: "初回のみ",
      });
    }
  };

  if (monthPeriod) {
    const orderMonth = orderMonthKey(order);
    items.forEach((it: any) => {
      const qty = Number(it.quantity ?? 1) || 1;
      if (it.type === "buy") {
        if (orderMonth !== monthPeriod) return;
        const unit = Number(it.calculatedPrice ?? it.buyPrice) || 0;
        rows.push({
          kubun: "販売", name: it.name || "-", qty, days: "", deliveryDate: deliveryMD,
          unitPrice: unit, amount: unit * qty, remarks: it.remarks || "",
        });
      } else {
        const b = it.monthlyBreakdown?.find((x: any) => x.monthStr === monthPeriod);
        if (!b) return;
        const days = Number(b.days) || 0;
        const unitPerDay = days > 0 ? b.price / days : b.price;
        rows.push({
          kubun: "日額", name: it.name || "-", qty, days, deliveryDate: deliveryMD,
          unitPrice: Math.round(unitPerDay),
          amount: Math.round(b.price * qty), remarks: it.remarks || "",
        });
        const isFirstMonth = it.monthlyBreakdown?.[0]?.monthStr === monthPeriod;
        if (isFirstMonth) pushGuarantee(it);
      }
    });
    // 追加費用（弁償費・燃料費・配送料 等）は当月ブロックから。
    const block = getOrGenerateInvoiceBlocks(order).find((b: any) => b.monthPeriod === monthPeriod);
    (block?.extraCosts || []).forEach((ec: any) => {
      rows.push({
        kubun: "その他", name: ec.itemName || ec.note || "追加費用", qty: 1, days: "", deliveryDate: "",
        unitPrice: Math.round(Number(ec.amount) || 0), amount: Math.round(Number(ec.amount) || 0), remarks: "",
      });
    });
  } else {
    // 全期間（月未指定）: 品目の合計値から 1 行ずつ。
    items.forEach((it: any) => {
      const qty = Number(it.quantity ?? 1) || 1;
      if (it.type === "buy") {
        const unit = Number(it.calculatedPrice ?? it.buyPrice) || 0;
        rows.push({
          kubun: "販売", name: it.name || "-", qty, days: "", deliveryDate: deliveryMD,
          unitPrice: unit, amount: unit * qty, remarks: it.remarks || "",
        });
      } else {
        // 期間・日額単価は「請求日数(billedDays)」基準にする。実日数(rentalDays)で割ると
        // 最低課金日数が隠れ、日額単価が実単価の数倍に膨らんで表示される（月別ブロックは
        // breakdown.days=請求日数を使うのと整合させる）。
        const days = Number(it.billedDays ?? it.rentalDays) || 0;
        const unitTotal = Number(it.calculatedPrice) || 0; // 1単位あたり期間合計
        const unitPerDay = days > 0 ? unitTotal / days : (Number(it.rentPrice) || 0);
        rows.push({
          kubun: "日額", name: it.name || "-", qty, days: days || "", deliveryDate: deliveryMD,
          unitPrice: Math.round(unitPerDay),
          amount: Math.round(unitTotal * qty), remarks: it.remarks || "",
        });
        pushGuarantee(it);
      }
    });
    getOrGenerateInvoiceBlocks(order).forEach((b: any) => {
      (b.extraCosts || []).forEach((ec: any) => {
        rows.push({
          kubun: "その他", name: ec.itemName || ec.note || "追加費用", qty: 1, days: "", deliveryDate: "",
          unitPrice: Math.round(Number(ec.amount) || 0), amount: Math.round(Number(ec.amount) || 0), remarks: "",
        });
      });
    });
  }

  return rows;
}

// 注文の当月（または全期間）金額を返す（総括表・請求金額用）。
function orderTotals(order: any, monthPeriod?: string): { subtotal: number; tax: number; total: number } {
  const blocks = getOrGenerateInvoiceBlocks(order);
  const target = monthPeriod ? blocks.filter((b: any) => b.monthPeriod === monthPeriod) : blocks;
  return target.reduce(
    (a: any, b: any) => ({ subtotal: a.subtotal + (Number(b.subtotal) || 0), tax: a.tax + (Number(b.tax) || 0), total: a.total + (Number(b.total) || 0) }),
    { subtotal: 0, tax: 0, total: 0 },
  );
}

// 会社グループ内の全注文をフラット化（総括表の行 = 注文 1 件）。受注番号順で安定ソート。
function flattenOrders(group: CompanyGroup): any[] {
  const all = group.renters.flatMap((r) => r.orders);
  return [...all].sort((a, b) => receiptNoOf(a).localeCompare(receiptNoOf(b), "ja"));
}

// ============================================================
// 請求総括表（会社ごとの表紙・一覧）
// ============================================================
// 現場名・工事番号セルの折り返しを含めた推定高さで詰める本文予算(px)。A4 固定高から
// ヘッダ・総額ボックス・フッタ(振込先＋ページ小計)の実測オーバーヘッド分を差し引いた安全値。
const SUMMARY_BODY_BUDGET_PX = 640;

/**
 * 請求総括表のページ群を生成。会社の全注文を 1 件 1 行で並べ、現場名の折り返し行数を
 * 見積もって A4 高に収まるよう改ページする（長い現場名でも行が切れない）。
 * 総額（今回売上額計・消費税・今回御請求額）は 1 枚目のみ表示（2 枚目以降は「一枚目記載」）。
 */
export function buildCompanySummary(group: CompanyGroup, monthPeriod?: string): HTMLElement[] {
  const orders = flattenOrders(group);
  const monthHeader = (() => {
    const m = String(monthPeriod || "").match(/^(\d{4})-(\d{1,2})/);
    return m ? `${Number(m[1])}年${Number(m[2])}月` : "全期間";
  })();

  // 各注文の金額と現場ラベルを先に確定し、現場名の折り返し行数から推定高さで分割。
  const rowData = orders.map((order) => ({
    order,
    t: orderTotals(order, monthPeriod),
    label: siteConstructionLabel(order),
  }));
  // 現場名・工事番号セル(≈256px)は 全角22文字/行、1行=約16px + 余白10px で見積もる。
  const pages = packByHeight(rowData, (r) => estLines(r.label, 22) * 16 + 10, SUMMARY_BODY_BUDGET_PX);
  const totalPages = pages.length;

  let runningNo = 0; // ページをまたいで連番（pages.map は順次実行される）。
  return pages.map((pageRows, pageIdx) => {
    const host = document.createElement("div");
    host.setAttribute("style", pageBaseStyle());

    let pageSubtotal = 0, pageTax = 0, pageTotal = 0;

    const bodyRows = pageRows.map((r) => {
      const t = r.t;
      pageSubtotal += t.subtotal; pageTax += t.tax; pageTotal += t.total;
      runningNo++;
      const person = String(r.order.personName || r.order.employeeName || "").trim();
      return `
        <tr>
          <td style="${tdCell("text-align:center;")}">${runningNo}</td>
          <td style="${tdCell()}">${escapeHtml(r.label)}</td>
          <td style="${tdCell("text-align:center;")}">${escapeHtml(person)}${person ? " 様" : ""}</td>
          <td style="${tdCell("text-align:center;font-family:ui-monospace,monospace;")}">${escapeHtml(receiptNoOf(r.order))}</td>
          <td style="${tdCell("text-align:right;font-family:ui-monospace,monospace;")}">${yen(t.subtotal)}</td>
          <td style="${tdCell("text-align:right;font-family:ui-monospace,monospace;")}">${yen(t.total)}</td>
        </tr>`;
    }).join("");

    const isFirst = pageIdx === 0;
    const grandBox = isFirst
      ? `
        <div style="display:flex;">
          <div style="flex:1;text-align:center;padding:6px;border:1px solid ${GRID};background:#eef2f5;font-weight:700;">今回売上額計</div>
          <div style="flex:1;text-align:center;padding:6px;border:1px solid ${GRID};border-left:none;background:#eef2f5;font-weight:700;">消費税（${taxPctLabel()}）</div>
          <div style="flex:1;text-align:center;padding:6px;border:1px solid ${GRID};border-left:none;background:#eef2f5;font-weight:700;">今回御請求額</div>
        </div>
        <div style="display:flex;">
          <div style="flex:1;text-align:right;padding:8px 12px;border:1px solid ${GRID};border-top:none;font-family:ui-monospace,monospace;font-size:14px;font-weight:700;">${yen(group.subtotal)}</div>
          <div style="flex:1;text-align:right;padding:8px 12px;border:1px solid ${GRID};border-top:none;border-left:none;font-family:ui-monospace,monospace;font-size:14px;font-weight:700;">${yen(group.tax)}</div>
          <div style="flex:1;text-align:right;padding:8px 12px;border:1px solid ${GRID};border-top:none;border-left:none;font-family:ui-monospace,monospace;font-size:15px;font-weight:800;color:#0f172a;">${yen(group.total)}</div>
        </div>`
      : `
        <div style="display:flex;">
          <div style="flex:1;text-align:center;padding:6px;border:1px solid ${GRID};background:#eef2f5;font-weight:700;">今回売上額計</div>
          <div style="flex:1;text-align:center;padding:6px;border:1px solid ${GRID};border-left:none;background:#eef2f5;font-weight:700;">消費税（${taxPctLabel()}）</div>
          <div style="flex:1;text-align:center;padding:6px;border:1px solid ${GRID};border-left:none;background:#eef2f5;font-weight:700;">今回御請求額</div>
        </div>
        <div style="display:flex;">
          <div style="flex:1;text-align:center;padding:8px 12px;border:1px solid ${GRID};border-top:none;color:#6b7280;">一枚目記載</div>
          <div style="flex:1;text-align:center;padding:8px 12px;border:1px solid ${GRID};border-top:none;border-left:none;color:#6b7280;">一枚目記載</div>
          <div style="flex:1;text-align:center;padding:8px 12px;border:1px solid ${GRID};border-top:none;border-left:none;color:#6b7280;">一枚目記載</div>
        </div>`;

    host.innerHTML = `
      <!-- ヘッダ -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          <div style="text-align:center;font-size:18px;font-weight:800;letter-spacing:8px;margin-bottom:14px;">請求総括表</div>
          ${billToHtml(group.companyName)}
        </div>
        <div style="min-width:230px;flex-shrink:0;margin-left:24px;">${issuerBlockHtml()}</div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin:14px 0 8px;">
        <div style="font-size:10.5px;color:#374151;">${escapeHtml(THANKS)}</div>
        <div style="font-size:11px;font-weight:700;">${escapeHtml(closingLabel(monthPeriod))}</div>
      </div>

      <!-- 総額ボックス -->
      <div style="margin-bottom:14px;">${grandBox}</div>

      <!-- 一覧テーブル -->
      <div style="flex:1;">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>
            <col style="width:52px;" /><col style="width:254px;" /><col style="width:96px;" /><col style="width:84px;" /><col style="width:96px;" /><col style="width:98px;" />
          </colgroup>
          <thead>
            <tr>
              <th style="${thCell("")}">${escapeHtml(monthHeader)}<br/>番号</th>
              <th style="${thCell("")}">現場名・工事番号</th>
              <th style="${thCell("")}">担当者</th>
              <th style="${thCell("")}">受注番号</th>
              <!-- 「単価（税抜）」列は実際の請求書に合わせ、注文 1 件の税抜合計(t.subtotal)を表示する
                   （＝単価ではなく現場ごとの税抜金額。手本の PDF がこの見出しでこの値を出しているため踏襲）。 -->
              <th style="${thCell("")}">単価（税抜）</th>
              <th style="${thCell("")}">金額（税込）</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>

      <!-- フッタ：振込先＋ページ小計 -->
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-top:10px;">
        ${bankFooterHtml()}
        <div style="width:240px;flex-shrink:0;">
          <div style="display:flex;justify-content:space-between;padding:3px 8px;border:1px solid ${GRIDL};font-size:10.5px;"><span>小計</span><span style="font-family:ui-monospace,monospace;">${yen(pageSubtotal)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 8px;border:1px solid ${GRIDL};border-top:none;font-size:10.5px;"><span>消費税 小計</span><span style="font-family:ui-monospace,monospace;">${yen(pageTax)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:5px 8px;border:1.5px solid ${GRID};border-top:none;font-weight:800;"><span>合計</span><span style="font-family:ui-monospace,monospace;">${yen(pageTotal)}</span></div>
        </div>
      </div>

      <div style="position:absolute;bottom:12px;right:56px;font-size:9px;color:#9ca3af;font-family:ui-monospace,monospace;">${pageIdx + 1} / ${totalPages}</div>
    `;

    return host;
  });
}

// 後方互換：以前の renderCompanyCoverPage は 1 枚の HTMLElement を返していた。総括表 1 枚目を返す。
export function renderCompanyCoverPage(
  group: CompanyGroup,
  _overallPageCount?: number,
  monthPeriod?: string,
  _overallPageIndex = 0,
): HTMLElement {
  return buildCompanySummary(group, monthPeriod)[0];
}

// ============================================================
// 現場別 請求書（注文 1 件 = 1 通、明細多数時は複数ページ）
// ============================================================
// 明細行の推定高さで詰める本文予算(px)。A4 固定高からヘッダ・請求金額ボックス・
// 合計・振込先の実測オーバーヘッド分を差し引いた安全値。
const INVOICE_BODY_BUDGET_PX = 540;

interface OrderInvoiceOpts {
  companyName: string;
  monthPeriod?: string;
}

/**
 * 注文 1 件を伝統的な請求書レイアウトでレンダリング。明細が多い場合は複数ページに分割し、
 * 合計・振込先は最終ページのみに表示する。
 */
export function renderOrderInvoicePage(order: any, opts: OrderInvoiceOpts): HTMLElement[] {
  const rows = getInvoiceLineRows(order, opts.monthPeriod);
  const t = orderTotals(order, opts.monthPeriod);

  // 商品名(≈198px,17字/行)・備考(≈96px,8字/行)の折り返し行数から高さを見積もって分割
  // （1行=約16px + 余白10px。最終ページは合計欄ぶん予算を抑えめにして切れを防ぐ）。
  const chunks = packByHeight(
    rows,
    (r) => Math.max(estLines(r.name, 17), estLines(String(r.remarks || ""), 8)) * 16 + 10,
    INVOICE_BODY_BUDGET_PX,
  );
  const totalPages = chunks.length;

  const person = String(order.personName || order.employeeName || "").trim();
  const deliveryStaff = String(order.deliveryStaff || "").trim();
  const billingStaff = String(order.billingStaff || "").trim();

  return chunks.map((chunk, pageIdx) => {
    const host = document.createElement("div");
    host.setAttribute("style", pageBaseStyle());
    const isLast = pageIdx === totalPages - 1;

    const bodyRows = chunk.map((r) => `
      <tr>
        <td style="${tdCell("text-align:center;")}">${escapeHtml(r.kubun)}</td>
        <td style="${tdCell()}">${escapeHtml(r.name)}</td>
        <td style="${tdCell("text-align:center;")}">${r.qty === "" ? "" : escapeHtml(String(r.qty))}</td>
        <td style="${tdCell("text-align:center;")}">${r.days === "" ? "" : escapeHtml(String(r.days))}</td>
        <td style="${tdCell("text-align:center;")}">${escapeHtml(r.deliveryDate)}</td>
        <td style="${tdCell("text-align:right;font-family:ui-monospace,monospace;")}">${r.unitPrice === "" ? "" : yen(Number(r.unitPrice))}</td>
        <td style="${tdCell("text-align:right;font-family:ui-monospace,monospace;font-weight:600;")}">${yen(r.amount)}</td>
        <td style="${tdCell("font-size:9.5px;color:#4b5563;")}">${escapeHtml(r.remarks)}</td>
      </tr>`).join("");

    const totalsBlock = isLast ? `
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <div style="width:260px;">
          <div style="display:flex;justify-content:space-between;padding:4px 10px;border:1px solid ${GRIDL};font-size:11px;"><span>小計</span><span style="font-family:ui-monospace,monospace;">${yen(t.subtotal)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 10px;border:1px solid ${GRIDL};border-top:none;font-size:11px;"><span>消費税（${taxPctLabel()}）</span><span style="font-family:ui-monospace,monospace;">${yen(t.tax)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 10px;border:1.5px solid ${GRID};border-top:none;font-weight:800;font-size:13px;"><span>合計</span><span style="font-family:ui-monospace,monospace;">${yen(t.total)}</span></div>
        </div>
      </div>` : "";

    host.innerHTML = `
      <!-- 上部：受注番号・宛先・発行元 -->
      <div style="display:flex;justify-content:flex-end;font-size:10px;font-family:ui-monospace,monospace;color:#374151;margin-bottom:4px;">
        受注番号 ${escapeHtml(receiptNoOf(order))}${totalPages > 1 ? `　（${pageIdx + 1}/${totalPages}）` : ""}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:18px;font-weight:800;letter-spacing:8px;margin-bottom:12px;">請求書</div>
          ${billToHtml(opts.companyName)}
        </div>
        <div style="min-width:230px;flex-shrink:0;margin-left:24px;">${issuerBlockHtml({ withRegNo: true })}</div>
      </div>

      <!-- 現場情報 -->
      <div style="display:flex;flex-wrap:wrap;gap:6px 20px;margin:12px 0 4px;font-size:11px;">
        <div><span style="color:#6b7280;">現場名</span>　<span style="font-weight:700;">${escapeHtml(order.siteName || "-")}</span></div>
        <div><span style="color:#6b7280;">工事番号</span>　<span style="font-weight:700;font-family:ui-monospace,monospace;">${escapeHtml(order.constructionNumber || "-")}</span></div>
        <div><span style="color:#6b7280;">担当</span>　<span style="font-weight:700;">${escapeHtml(person)}${person ? " 様" : ""}</span></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin:6px 0 10px;">
        <div style="font-size:10.5px;color:#374151;">${escapeHtml(THANKS)}　<span style="font-weight:700;color:#111827;">${escapeHtml(closingLabel(opts.monthPeriod))}</span></div>
      </div>

      <!-- 請求金額＋担当ボックス -->
      <div style="display:flex;gap:12px;align-items:stretch;margin-bottom:12px;">
        <div style="flex:1;border:1.5px solid ${GRID};display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#f8fafc;">
          <span style="font-size:14px;font-weight:800;letter-spacing:2px;">ご請求金額</span>
          <span style="font-family:ui-monospace,monospace;font-size:22px;font-weight:800;">¥${yen(t.total)}</span>
        </div>
        <div style="width:180px;flex-shrink:0;">
          <div style="display:flex;">
            <div style="flex:1;text-align:center;padding:3px;border:1px solid ${GRID};background:#eef2f5;font-size:10px;font-weight:700;">納品担当</div>
            <div style="flex:1;text-align:center;padding:3px;border:1px solid ${GRID};border-left:none;background:#eef2f5;font-size:10px;font-weight:700;">請求担当</div>
          </div>
          <div style="display:flex;">
            <div style="flex:1;text-align:center;padding:8px 3px;border:1px solid ${GRID};border-top:none;font-size:11px;">${escapeHtml(deliveryStaff)}</div>
            <div style="flex:1;text-align:center;padding:8px 3px;border:1px solid ${GRID};border-top:none;border-left:none;font-size:11px;">${escapeHtml(billingStaff)}</div>
          </div>
        </div>
      </div>

      <!-- 明細テーブル -->
      <div style="flex:1;">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>
            <col style="width:46px;" /><col style="width:260px;" /><col style="width:44px;" /><col style="width:44px;" /><col style="width:52px;" /><col style="width:70px;" /><col style="width:76px;" /><col style="width:88px;" />
          </colgroup>
          <thead>
            <tr>
              <th style="${thCell("")}">区分</th>
              <th style="${thCell("")}">商品名</th>
              <th style="${thCell("")}">数量</th>
              <th style="${thCell("")}">期間</th>
              <th style="${thCell("")}">納品日</th>
              <th style="${thCell("")}">日額単価</th>
              <th style="${thCell("")}">金額</th>
              <th style="${thCell("")}">備考</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>

      ${totalsBlock}

      <div style="margin-top:10px;">${bankFooterHtml()}</div>
      <div style="position:absolute;bottom:12px;right:56px;font-size:9px;color:#9ca3af;font-family:ui-monospace,monospace;">${pageIdx + 1} / ${totalPages}</div>
    `;

    return host;
  });
}

// ============================================================
// High-level issuer helpers（エクスポート署名は従来どおり維持）
// ============================================================

/** 注文 1 件の請求書 PDF ノードを生成。 */
export function buildOrderInvoice(order: any, monthPeriod?: string): { nodes: HTMLElement[]; filename: string } {
  const companyName = order.companyName?.trim() || order.customer?.trim() || order.customerName?.trim() || "(会社名未設定)";
  const nodes = renderOrderInvoicePage(order, { companyName, monthPeriod });
  return { nodes, filename: `請求書_${receiptNoOf(order) || order.orderNumber || "no-num"}.pdf` };
}

export async function issueOrderInvoice(order: any, monthPeriod?: string) {
  const { nodes, filename } = buildOrderInvoice(order, monthPeriod);
  const cleanup = mountOffscreen(nodes);
  try { await renderSectionsToPdf(nodes, filename); } finally { cleanup(); }
}

/** 担当者 1 名分：その担当者の注文ごとに請求書を綴じる。 */
export function buildRenterInvoice(companyName: string, renter: RenterGroup, monthPeriod?: string): { nodes: HTMLElement[]; filename: string } {
  const nodes = renter.orders.flatMap((o) => renderOrderInvoicePage(o, { companyName, monthPeriod }));
  return { nodes, filename: `請求書_${companyName}_${renter.personName}_${todayShort()}.pdf` };
}

export async function issueRenterInvoice(companyName: string, renter: RenterGroup, monthPeriod?: string) {
  const { nodes, filename } = buildRenterInvoice(companyName, renter, monthPeriod);
  const cleanup = mountOffscreen(nodes);
  try { await renderSectionsToPdf(nodes, filename); } finally { cleanup(); }
}

/** 会社 1 社分：請求総括表（表紙）＋ 現場別請求書（注文ごと）。 */
export function buildCompanyInvoice(group: CompanyGroup, monthPeriod?: string): { nodes: HTMLElement[]; filename: string } {
  if (!group.renters || group.renters.length === 0) {
    throw new Error(`「${group.companyName}」に該当する注文がありません。`);
  }
  const summaryPages = buildCompanySummary(group, monthPeriod);
  const orderPages = flattenOrders(group).flatMap((o) => renderOrderInvoicePage(o, { companyName: group.companyName, monthPeriod }));
  return { nodes: [...summaryPages, ...orderPages], filename: `請求書_${group.companyName}_${todayShort()}.pdf` };
}

export async function issueCompanyInvoice(group: CompanyGroup, monthPeriod?: string) {
  const { nodes, filename } = buildCompanyInvoice(group, monthPeriod);
  const cleanup = mountOffscreen(nodes);
  try { await renderSectionsToPdf(nodes, filename); } finally { cleanup(); }
}

// ------------------------------------------------------------
// 全取引先まとめ（内訳一覧の総合版）
// ------------------------------------------------------------

/** 全取引先の集計一覧（マスター表紙）。 */
function renderMasterSummary(groups: CompanyGroup[], totalPages: number, monthPeriod?: string): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("style", pageBaseStyle());
  const total = aggregateTotals(groups);

  const rows = groups.map((g, gi) => `
    <tr>
      <td style="${tdCell("text-align:center;")}">${gi + 1}</td>
      <td style="${tdCell("font-weight:700;")}">${escapeHtml(g.companyName)}</td>
      <td style="${tdCell("text-align:center;")}">${g.orderCount}</td>
      <td style="${tdCell("text-align:right;font-family:ui-monospace,monospace;")}">${yen(g.subtotal)}</td>
      <td style="${tdCell("text-align:right;font-family:ui-monospace,monospace;")}">${yen(g.tax)}</td>
      <td style="${tdCell("text-align:right;font-family:ui-monospace,monospace;font-weight:700;")}">${yen(g.total)}</td>
    </tr>`).join("");

  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-size:18px;font-weight:800;letter-spacing:8px;margin-bottom:12px;">請求一覧表</div>
        <div style="font-size:11px;color:#374151;">対象 ${groups.length} 社 / 注文 ${total.orderCount} 件　${escapeHtml(closingLabel(monthPeriod))}</div>
      </div>
      <div style="min-width:230px;flex-shrink:0;margin-left:24px;">${issuerBlockHtml()}</div>
    </div>

    <div style="flex:1;margin-top:16px;">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead>
          <tr>
            <th style="${thCell("width:44px;")}">No.</th>
            <th style="${thCell("")}">会社名</th>
            <th style="${thCell("width:64px;")}">件数</th>
            <th style="${thCell("width:100px;")}">小計</th>
            <th style="${thCell("width:100px;")}">消費税</th>
            <th style="${thCell("width:110px;")}">合計（税込）</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <td colspan="2" style="${tdCell("text-align:right;background:#eef2f5;font-weight:800;")}">総合計</td>
            <td style="${tdCell("text-align:center;background:#eef2f5;font-weight:800;")}">${total.orderCount}</td>
            <td style="${tdCell("text-align:right;background:#eef2f5;font-family:ui-monospace,monospace;font-weight:800;")}">${yen(total.subtotal)}</td>
            <td style="${tdCell("text-align:right;background:#eef2f5;font-family:ui-monospace,monospace;font-weight:800;")}">${yen(total.tax)}</td>
            <td style="${tdCell("text-align:right;background:#eef2f5;font-family:ui-monospace,monospace;font-weight:800;")}">${yen(total.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="margin-top:10px;">${bankFooterHtml()}</div>
    <div style="position:absolute;bottom:12px;right:56px;font-size:9px;color:#9ca3af;font-family:ui-monospace,monospace;">1 / ${totalPages}</div>
  `;

  return host;
}

export function buildAggregatedBreakdown(groups: CompanyGroup[], monthPeriod?: string): { nodes: HTMLElement[]; filename: string } {
  if (groups.length === 0) throw new Error("対象データがありません。");

  // 各社の [総括表 + 現場別請求書] を連結。先頭にマスター一覧を付す。
  const companySections = groups.map((g) => [
    ...buildCompanySummary(g, monthPeriod),
    ...flattenOrders(g).flatMap((o) => renderOrderInvoicePage(o, { companyName: g.companyName, monthPeriod })),
  ]);
  const detailNodes = companySections.flat();
  const totalPages = 1 + detailNodes.length;
  const master = renderMasterSummary(groups, totalPages, monthPeriod);

  return { nodes: [master, ...detailNodes], filename: `内訳請求書_${monthPeriod ?? todayShort()}.pdf` };
}

export async function issueAggregatedBreakdown(groups: CompanyGroup[], monthPeriod?: string) {
  const { nodes, filename } = buildAggregatedBreakdown(groups, monthPeriod);
  const cleanup = mountOffscreen(nodes);
  try { await renderSectionsToPdf(nodes, filename); } finally { cleanup(); }
}
