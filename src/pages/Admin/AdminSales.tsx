import React, { useMemo, useState, useEffect } from "react";
import { Badge, Btn, triggerToast } from "../../components/AdminUI";
import AdminDocDrawer from "../../components/AdminDocDrawer";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";
import { useAdminOrders } from "../../context/AdminDataContext";
import { useServerQuery } from "../../lib/ordersQuery";
import OrderBus from "../../lib/orderBus";
import { confirmDialog } from "../../components/AppDialog";
import { deductOrderStock, settleReturnStock } from "../../utils/stockLedger";
import { getTaxRate } from "../../utils/billing";

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

const SALES_VIEW_STATUS: Record<Exclude<SalesView, "all">, string[]> = {
  pending: ["処理中", "注文確認中"],
  confirmed: ["確認済み", "準備中", "配送中"],
  closed: ["配送済み", "完了", "キャンセル", "返却済", "返却済み"],
};

function toSalesRow(o: any) {
  return {
    _raw: o,
    id: o.orderNumber || o.id,
    firestoreId: o.firestoreId || o.id,
    date: o.date || "",
    customer: o.companyName || `${o.personLastName || ""} ${o.personFirstName || ""}`.trim() || o.personName || "ゲスト",
    site: o.siteName || "—",
    items: (o.items || []).length,
    amount: o.total || 0,
    status: o.status,
  };
}

export default function AdminSales() {
  const liveOrders = useAdminOrders(); // KPI(販売売上) + patchOrder 用
  const [view, setView] = useState<SalesView>("all");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<{ kind: "sale-contract" | "sale-invoice" | null; customer?: string } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { rows, total, statusCounts, hasMore, loading, loadMore, refresh } = useServerQuery(
    "orders",
    { hasType: "buy", statusIn: view === "all" ? undefined : SALES_VIEW_STATUS[view], q: query, counts: true, pageSize: 50 },
    view,
  );
  const displayRows = useMemo(() => rows.map(toSalesRow), [rows]);

  const counts = useMemo(() => {
    const acc: Record<SalesView, number> = { all: 0, pending: 0, confirmed: 0, closed: 0 };
    for (const [st, c] of Object.entries(statusCounts)) { acc.all += Number(c) || 0; acc[viewFor(String(st))] += Number(c) || 0; }
    return acc;
  }, [statusCounts]);

  const handleConfirm = (row: any) => {
    const id = row._raw?.firestoreId || row._raw?.id;
    if (!id) { triggerToast("注文データが見つかりません", "err"); return; }
    // 受注確定 = 現物在庫を減算（出庫）。最新の注文を解決してから台帳を更新する。
    const raw = (OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id || o.orderNumber === id)) || row._raw;
    const flags = deductOrderStock(raw);
    liveOrders.patchOrder(id, { status: "確認済み", staffStatus: "出庫予定", ...flags });
    triggerToast(`${row.id} を販売受注として確定し、在庫を出庫しました`, "ok");
    setTimeout(refresh, 300);
  };

  // 受注待ちの販売注文を却下する。staffStatus は付けないためスタッフ APK には配信されない。
  const handleReject = async (row: any) => {
    const id = row._raw?.firestoreId || row._raw?.id;
    if (!id) { triggerToast("注文データが見つかりません", "err"); return; }
    const ok = await confirmDialog(`${row.id} を却下しますか？\nこの注文は出庫手配されず、キャンセル扱いになります。`, {
      okText: "却下する",
      cancelText: "戻る",
      danger: true,
    });
    if (!ok) return;
    liveOrders.patchOrder(id, { status: "キャンセル", staffStatus: "" });
    triggerToast(`${row.id} を却下しました`, "ok");
    setTimeout(refresh, 300);
  };

  const openDetail = (row: any) => setSelectedOrder(row._raw);

  // 販売契約/請求書ドキュメント作成を実データとして永続化する（以前はトーストのみの no-op）。
  const handleDocCreate = (doc: any) => {
    if (doc.kind === "sale-contract") {
      const items = (doc.lineItems || []).map((li: any) => ({
        id: "it-" + li.id,
        name: li.name,
        type: "buy",
        quantity: Number(li.qty) || 0,
        buyPrice: Number(li.price) || 0,
      }));
      const subtotal = items.reduce((s: number, it: any) => s + it.quantity * it.buyPrice, 0);
      const tax = Math.floor(subtotal * getTaxRate());
      const orderRecord = {
        orderNumber: doc.id,
        companyName: doc.customer,
        siteName: doc.site,
        items,
        subtotal,
        tax,
        total: subtotal + tax,
        status: "確認済み",
        orderType: "buy",
        date: doc.date,
        createdAt: new Date().toISOString(),
      };
      // 販売契約の作成 = 受注確定（確認済み）。現物在庫を出庫し、フラグを付けて push する。
      const flags = deductOrderStock(orderRecord);
      OrderBus.push("orders", { ...orderRecord, ...flags });
      triggerToast(`販売契約 ${doc.id} を作成し、在庫を出庫しました`, "ok");
      setTimeout(refresh, 300);
    } else if (doc.kind === "sale-invoice") {
      OrderBus.push("issuedInvoices", {
        id: doc.id,
        type: "sale",
        customer: doc.customer,
        amount: doc.amount,
        items: doc.lineItems || [],
        issuedAt: new Date().toISOString(),
        date: doc.date,
      });
      triggerToast(`請求書 ${doc.id} を発行しました`, "ok");
    }
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
        <StatCard icon="shopping_cart" label="販売件数" value={`${counts.all}件`} tone="emerald" />
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
              {displayRows.map((row: any) => (
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
                        <>
                          <Btn size="sm" variant="primary" icon="check" onClick={() => handleConfirm(row)}>受注確定</Btn>
                          <button
                            onClick={() => handleReject(row)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-600 hover:bg-rose-100"
                          >
                            <span className="material-symbols-outlined text-[16px]">block</span>
                            却下
                          </button>
                        </>
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
          {total === 0 && !loading && <div className="py-14 text-center text-sm font-bold text-slate-400">該当する販売注文がありません</div>}
          {hasMore && (
            <div className="py-4 text-center border-t border-slate-100">
              <button onClick={loadMore} disabled={loading} className="px-5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm font-black text-blue-700 active:scale-95 transition disabled:opacity-50">
                さらに表示（残り {(total - displayRows.length).toLocaleString()} 件）
              </button>
            </div>
          )}
        </div>
      </div>

      <AdminDocDrawer open={!!drawer} kind={drawer?.kind || null} presetCustomer={drawer?.customer} onClose={() => setDrawer(null)} onCreate={handleDocCreate} />
      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          // ドロワーの「手配する」(処理中→確認済み) も受注確定。出庫を確実に行う。
          const raw = (OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id)) || selectedOrder;
          const flags = status === "確認済み" ? deductOrderStock(raw) : settleReturnStock(raw, status); // 混在注文のキャンセル/返却でレンタル在庫を戻す（他画面と統一）
          liveOrders.patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}), ...flags });
          triggerToast("ステータスを更新しました", "ok");
          setTimeout(refresh, 300);
        }}
        onUpdateOrder={(id, updates) => {
          liveOrders.patchOrder(id, updates);
          setSelectedOrder((prev: any) => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
          setTimeout(refresh, 300);
        }}
      />
    </div>
  );
}
