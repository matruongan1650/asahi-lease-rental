import React, { useMemo, useState } from "react";
import { Badge, Btn, triggerToast } from "../../components/AdminUI";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";
import { useAdminCollection, useAdminOrders } from "../../context/AdminDataContext";
import OrderBus from "../../lib/orderBus";
import { formatStatusWithReturnRequest } from "../../utils/returnLabels";
import { settleReturnStock } from "../../utils/stockLedger";
import { usePagedList } from "../../hooks/usePagedList";

type RecoveryView = "schedule" | "partial" | "full" | "inspection";

function StatCard({ icon, label, value, tone = "blue" }: { icon: string; label: string; value: string | number; tone?: "blue" | "emerald" | "amber" | "rose" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black text-slate-500">{label}</div>
          <div className="mt-1 text-[24px] font-black text-slate-900 tracking-tight">{value}</div>
        </div>
        <span className={`material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-lg text-[20px] ${toneClass}`}>{icon}</span>
      </div>
    </div>
  );
}

function isFullReturn(order: any) {
  return order.returnRequestType === "full" || ["返却済", "返却済み", "完了"].includes(String(order.status || ""));
}

function isPartialReturn(order: any) {
  return order.returnRequestType === "partial" || String(order.status || "") === "一部返却";
}

export default function AdminRecovery() {
  const { rentals, orders, patchOrder } = useAdminOrders();
  const { rows: fieldReports } = useAdminCollection("fieldReports");
  const { rows: inspections } = useAdminCollection("returnInspections");
  const [view, setView] = useState<RecoveryView>("schedule");
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const recoveryRentals = rentals.filter((r: any) => ["レンタル中", "進行中", "延滞"].includes(String(r.status || "")));

  const returnedOrders = useMemo(() => {
    return (orders || []).filter((o: any) => {
      if (!o) return false;
      const items = o.items || [];
      const hasReturnedItems = items.some((item: any) => Number(item?.quantity || 0) > 0);
      const hasRentalItems = items.some((item: any) => item?.type === "rent");
      const hasReturnSignal = Boolean(
        o.returnRequestType ||
        o.actualReturnDate ||
        o.collectionSignature ||
        (Array.isArray(o.collectionPhotos) && o.collectionPhotos.length > 0) ||
        o.inspectedByWarehouse ||
        (o.itemIssues && o.itemIssues.length > 0) ||
        ["検品待ち", "一部返却", "返却済", "返却済み", "完了"].includes(String(o.status || ""))
      );
      return hasReturnedItems && hasRentalItems && hasReturnSignal;
    });
  }, [orders]);

  const partialOrders = returnedOrders.filter(isPartialReturn);
  const fullOrders = returnedOrders.filter((o: any) => isFullReturn(o) && !isPartialReturn(o));
  const inspectionRecords = [...(inspections || [])].sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const pendingReports = fieldReports.filter((fr: any) => fr.status === "未対応").length;
  const overdueCount = rentals.filter((r: any) => r.status === "延滞").length;

  const filteredSchedule = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recoveryRentals.filter((row: any) => !q || [row.id, row.customer, row.site, row.status].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [recoveryRentals, query]);

  const filteredReturns = useMemo(() => {
    const base = view === "partial" ? partialOrders : fullOrders;
    const q = query.trim().toLowerCase();
    return base.filter((row: any) => !q || [row.orderNumber, row.id, row.companyName, row.customer, row.siteName, row.site, row.status].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [view, partialOrders, fullOrders, query]);

  const filteredInspections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inspectionRecords.filter((row: any) => !q || [row.orderNumber, row.orderId, row.company, row.inspector].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [inspectionRecords, query]);

  const schedulePage = usePagedList(filteredSchedule, 50, [query, view]);
  const returnsPage = usePagedList(filteredReturns, 50, [query, view]);

  const handleProcessRecovery = (row: any) => {
    const id = row.firestoreId || row.id;
    if (!id) {
      triggerToast("契約が見つかりませんでした", "err");
      return;
    }
    // ライブの注文で現在ステータスを確認し、二度押し・多端末での再処理（ステータス巻き戻し）を防ぐ。
    const live = (OrderBus.getAll<any>("orders").find((o: any) => o && (o.id === id || o.firestoreId === id)))
      || (orders || []).find((o: any) => o && (o.id === id || o.firestoreId === id));
    if (live && ["検品待ち", "一部返却", "返却済", "返却済み", "完了", "キャンセル"].includes(String(live.status))) {
      triggerToast(`${row.id} はすでに処理済みです`, "info");
      return;
    }
    // 回収完了 → 倉庫の「最終検品」待ちへ。在庫はここでは戻さない（業務要件）。
    // 最終検品が完了したとき（restoreOrderStock）に良品分のみ入庫する。
    // status:"検品待ち" によりスタッフの倉庫検品キュー（StaffJobList warehouse）へ載る。
    // 既に「一部返却」要求の注文は partial を維持（full で上書きしない）。
    const returnRequestType = live?.returnRequestType === "partial" ? "partial" : "full";
    OrderBus.patch("orders", id, { status: "検品待ち", staffStatus: "回収完了", returnRequestType });
    triggerToast(`${row.id} を回収完了 → 倉庫最終検品待ちにしました`, "ok");
  };

  const views = [
    { id: "schedule" as const, label: "回収手配", icon: "local_shipping", count: recoveryRentals.length },
    { id: "partial" as const, label: "一部返却", icon: "difference", count: partialOrders.length },
    { id: "full" as const, label: "一括返却", icon: "assignment_return", count: fullOrders.length },
    { id: "inspection" as const, label: "検品履歴", icon: "fact_check", count: inspectionRecords.length },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[24px] font-black text-slate-900 tracking-tight">回収・返却</h2>
        <div className="mt-2 text-xs font-bold text-slate-500">回収予定、一部返却、一括返却、倉庫検品を分けて確認</div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon="local_shipping" label="回収対象" value={`${recoveryRentals.length}件`} />
        <StatCard icon="difference" label="一部返却" value={`${partialOrders.length}件`} tone="amber" />
        <StatCard icon="assignment_return" label="一括返却" value={`${fullOrders.length}件`} tone="emerald" />
        <StatCard icon="warning" label="延滞 / 報告" value={`${overdueCount}/${pendingReports}`} tone="rose" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="inline-flex w-full rounded-lg border border-slate-200 bg-white p-1 xl:w-auto overflow-x-auto">
              {views.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex h-[38px] flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition-colors xl:flex-none ${
                    view === item.id ? "bg-[#1a1c9a] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">{item.icon}</span>
                  {item.label}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${view === item.id ? "bg-white/18 text-white" : "bg-slate-100 text-slate-500"}`}>{item.count}</span>
                </button>
              ))}
            </div>
            <div className="relative min-w-[280px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">search</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="注文番号・顧客・現場を検索" className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#1a1c9a]/50" />
            </div>
          </div>
        </div>

        {view === "schedule" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead><tr className="border-b border-slate-100 bg-white">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">契約</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">顧客 / 現場</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">返却予定日</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">品目</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">状態</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">操作</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {schedulePage.shown.map((row: any) => (
                  <tr key={row.firestoreId || row.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-sm font-black text-blue-700">{row.id}</td>
                    <td className="px-4 py-3"><div className="text-sm font-black text-slate-900">{row.customer}</div><div className="mt-1 text-xs font-bold text-slate-500">{row.site}</div></td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{row.end}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-black">{row.items || 0}</td>
                    <td className="px-4 py-3"><Badge>{row.status}</Badge></td>
                    <td className="px-4 py-3 text-right"><Btn size="sm" variant="primary" onClick={() => handleProcessRecovery(row)}>一括回収完了</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSchedule.length === 0 && <div className="py-12 text-center text-sm font-bold text-slate-400">回収対象はありません</div>}
            {schedulePage.hasMore && <div className="py-4 text-center border-t border-slate-100"><button onClick={schedulePage.showMore} className="px-5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm font-black text-blue-700">さらに表示（残り {schedulePage.remaining} 件）</button></div>}
          </div>
        )}

        {(view === "partial" || view === "full") && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead><tr className="border-b border-slate-100 bg-white">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">注文</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">顧客 / 現場</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">返却日</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">品目</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">不足・破損</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">状態</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">操作</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {returnsPage.shown.map((order: any) => (
                  <tr key={order.firestoreId || order.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-sm font-black text-blue-700">{order.orderNumber || order.id}</td>
                    <td className="px-4 py-3"><div className="text-sm font-black text-slate-900">{order.companyName || order.customer || "—"}</div><div className="mt-1 text-xs font-bold text-slate-500">{order.siteName || order.site || "現場未設定"}</div></td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{order.actualReturnDate || order.rentalEnd || order.rentalEndDate || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-black">{(order.items || []).length}</td>
                    <td className="px-4 py-3 text-right">{(order.itemIssues || []).length > 0 ? <span className="font-black text-red-600">{order.itemIssues.length}件</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3"><Badge>{formatStatusWithReturnRequest(order.status, order.returnRequestType)}</Badge></td>
                    <td className="px-4 py-3 text-right"><Btn size="sm" variant="secondary" onClick={() => setSelectedOrder(order)}>詳細</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredReturns.length === 0 && <div className="py-12 text-center text-sm font-bold text-slate-400">該当する返却注文はありません</div>}
            {returnsPage.hasMore && <div className="py-4 text-center border-t border-slate-100"><button onClick={returnsPage.showMore} className="px-5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm font-black text-blue-700">さらに表示（残り {returnsPage.remaining} 件）</button></div>}
          </div>
        )}

        {view === "inspection" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead><tr className="border-b border-slate-100 bg-white">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">注文</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">顧客</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">検品日時</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">検品者</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">数量(実/予)</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">不足</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInspections.map((row: any) => (
                  <tr key={row.id || row.orderId || row.orderNumber} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-sm font-black text-blue-700">{row.orderNumber || row.orderId || "—"}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{row.company || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{row.inspectedAt || "—"}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{row.inspector || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-black">{row.totalCounted ?? 0}/{row.totalExpected ?? 0}</td>
                    <td className="px-4 py-3 text-right">{row.hasShortage ? <span className="font-black text-red-600">あり</span> : <span className="text-slate-300">なし</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredInspections.length === 0 && <div className="py-12 text-center text-sm font-bold text-slate-400">検品履歴はありません</div>}
          </div>
        )}
      </div>

      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          const flags = settleReturnStock(selectedOrder, status);
          patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}), ...flags });
          triggerToast("ステータスを更新しました", "ok");
        }}
        onUpdateOrder={(id, updates) => {
          patchOrder(id, updates);
          setSelectedOrder((prev: any) => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
        }}
      />
    </div>
  );
}
