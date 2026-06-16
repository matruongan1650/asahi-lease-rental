import React, { useMemo, useState, useEffect } from "react";
import { Badge, Btn, triggerToast } from "../../components/AdminUI";
import AdminDocDrawer from "../../components/AdminDocDrawer";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";
import { useAdminOrders } from "../../context/AdminDataContext";

type SalesView = "all" | "pending" | "confirmed" | "closed";

function StatCard({ icon, label, value, tone = "blue" }: { icon: string; label: string; value: string | number; tone?: "blue" | "emerald" | "amber" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
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

function viewFor(status: string): SalesView {
  if (["処理中", "注文確認中"].includes(status)) return "pending";
  if (["確認済み", "準備中", "配送中"].includes(status)) return "confirmed";
  return "closed";
}

export default function AdminSales() {
  const liveOrders = useAdminOrders();
  const [view, setView] = useState<SalesView>("all");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<{ kind: "sale-contract" | "sale-invoice" | null; customer?: string } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const sales = liveOrders.sales || [];
  const counts = useMemo(() => {
    return sales.reduce((acc: Record<SalesView, number>, row: any) => {
      acc.all += 1;
      acc[viewFor(String(row.status || ""))] += 1;
      return acc;
    }, { all: 0, pending: 0, confirmed: 0, closed: 0 });
  }, [sales]);

  const filteredSales = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter((row: any) => {
      if (view !== "all" && viewFor(String(row.status || "")) !== view) return false;
      if (!q) return true;
      return [row.id, row.customer, row.site, row.status].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [sales, view, query]);

  // 大量データ時に全行描画で重くなるのを防ぐ（段階表示）。
  const PAGE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [view, query]);

  const fullOrderFor = (row: any) =>
    liveOrders.orders.find((o: any) => o.firestoreId === row.firestoreId || o.id === row.firestoreId || o.orderNumber === row.id || o.id === row.id);

  const handleConfirm = (row: any) => {
    const fullOrder = fullOrderFor(row);
    const id = fullOrder?.firestoreId || fullOrder?.id || row.firestoreId;
    if (!id) {
      triggerToast("注文データが見つかりません", "err");
      return;
    }
    liveOrders.patchOrder(id, { status: "確認済み", staffStatus: "出庫予定" });
    triggerToast(`${row.id} を販売受注として確定しました`, "ok");
  };

  const openDetail = (row: any) => {
    const fullOrder = fullOrderFor(row);
    if (!fullOrder) {
      triggerToast("詳細データが見つかりません", "err");
      return;
    }
    setSelectedOrder(fullOrder);
  };

  const views = [
    { id: "all" as const, label: "すべて", icon: "list", count: counts.all },
    { id: "pending" as const, label: "受注待ち", icon: "inbox", count: counts.pending },
    { id: "confirmed" as const, label: "出庫準備", icon: "inventory_2", count: counts.confirmed },
    { id: "closed" as const, label: "完了", icon: "task_alt", count: counts.closed },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-black text-slate-900 tracking-tight">販売受注</h2>
          <div className="mt-2 text-xs font-bold text-slate-500">販売注文の確認、出庫準備、書類確認</div>
        </div>
        <Btn icon="description" variant="primary" onClick={() => setDrawer({ kind: "sale-contract" })}>販売契約を作成</Btn>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon="payments" label="販売売上" value={`¥${(liveOrders.kpis.productSales || 0).toLocaleString()}`} />
        <StatCard icon="shopping_cart" label="販売件数" value={`${sales.length}件`} tone="emerald" />
        <StatCard icon="inbox" label="受注待ち" value={`${counts.pending}件`} tone="amber" />
        <StatCard icon="inventory_2" label="出庫準備" value={`${counts.confirmed}件`} tone="blue" />
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
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${view === item.id ? "bg-white/18 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative min-w-[280px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">search</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="伝票番号・顧客・現場を検索" className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#1a1c9a]/50" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">販売伝票</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">顧客 / 現場</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">品目</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">金額</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">状態</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.slice(0, visibleCount).map((row: any) => (
                <tr key={row.firestoreId || row.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm font-black text-blue-700">{row.id}</div>
                    <div className="mt-1 font-mono text-[10px] font-bold text-slate-400">{row.date}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate text-sm font-black text-slate-900">{row.customer || "—"}</div>
                    <div className="mt-1 max-w-[260px] truncate text-xs font-bold text-slate-500">{row.site || "現場未設定"}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black text-slate-800">{row.items}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black text-slate-900">¥{(row.amount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3"><Badge>{row.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {viewFor(String(row.status || "")) === "pending" && (
                        <Btn size="sm" variant="primary" icon="check" onClick={() => handleConfirm(row)}>受注確定</Btn>
                      )}
                      <button onClick={() => setDrawer({ kind: "sale-invoice", customer: row.customer })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50">
                        <span className="material-symbols-outlined text-[16px]">receipt</span>
                        請求書
                      </button>
                      <button onClick={() => openDetail(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="詳細">
                        <span className="material-symbols-outlined text-[17px]">edit_note</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSales.length === 0 && <div className="py-14 text-center text-sm font-bold text-slate-400">該当する販売注文がありません</div>}
          {filteredSales.length > visibleCount && (
            <div className="py-4 text-center border-t border-slate-100">
              <button onClick={() => setVisibleCount((c) => c + PAGE)} className="px-5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm font-black text-blue-700 active:scale-95 transition">
                さらに表示（残り {filteredSales.length - visibleCount} 件）
              </button>
            </div>
          )}
        </div>
      </div>

      <AdminDocDrawer open={!!drawer} kind={drawer?.kind || null} presetCustomer={drawer?.customer} onClose={() => setDrawer(null)} />
      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          liveOrders.patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}) });
          triggerToast("ステータスを更新しました", "ok");
        }}
        onUpdateOrder={(id, updates) => {
          liveOrders.patchOrder(id, updates);
          setSelectedOrder((prev: any) => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
        }}
      />
    </div>
  );
}
