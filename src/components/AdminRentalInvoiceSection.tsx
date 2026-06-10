import React, { useMemo, useRef, useState } from "react";
import { Panel, Btn, triggerToast } from "./AdminUI";
import { groupOrdersByCompany, RenterGroup, aggregateTotals } from "../utils/rentalInvoiceGrouping";
import {
  issueCompanyInvoice,
  issueRenterInvoice,
  issueOrderInvoice,
  issueAggregatedBreakdown,
} from "../utils/invoiceTemplatesAdmin";

interface Props {
  orders: any[];
  monthPeriod?: string; // YYYY-MM optional filter
  companyFilter?: string;
}

export default function AdminRentalInvoiceSection({ orders, monthPeriod, companyFilter }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false); // 二重クリック防止（Reactのバッチレンダリング用）
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const baseGroups = useMemo(
    () => groupOrdersByCompany(orders, { monthPeriod, companyName: companyFilter || undefined }),
    [orders, monthPeriod, companyFilter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseGroups;
    return baseGroups
      .map(g => ({
        ...g,
        renters: g.renters.filter(r =>
          r.personName.toLowerCase().includes(q) ||
          g.companyName.toLowerCase().includes(q) ||
          r.orders.some((o: any) => (o.orderNumber || "").toLowerCase().includes(q)),
        ),
      }))
      .filter(g => g.renters.length > 0 || g.companyName.toLowerCase().includes(q));
  }, [baseGroups, query]);

  const totals = useMemo(() => aggregateTotals(filtered), [filtered]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const wrap = async (key: string, fn: () => Promise<void>) => {
    if (busyRef.current) return; // ボタンがdisabledになるまでの二重クリック防止
    busyRef.current = true;
    setBusy(key);
    try { await fn(); triggerToast("PDFを生成しました", "ok"); }
    catch (e: any) { console.error(e); triggerToast("PDF生成に失敗しました: " + (e?.message || ""), "err"); }
    finally { busyRef.current = false; setBusy(null); }
  };

  return (
    <Panel
      title="レンタル請求書（会社・担当者別）"
      icon="receipt_long"
      sub={monthPeriod ? `対象月: ${monthPeriod}` : "対象月: 全期間"}
      action={
        <div className="flex gap-2 items-center">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="会社・担当者・伝票番号"
            className="h-9 px-3 text-xs rounded-md border border-slate-200 outline-none focus:border-blue-500 bg-white w-56"
          />
          <Btn
            variant="primary"
            icon="summarize"
            size="sm"
            disabled={busy !== null || filtered.length === 0}
            onClick={() => wrap("aggregated", () => issueAggregatedBreakdown(filtered, monthPeriod))}
          >
            内訳請求書を発行
          </Btn>
        </div>
      }
    >
      {/* Stat strip */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Stat label="会社" value={`${filtered.length} 社`} />
        <Stat label="担当者" value={`${totals.renterCount} 名`} />
        <Stat label="注文" value={`${totals.orderCount} 件`} />
        <Stat label="合計 (税込)" value={`¥${totals.total.toLocaleString()}`} accent />
      </div>

      {filtered.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">
          {monthPeriod ? `${monthPeriod} に該当する請求対象がありません。` : "請求対象データがありません。"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(g => {
            const isOpen = expanded.has(g.companyName);
            return (
              <div key={g.companyName} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <button
                    onClick={() => toggle(g.companyName)}
                    className="flex-1 flex items-center gap-3 text-left cursor-pointer min-w-0"
                  >
                    <span className="material-symbols-outlined text-blue-600">apartment</span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 truncate">{g.companyName}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        担当者 {g.renters.length} 名 / 注文 {g.orderCount} 件
                      </div>
                    </div>
                  </button>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">合計</div>
                    <div className="font-extrabold text-blue-700 text-base font-mono">¥{g.total.toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={busy !== null}
                      onClick={() => wrap(`company:${g.companyName}`, () => issueCompanyInvoice(g, monthPeriod))}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                      会社請求書
                    </button>
                    <button
                      onClick={() => toggle(g.companyName)}
                      className="inline-flex items-center gap-1 h-9 px-2.5 rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">{isOpen ? "expand_less" : "expand_more"}</span>
                      {isOpen ? "閉じる" : "担当者"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="divide-y divide-slate-100">
                    {g.renters.map(r => (
                      <RenterRow
                        key={r.personName}
                        companyName={g.companyName}
                        renter={r}
                        busy={busy}
                        onIssueRenter={() =>
                          wrap(`renter:${g.companyName}:${r.personName}`, () =>
                            issueRenterInvoice(g.companyName, r, monthPeriod),
                          )
                        }
                        onIssueOrder={(o: any) =>
                          wrap(`order:${o.id || o.orderNumber}`, () => issueOrderInvoice(o))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {busy && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl px-6 py-5 shadow-xl flex items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <span className="text-sm font-bold text-slate-800">PDFを生成中…</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${accent ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-slate-50/40"}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-extrabold ${accent ? "text-blue-700" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function RenterRow({
  renter, busy, onIssueRenter, onIssueOrder,
}: {
  companyName: string;
  renter: RenterGroup;
  busy: string | null;
  onIssueRenter: () => void;
  onIssueOrder: (o: any) => void;
}) {
  return (
    <div className="px-4 py-3 bg-slate-50/30">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-slate-400 text-[18px]">person</span>
          <span className="font-bold text-sm text-slate-700 truncate">{renter.personName}</span>
          <span className="text-[10px] text-slate-400">({renter.orders.length}件)</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold font-mono text-sm text-slate-700">¥{renter.total.toLocaleString()}</span>
          <button
            disabled={busy !== null}
            onClick={onIssueRenter}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-blue-600 text-blue-700 bg-white hover:bg-blue-50 text-[11px] font-bold disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">description</span>
            担当者請求書
          </button>
        </div>
      </div>
      <ul className="space-y-1 pl-7">
        {renter.orders.map((o: any) => (
          <li key={o.id || o.orderNumber} className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0 flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-slate-300">receipt</span>
              <span className="font-mono font-semibold text-slate-700 truncate">{o.orderNumber}</span>
              <span className="text-slate-400 truncate">· {o.siteName || "現場未設定"}</span>
              <span className="text-slate-300">· {o.date}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono font-bold text-slate-800">¥{(o.total || 0).toLocaleString()}</span>
              <button
                disabled={busy !== null}
                onClick={() => onIssueOrder(o)}
                title="この注文の請求書"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-blue-50 text-slate-500 hover:text-blue-700 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
