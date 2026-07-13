import React, { useMemo, useState } from "react";
import { Badge, Btn, Panel, triggerToast } from "../../components/AdminUI";
import { confirmDialog } from "../../components/AppDialog";
import AdminRentalInvoiceSection from "../../components/AdminRentalInvoiceSection";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";
import B2BInvoiceViewer from "../../components/B2BInvoiceViewer";
import { usePagedList } from "../../hooks/usePagedList";
import DocumentViewer from "../../components/DocumentViewer";
import { useAdminOrders } from "../../context/AdminDataContext";
import { getOrGenerateInvoiceBlocks, closeOrderBillingPatch } from "../../utils/billing";
import { settleReturnStock, deductOrderStock, stockFlagsForStatusChange } from "../../utils/stockLedger";
import OrderBus from "../../lib/orderBus";
import type { InvoiceBlock } from "../../types";

type B2BType = "summary" | "detailed";
type StatusFilter = "all" | "accumulating" | "pending" | "paid";
// 一覧ソート対象列。null は未ソート（既定の元順）。
type SortColumn = "monthPeriod" | "company" | "total" | "status";
type SortDir = "asc" | "desc";
// 状態列のソート順位（集計中→未入金→入金済 の業務フローに沿う）。
const STATUS_ORDER: Record<StatusFilter, number> = { all: 0, accumulating: 1, pending: 2, paid: 3 };

interface InvoiceRow {
  order: any;
  block: InvoiceBlock;
  company: string;
  person: string;
  orderNumber: string;
  siteName: string;
  itemCount: number;
  invoiceType: string;
}

const EMPTY_COMPANY = "(会社名未設定)";
const EMPTY_PERSON = "(担当者未設定)";

function yen(value: number) {
  return `¥${Math.round(Number(value) || 0).toLocaleString("ja-JP")}`;
}

function normalizeText(value: any) {
  return String(value || "").replace(/　/g, " ").trim().replace(/\s+/g, " ");
}

function companyOf(order: any) {
  return normalizeText(order.companyName || order.customer || order.company || order.customerName) || EMPTY_COMPANY;
}

function personOf(order: any) {
  return normalizeText(order.personName || order.employeeName || order.customerName) || EMPTY_PERSON;
}

function statusLabel(status: string) {
  if (status === "paid" || status === "入金済" || status === "支払済") return "入金済";
  if (status === "accumulating" || status === "集計中") return "集計中";
  return "未入金";
}

function statusTone(status: string): "ok" | "warning" | "default" {
  if (statusLabel(status) === "入金済") return "ok";
  if (statusLabel(status) === "集計中") return "default";
  return "warning";
}

function statusKey(status: string): StatusFilter {
  if (statusLabel(status) === "入金済") return "paid";
  if (statusLabel(status) === "集計中") return "accumulating";
  return "pending";
}

// 支払期日 = 対象月(monthPeriod)の翌月末（請求書テンプレの「月末締め翌月末払い」に準拠）。
function blockDueDate(block: any): Date | null {
  const m = String(block?.monthPeriod || "").match(/^(\d{4})-(\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) + 1, 0); // 翌月末日（オーバーフローは Date が補正）
}
// 延滞 = 未入金(確定済)かつ支払期日が過ぎている。集計中・入金済は対象外。
function blockOverdue(block: any): boolean {
  if (statusKey(String(block?.status || "")) !== "pending") return false;
  const due = blockDueDate(block);
  if (!due) return false;
  const now = new Date();
  return due < new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function orderType(order: any) {
  const items = order.items || [];
  const hasRent = items.some((item: any) => item.type === "rent");
  const hasBuy = items.some((item: any) => item.type === "buy");
  if (hasRent && hasBuy) return "混在";
  if (hasBuy) return "販売";
  return "レンタル";
}

// 消込を保存済みブロックへ「最小差分」で反映する。生成配列(getOrGenerateInvoiceBlocks)を丸ごと
// 保存すると、表示用に本日まで cap された当月ロールフォワードブロックまで永続化され、以降その月の
// 日数が二度と伸びず月末請求が過少になる(I1)。ライブ注文から直前再取得して多端末の巻き戻りも軽減。
function applyBlockStatuses(order: any, changes: Map<string, { status: string; paidAt?: string }>): any[] {
  const live = OrderBus.getAll<any>("orders").find(
    (o: any) => o && (o.id === order.id || (order.firestoreId && o.firestoreId === order.firestoreId)),
  ) || order;
  const saved: any[] = Array.isArray(live.invoiceBlocks) ? live.invoiceBlocks : [];
  const savedIds = new Set(saved.map((b: any) => String(b?.id || "")));
  const applyTo = (b: any) => {
    const c = changes.get(String(b?.id || ""));
    return c ? { ...b, status: c.status, paidAt: c.paidAt } : b;
  };
  let next = saved.map(applyTo);
  const missing = Array.from(changes.keys()).filter((blockId) => !savedIds.has(blockId));
  if (missing.length > 0) {
    // 保存済みに無いブロック（動的生成月）を消し込む場合のみ、そのブロックを追加保存する。
    // それ以外の動的月（特に本日capの当月・集計中）は保存しない（凍結防止）。
    const t = new Date();
    const thisMonth = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    const generated = getOrGenerateInvoiceBlocks(live);
    const extras = generated
      .filter((b: any) => {
        const bid = String(b?.id || "");
        if (savedIds.has(bid)) return false;
        if (missing.includes(bid)) return true;
        // キャッシュ皆無の注文は、確定済みの過去月も一緒に保存する（対象月だけ保存すると
        // 以後のキャッシュ経路で過去月が表示から消えるため）。当月以降は保存しない。
        return savedIds.size === 0 && !!b?.monthPeriod && b.monthPeriod < thisMonth;
      })
      .map(applyTo);
    next = [...next, ...extras].sort((a: any, b: any) =>
      String(a?.monthPeriod || "").localeCompare(String(b?.monthPeriod || "")),
    );
  }
  return next;
}

// 請求開始前（未納品）のステータス。受注一覧は納品確定まで請求ブロックを作らない方針
// (AdminRental の shouldBill)なのに、請求管理側は動的生成で満額を AR/延滞に計上していた(M23)。
// キャッシュ済みブロックを持つ注文（移行登録・請求済み）は表示を維持する。
const PRE_BILLING_STATUSES = ["処理中", "注文確認中", "確認済み", "準備中", "配送中"];
function isPreBilling(order: any): boolean {
  return PRE_BILLING_STATUSES.includes(String(order?.status || ""))
    && !(Array.isArray(order?.invoiceBlocks) && order.invoiceBlocks.length > 0);
}

function makeRows(orders: any[]): InvoiceRow[] {
  return orders.flatMap((order) => {
    if (!Array.isArray(order.items) || order.items.length === 0) return [];
    if (isPreBilling(order)) return []; // 未納品はまだ請求しない(M23)
    // キャンセル注文の「未入金」ブロックは請求対象外（回収不能額を AR・延滞集計に混ぜない。
    // 決して入金されない）。ただし既に入金済みのブロックは表示を残す — 納品後に入金まで進んだ
    // 注文を後からキャンセルした場合、回収済み売上の記録が請求管理から消えないようにする。
    const isCancelled = String(order.status || "") === "キャンセル";
    if (isCancelled) {
      const paidOnly = getOrGenerateInvoiceBlocks(order).filter(
        (block) => statusKey(String(block?.status || "")) === "paid" && Number(block.total || 0) !== 0,
      );
      return paidOnly.map((block) => ({
        order,
        block,
        company: companyOf(order),
        person: personOf(order),
        orderNumber: order.orderNumber || order.id || "-",
        siteName: order.siteName || order.site || "-",
        itemCount: order.items.length,
        invoiceType: orderType(order),
      }));
    }
    const blocks = getOrGenerateInvoiceBlocks(order).filter((block) => Number(block.total || 0) !== 0);
    return blocks.map((block) => ({
      order,
      block,
      company: companyOf(order),
      person: personOf(order),
      orderNumber: order.orderNumber || order.id || "-",
      siteName: order.siteName || order.site || "-",
      itemCount: order.items.length,
      invoiceType: orderType(order),
    }));
  });
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "teal",
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "teal" | "amber" | "blue" | "green";
}) {
  const toneClass = {
    teal: "bg-[#e8f6f5] text-[#1e8c86]",
    amber: "bg-[#fff8e7] text-[#8a6a00]",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
  }[tone];

  return (
    <div className="rounded-lg border border-[#cfe6e3] bg-white p-4 shadow-[0_4px_20px_rgba(43,168,162,0.08)] min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black text-[#7ca39f]">{label}</div>
          <div className="mt-1 truncate text-[22px] font-black tracking-tight text-[#173b38]">{value}</div>
          {sub && <div className="mt-1 truncate text-[11px] font-bold text-slate-400">{sub}</div>}
        </div>
        <span className={`material-symbols-outlined flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[20px] ${toneClass}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

export default function AdminInvoices() {
  const liveOrders = useAdminOrders();
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [payingId, setPayingId] = useState<string | null>(null); // 入金更新中のブロック（二重送信ガード）
  const [query, setQuery] = useState("");
  const [b2bOpen, setB2bOpen] = useState(false);
  const [b2bType, setB2bType] = useState<B2BType>("summary");
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  const [openOrder, setOpenOrder] = useState<any | null>(null); // 行クリックで開く注文詳細ドロワー
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null); // 一覧ソート列（null=元順）
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set()); // 一括消込の選択（block.id）

  const invoiceOrders = useMemo(
    () => (liveOrders.orders || []).filter((order: any) =>
      Array.isArray(order.items) && order.items.length > 0 && !isPreBilling(order)), // 未納品は請求対象外(M23)
    [liveOrders.orders],
  );

  const rows = useMemo(() => makeRows(invoiceOrders), [invoiceOrders]);

  const companies = useMemo(
    () => Array.from(new Set(rows.map((row) => row.company))).sort((a, b) => a.localeCompare(b, "ja")),
    [rows],
  );

  const months = useMemo(
    () => Array.from(new Set(rows.map((row) => row.block.monthPeriod))).sort().reverse(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (selectedCompany && row.company !== selectedCompany) return false;
      if (selectedMonth && row.block.monthPeriod !== selectedMonth) return false;
      if (statusFilter !== "all" && statusKey(String(row.block.status || "")) !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        row.company,
        row.person,
        row.orderNumber,
        row.siteName,
        row.invoiceType,
        row.block.monthPeriod,
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [query, rows, selectedCompany, selectedMonth, statusFilter]);

  // 一覧ソート。sortColumn が null のときは元順（filteredRows）をそのまま使う。
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    const dir = sortDir === "asc" ? 1 : -1;
    const valueOf = (row: InvoiceRow): string | number => {
      switch (sortColumn) {
        case "monthPeriod": return row.block.monthPeriod || "";
        case "company": return row.company;
        case "total": return Number(row.block.total || 0);
        case "status": return STATUS_ORDER[statusKey(String(row.block.status || ""))];
      }
    };
    // 元配列を壊さないよう複製してから安定比較（数値は数値、文字は ja ロケール）。
    return [...filteredRows].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "ja") * dir;
    });
  }, [filteredRows, sortColumn, sortDir]);

  // ソート状態を resetKey に含め、ソート切替時もページを先頭へ戻す。
  const paged = usePagedList(sortedRows, 50, [query, selectedCompany, selectedMonth, statusFilter, sortColumn, sortDir]);

  // フィルタ・ページ条件が変わったら一括消込の選択をクリアする（表示外の行を選んだままにしない）。
  React.useEffect(() => {
    setSelectedBlockIds(new Set());
  }, [query, selectedCompany, selectedMonth, statusFilter]);

  // ヘッダクリックで 昇順→降順→解除 をトグル。
  const toggleSort = (column: SortColumn) => {
    if (sortColumn !== column) { setSortColumn(column); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortColumn(null); // 降順の次は解除（元順に戻す）
  };
  // ヘッダの矢印アイコン（AdminUI.Table に倣う material-symbols）。
  const sortIcon = (column: SortColumn) =>
    sortColumn !== column ? "unfold_more" : sortDir === "asc" ? "arrow_upward" : "arrow_downward";

  // 現在表示中（paged.shown）で入金可能（未入金/集計中）なブロックのみ一括対象とする。
  const selectableShownIds = useMemo(
    () => paged.shown.filter((row) => statusKey(String(row.block.status || "")) !== "paid").map((row) => row.block.id),
    [paged.shown],
  );
  const allShownSelected = selectableShownIds.length > 0 && selectableShownIds.every((id) => selectedBlockIds.has(id));

  const toggleSelectAll = () => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev);
      if (allShownSelected) selectableShownIds.forEach((id) => next.delete(id));
      else selectableShownIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleSelectOne = (blockId: string) => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

  // 一括入金消込。選択ブロックを order ごとにまとめ、order 単位で 1 回 patchOrder する。
  const bulkMarkPaid = async () => {
    if (payingId || selectedBlockIds.size === 0) return; // 進行中・未選択はガード
    const ok = await confirmDialog(`選択した ${selectedBlockIds.size}件 を入金済にしますか？`, { okText: "入金済にする", cancelText: "やめる" });
    if (!ok) return;
    setPayingId("__bulk__"); // 一括処理中マーカー（個別ボタンも無効化される）
    const stamp = new Date().toISOString();
    // 選択 block.id を order ごとにグルーピング。
    const byOrder = new Map<any, Set<string>>();
    sortedRows.forEach((row) => {
      if (!selectedBlockIds.has(row.block.id)) return;
      const set = byOrder.get(row.order) || new Set<string>();
      set.add(row.block.id);
      byOrder.set(row.order, set);
    });
    let updated = 0;
    byOrder.forEach((blockIds, order) => {
      const id = order.firestoreId || order.id;
      if (!id) return;
      const changes = new Map<string, { status: string; paidAt?: string }>();
      blockIds.forEach((bid) => changes.set(String(bid), { status: "paid", paidAt: stamp }));
      liveOrders.patchOrder(id, { invoiceBlocks: applyBlockStatuses(order, changes) });
      updated += blockIds.size;
    });
    setSelectedBlockIds(new Set());
    triggerToast(`${updated}件 を入金済に更新しました`, "ok");
    setTimeout(() => setPayingId(null), 400); // 反映までガード解除を遅延
  };

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.subtotal += Number(row.block.subtotal || 0);
        acc.tax += Number(row.block.tax || 0);
        acc.total += Number(row.block.total || 0);
        acc.pending += statusKey(String(row.block.status || "")) === "pending" ? 1 : 0;
        acc.paid += statusKey(String(row.block.status || "")) === "paid" ? 1 : 0;
        if (blockOverdue(row.block)) { acc.overdue += 1; acc.overdueAmount += Number(row.block.total || 0); }
        acc.companies.add(row.company);
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0, pending: 0, paid: 0, overdue: 0, overdueAmount: 0, companies: new Set<string>() },
    );
  }, [filteredRows]);

  const openB2B = (type: B2BType) => {
    if (!selectedCompany || !selectedMonth) {
      triggerToast("企業と対象月を選択してください", "warn");
      return;
    }
    setB2bType(type);
    setB2bOpen(true);
  };

  const updateBlockStatus = async (row: InvoiceRow, nextStatus: "pending" | "paid") => {
    const id = row.order.firestoreId || row.order.id;
    if (!id) {
      triggerToast("注文IDが見つからないため更新できません", "err");
      return;
    }
    if (payingId) return; // 進行中はガード（連打防止）
    // キャンセル注文は「入金済ブロックのみ表示」の仕様のため、未入金へ戻すと行が一覧から消えて
    // この画面では二度と操作できなくなる(I5)。誤操作防止のため戻しを禁止する。
    if (nextStatus === "pending" && String(row.order.status || "") === "キャンセル") {
      triggerToast("キャンセル注文の入金記録は取り消せません（行が一覧から消え、復元できなくなります）", "warn");
      return;
    }
    // 入金済→未入金 の戻しは売掛消込を巻き戻す破壊的操作。誤クリック防止のため確認する。
    if (nextStatus === "pending") {
      const ok = await confirmDialog("この入金記録を取り消しますか？売掛の消込が巻き戻ります。", { okText: "取り消す", cancelText: "やめる", danger: true });
      if (!ok) return;
    }
    setPayingId(row.block.id);
    // 入金時は入金日(paidAt)を記録し、未入金へ戻す時はクリアする（AR 追跡用メタデータ）。
    const stamp = new Date().toISOString();
    const changes = new Map<string, { status: string; paidAt?: string }>([
      [String(row.block.id), { status: nextStatus, paidAt: nextStatus === "paid" ? stamp : undefined }],
    ]);
    liveOrders.patchOrder(id, { invoiceBlocks: applyBlockStatuses(row.order, changes) });
    triggerToast(nextStatus === "paid" ? "入金済みに更新しました" : "未入金に戻しました", "ok");
    setTimeout(() => setPayingId(null), 400); // 反映までボタンを無効化
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-[24px] font-black tracking-tight text-[#173b38]">請求管理</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-[#7ca39f]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#b5dad6] bg-[#e8f6f5] px-3 py-1 text-[#1e8c86]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2ba8a2]" />
              注文データから月別請求を自動計算
            </span>
            <span>小計・消費税・合計を同じ計算ロジックで表示します</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="secondary" icon="receipt_long" disabled={!selectedCompany || !selectedMonth} onClick={() => openB2B("summary")}>
            請求総括表
          </Btn>
          <Btn variant="primary" icon="list_alt" disabled={!selectedCompany || !selectedMonth} onClick={() => openB2B("detailed")}>
            請求書（総括＋現場別）
          </Btn>
          {(!selectedCompany || !selectedMonth) && (
            <span className="text-xs font-semibold text-slate-400">企業と対象月を選択すると発行できます</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard icon="receipt_long" label="請求ブロック" value={`${filteredRows.length}件`} sub={`${invoiceOrders.length} 注文から集計`} />
        <StatCard icon="apartment" label="取引先" value={`${totals.companies.size}社`} tone="green" />
        <StatCard icon="mail" label="未入金" value={`${totals.pending}件`} sub={`入金済 ${totals.paid}件`} tone="amber" />
        <StatCard icon="schedule" label="延滞" value={`${totals.overdue}件`} sub={totals.overdue > 0 ? yen(totals.overdueAmount) : "なし"} tone="amber" />
        <StatCard icon="payments" label="対象金額" value={yen(totals.total)} sub={`税抜 ${yen(totals.subtotal)} / 税 ${yen(totals.tax)}`} tone="blue" />
      </div>

      <Panel title="請求フィルター" icon="tune" sub="企業・対象月・入金状態で絞り込み">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1.4fr]">
          <div>
            <label className="mb-1.5 block text-xs font-black text-[#46706c]">対象企業</label>
            <select
              value={selectedCompany}
              onChange={(event) => setSelectedCompany(event.target.value)}
              className="h-[38px] w-full rounded-lg border border-[#cfe6e3] bg-white px-3 text-sm font-bold text-[#173b38] outline-none focus:border-[#2ba8a2] focus:ring-2 focus:ring-[#2ba8a2]/10"
            >
              <option value="">すべて</option>
              {companies.map((company) => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black text-[#46706c]">対象月</label>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-[38px] w-full rounded-lg border border-[#cfe6e3] bg-white px-3 text-sm font-bold text-[#173b38] outline-none focus:border-[#2ba8a2] focus:ring-2 focus:ring-[#2ba8a2]/10"
            >
              <option value="">全期間</option>
              {months.map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black text-[#46706c]">状態</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-[38px] w-full rounded-lg border border-[#cfe6e3] bg-white px-3 text-sm font-bold text-[#173b38] outline-none focus:border-[#2ba8a2] focus:ring-2 focus:ring-[#2ba8a2]/10"
            >
              <option value="all">すべて</option>
              <option value="pending">未入金</option>
              <option value="accumulating">集計中</option>
              <option value="paid">入金済</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black text-[#46706c]">検索</label>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#7ca39f]">search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="会社・担当者・伝票番号・現場"
                className="h-[38px] w-full rounded-lg border border-[#cfe6e3] bg-white pl-9 pr-3 text-sm font-bold text-[#173b38] outline-none focus:border-[#2ba8a2] focus:ring-2 focus:ring-[#2ba8a2]/10"
              />
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="請求一覧"
        icon="format_list_bulleted"
        sub={`${filteredRows.length}件 / ${yen(totals.total)}`}
        bodyPad={0}
      >
        {/* 一括入金消込バー：未入金を 1 件以上選択したときだけ表示 */}
        {selectedBlockIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0f0ee] bg-[#e8f6f5] px-4 py-3">
            <span className="text-sm font-black text-[#1e8c86]">{selectedBlockIds.size}件を選択中</span>
            <div className="flex items-center gap-2">
              <Btn size="sm" variant="ghost" icon="close" onClick={() => setSelectedBlockIds(new Set())}>
                選択解除
              </Btn>
              <Btn size="sm" variant="primary" icon="check_circle" disabled={!!payingId} onClick={bulkMarkPaid}>
                選択 {selectedBlockIds.size}件を入金済にする
              </Btn>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-[#fff8e7]/70 text-left text-[11px] font-black text-[#46706c]">
                <th className="px-4 py-3 text-center">
                  {/* 全選択＝現在表示中の未入金ブロックを全選択/解除 */}
                  <input
                    type="checkbox"
                    aria-label="表示中の未入金を全選択"
                    className="h-4 w-4 cursor-pointer accent-[#2ba8a2] disabled:cursor-not-allowed disabled:opacity-40"
                    checked={allShownSelected}
                    disabled={selectableShownIds.length === 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="cursor-pointer select-none px-4 py-3" onClick={() => toggleSort("monthPeriod")}>
                  <span className="inline-flex items-center gap-1">対象月<span className="material-symbols-outlined text-[14px]">{sortIcon("monthPeriod")}</span></span>
                </th>
                <th className="px-4 py-3">伝票</th>
                <th className="cursor-pointer select-none px-4 py-3" onClick={() => toggleSort("company")}>
                  <span className="inline-flex items-center gap-1">取引先<span className="material-symbols-outlined text-[14px]">{sortIcon("company")}</span></span>
                </th>
                <th className="px-4 py-3">現場</th>
                <th className="px-4 py-3 text-right">税抜</th>
                <th className="px-4 py-3 text-right">消費税</th>
                <th className="cursor-pointer select-none px-4 py-3 text-right" onClick={() => toggleSort("total")}>
                  <span className="inline-flex items-center justify-end gap-1">税込<span className="material-symbols-outlined text-[14px]">{sortIcon("total")}</span></span>
                </th>
                <th className="cursor-pointer select-none px-4 py-3 text-center" onClick={() => toggleSort("status")}>
                  <span className="inline-flex items-center justify-center gap-1">状態<span className="material-symbols-outlined text-[14px]">{sortIcon("status")}</span></span>
                </th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm font-bold text-slate-400">
                    条件に一致する請求データがありません。
                  </td>
                </tr>
              ) : (
                paged.shown.map((row) => {
                  const paid = statusKey(String(row.block.status || "")) === "paid";
                  return (
                  <tr
                    key={`${row.orderNumber}-${row.block.id}`}
                    className="cursor-pointer border-t border-[#e0f0ee] hover:bg-[#f8fbfb]"
                    onClick={(event) => {
                      // チェックボックス・操作ボタン等のインタラクティブ要素を押した場合は無視。
                      if ((event.target as HTMLElement).closest("button, input, a")) return;
                      setOpenOrder(row.order);
                    }}
                  >
                    <td className="border-t border-[#e0f0ee] px-4 py-3 text-center">
                      {/* 入金済は選択不可（一括消込の対象外） */}
                      <input
                        type="checkbox"
                        aria-label="この請求を選択"
                        className="h-4 w-4 cursor-pointer accent-[#2ba8a2] disabled:cursor-not-allowed disabled:opacity-40"
                        checked={selectedBlockIds.has(row.block.id)}
                        disabled={paid}
                        onChange={() => toggleSelectOne(row.block.id)}
                      />
                    </td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3">
                      <div className="font-black text-[#173b38]">{row.block.monthPeriod}</div>
                      <div className="mt-0.5 text-[11px] font-bold text-slate-400">{row.block.startDate} 〜 {row.block.endDate}</div>
                    </td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3">
                      <div className="font-mono text-xs font-black text-[#173b38]">{row.orderNumber}</div>
                      <div className="mt-0.5 text-[11px] font-bold text-[#7ca39f]">{row.invoiceType} / {row.itemCount}品目</div>
                    </td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3">
                      <div className="max-w-[220px] truncate font-black text-[#173b38]">{row.company}</div>
                      <div className="mt-0.5 max-w-[220px] truncate text-[11px] font-bold text-slate-400">{row.person}</div>
                    </td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3">
                      <div className="max-w-[190px] truncate font-bold text-slate-600">{row.siteName}</div>
                      {row.order.constructionNumber && (
                        <div className="mt-0.5 text-[11px] font-bold text-slate-400">工事番号: {row.order.constructionNumber}</div>
                      )}
                    </td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3 text-right font-mono font-bold text-slate-600">{yen(row.block.subtotal)}</td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3 text-right font-mono font-bold text-slate-600">{yen(row.block.tax)}</td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3 text-right font-mono text-base font-black text-[#173b38]">{yen(row.block.total)}</td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge tone={statusTone(String(row.block.status || ""))}>{statusLabel(String(row.block.status || ""))}</Badge>
                        {blockOverdue(row.block) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-red-600">
                            <span className="material-symbols-outlined text-[12px]">schedule</span>延滞（期日 {blockDueDate(row.block)?.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" })}）
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border-t border-[#e0f0ee] px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Btn size="sm" variant="secondary" icon="visibility" onClick={() => setViewing(row)}>
                          表示
                        </Btn>
                        {statusKey(String(row.block.status || "")) === "paid" ? (
                          // キャンセル注文は paid 行のみ表示される仕様のため、未入金へ戻すと行が消えて
                          // 復元不能(I5)。ボタン自体を出さない。
                          String(row.order.status || "") === "キャンセル" ? null : (
                          <Btn size="sm" variant="ghost" icon="undo" disabled={payingId === row.block.id} onClick={() => updateBlockStatus(row, "pending")}>
                            未入金へ
                          </Btn>
                          )
                        ) : (
                          <Btn size="sm" variant="primary" icon="check_circle" disabled={payingId === row.block.id} onClick={() => updateBlockStatus(row, "paid")}>
                            入金済
                          </Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
              {paged.hasMore && (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-center">
                    <button onClick={paged.showMore} className="px-5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm font-black text-blue-700">さらに表示（残り {paged.remaining} 件）</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <AdminRentalInvoiceSection
        orders={invoiceOrders}
        monthPeriod={selectedMonth || undefined}
        companyFilter={selectedCompany || undefined}
      />

      {viewing && (
        <DocumentViewer
          order={viewing.order}
          type="請求書"
          blockId={viewing.block.id}
          onClose={() => setViewing(null)}
        />
      )}

      {b2bOpen && selectedCompany && selectedMonth && (
        <B2BInvoiceViewer
          companyName={selectedCompany}
          monthPeriod={selectedMonth}
          type={b2bType}
          orders={invoiceOrders}
          onClose={() => setB2bOpen(false)}
        />
      )}

      {/* 行クリックで注文詳細を開く。ステータス更新は受注タブ（AdminRental）と同じ在庫整合ロジックを踏襲する。 */}
      <AdminOrderDrawer
        open={!!openOrder}
        order={openOrder}
        onClose={() => setOpenOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          // 受注確定（確認済み）は出庫、返却系クローズは settleReturnStock で入庫。
          const raw = (OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id)) || openOrder;
          const flags = stockFlagsForStatusChange(raw, status); // 稼働系への直接変更も未出庫なら出庫（二重計上防止, K7）
          // クローズ時は発生済みの延滞課金（未永続の roll-forward 分）を確定してから閉じる(M2)。
          const billingClose = closeOrderBillingPatch(raw, status);
          liveOrders.patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}), ...flags, ...billingClose });
          triggerToast("ステータスを更新しました", "ok");
        }}
        onUpdateOrder={(id, updates) => {
          liveOrders.patchOrder(id, updates);
          setOpenOrder((prev: any) => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
        }}
      />
    </div>
  );
}
