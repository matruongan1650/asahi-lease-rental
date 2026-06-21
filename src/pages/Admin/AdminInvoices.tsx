import React, { useMemo, useState } from "react";
import { Badge, Btn, Panel, triggerToast } from "../../components/AdminUI";
import { confirmDialog } from "../../components/AppDialog";
import AdminRentalInvoiceSection from "../../components/AdminRentalInvoiceSection";
import B2BInvoiceViewer from "../../components/B2BInvoiceViewer";
import { usePagedList } from "../../hooks/usePagedList";
import DocumentViewer from "../../components/DocumentViewer";
import { useAdminOrders } from "../../context/AdminDataContext";
import { getOrGenerateInvoiceBlocks } from "../../utils/billing";
import type { InvoiceBlock } from "../../types";

type B2BType = "summary" | "detailed";
type StatusFilter = "all" | "accumulating" | "pending" | "paid";

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

function makeRows(orders: any[]): InvoiceRow[] {
  return orders.flatMap((order) => {
    if (!Array.isArray(order.items) || order.items.length === 0) return [];
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

  const invoiceOrders = useMemo(
    () => (liveOrders.orders || []).filter((order: any) => Array.isArray(order.items) && order.items.length > 0),
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

  const paged = usePagedList(filteredRows, 50, [query, selectedCompany, selectedMonth, statusFilter]);

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
    // 入金済→未入金 の戻しは売掛消込を巻き戻す破壊的操作。誤クリック防止のため確認する。
    if (nextStatus === "pending") {
      const ok = await confirmDialog("この入金記録を取り消しますか？売掛の消込が巻き戻ります。", { okText: "取り消す", cancelText: "やめる", danger: true });
      if (!ok) return;
    }
    setPayingId(row.block.id);
    // 入金時は入金日(paidAt)を記録し、未入金へ戻す時はクリアする（AR 追跡用メタデータ）。
    const stamp = new Date().toISOString();
    const nextBlocks = getOrGenerateInvoiceBlocks(row.order).map((block) =>
      block.id === row.block.id
        ? ({ ...block, status: nextStatus, paidAt: nextStatus === "paid" ? stamp : undefined } as any)
        : block,
    );

    liveOrders.patchOrder(id, { invoiceBlocks: nextBlocks });
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
            総合請求書
          </Btn>
          <Btn variant="primary" icon="list_alt" disabled={!selectedCompany || !selectedMonth} onClick={() => openB2B("detailed")}>
            内訳請求書
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-[#fff8e7]/70 text-left text-[11px] font-black text-[#46706c]">
                <th className="px-4 py-3">対象月</th>
                <th className="px-4 py-3">伝票</th>
                <th className="px-4 py-3">取引先</th>
                <th className="px-4 py-3">現場</th>
                <th className="px-4 py-3 text-right">税抜</th>
                <th className="px-4 py-3 text-right">消費税</th>
                <th className="px-4 py-3 text-right">税込</th>
                <th className="px-4 py-3 text-center">状態</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm font-bold text-slate-400">
                    条件に一致する請求データがありません。
                  </td>
                </tr>
              ) : (
                paged.shown.map((row) => (
                  <tr key={`${row.orderNumber}-${row.block.id}`} className="border-t border-[#e0f0ee] hover:bg-[#f8fbfb]">
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
                          <Btn size="sm" variant="ghost" icon="undo" disabled={payingId === row.block.id} onClick={() => updateBlockStatus(row, "pending")}>
                            未入金へ
                          </Btn>
                        ) : (
                          <Btn size="sm" variant="primary" icon="check_circle" disabled={payingId === row.block.id} onClick={() => updateBlockStatus(row, "paid")}>
                            入金済
                          </Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {paged.hasMore && (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-center">
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
    </div>
  );
}
