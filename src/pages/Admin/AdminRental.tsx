import React, { useMemo, useState, useEffect } from "react";
import { Badge, Btn, triggerToast } from "../../components/AdminUI";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";
import DocumentViewer from "../../components/DocumentViewer";
import { useAdminOrders } from "../../context/AdminDataContext";
import { useServerQuery } from "../../lib/ordersQuery";
import { formatStatusWithReturnRequest } from "../../utils/returnLabels";

type RentalQueue = "new" | "arranged" | "active" | "closed";

function orderKey(order: any) {
  return order?.firestoreId || order?.id || order?.orderNumber;
}

function normalizeText(value: any) {
  return String(value || "").toLowerCase();
}

function queueFor(status: string): RentalQueue {
  if (["処理中", "注文確認中", "未割当"].includes(status)) return "new";
  if (["確認済み", "配送予定", "準備中", "配送中", "割当済み"].includes(status)) return "arranged";
  if (["進行中", "レンタル中", "配送済み"].includes(status)) return "active";
  return "closed";
}

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
          <div className="mt-1 text-[26px] font-black text-slate-900 tracking-tight">{value}</div>
        </div>
        <span className={`material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-lg text-[20px] ${toneClass}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

const QUEUE_STATUS: Record<RentalQueue, string[]> = {
  new: ["処理中", "注文確認中", "未割当"],
  arranged: ["確認済み", "配送予定", "準備中", "配送中", "割当済み"],
  active: ["進行中", "レンタル中", "配送済み"],
  closed: ["返却済", "返却済み", "完了", "キャンセル", "検品待ち", "一部返却", "回収予定", "回収中"],
};

function toRentalRow(o: any) {
  return {
    _raw: o,
    id: o.orderNumber || o.id,
    firestoreId: o.firestoreId || o.id,
    date: o.date || "",
    customer: o.companyName || `${o.personLastName || ""} ${o.personFirstName || ""}`.trim() || o.personName || "ゲスト",
    site: o.siteName || "—",
    start: (o.rentalStartDate || "").replace(/-/g, "/") || "—",
    end: (o.rentalEndDate || "").replace(/-/g, "/") || "—",
    items: (o.items || []).length,
    amount: o.total || 0,
    status: o.status,
    returnRequestType: o.returnRequestType,
  };
}

export default function AdminRental() {
  const liveOrders = useAdminOrders(); // KPI(レンタル売上) + patchOrder 用
  const [queue, setQueue] = useState<RentalQueue>("new");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [viewingDocOrder, setViewingDocOrder] = useState<any>(null);

  // 数万件でも 1 ページのみ取得（サーバー側でフィルタ＋ページング）。
  const { rows, total, statusCounts, hasMore, loading, loadMore, refresh } = useServerQuery(
    "orders",
    { hasType: "rent", statusIn: QUEUE_STATUS[queue], q: searchQuery, counts: true, pageSize: 50 },
    queue,
  );
  const displayRows = useMemo(() => rows.map(toRentalRow), [rows]);

  // キュー件数バッジ = サーバーの status 別件数をキューへ集約。
  const queueCounts = useMemo(() => {
    const acc: Record<RentalQueue, number> = { new: 0, arranged: 0, active: 0, closed: 0 };
    for (const [st, c] of Object.entries(statusCounts)) acc[queueFor(String(st))] += Number(c) || 0;
    return acc;
  }, [statusCounts]);

  const handleAccept = (row: any) => {
    const id = orderKey(row._raw);
    if (!id) { triggerToast("注文データが見つかりません", "err"); return; }
    liveOrders.patchOrder(id, { status: "確認済み", staffStatus: "配送予定" });
    triggerToast(`${row.id} を受注確定し、配送手配へ送りました`, "ok");
    setTimeout(refresh, 300);
  };

  const handleMoveToActive = (row: any) => {
    const id = orderKey(row._raw);
    if (!id) { triggerToast("注文データが見つかりません", "err"); return; }
    liveOrders.patchOrder(id, { status: "レンタル中", staffStatus: "完了" });
    triggerToast(`${row.id} をレンタル中に更新しました`, "ok");
    setTimeout(refresh, 300);
  };

  const openDetail = (row: any) => setSelectedOrder(row._raw);
  const openDeliveryDoc = (row: any) => setViewingDocOrder(row._raw);

  const queues = [
    { id: "new" as const, label: "受注待ち", icon: "inbox", count: queueCounts.new },
    { id: "arranged" as const, label: "手配中", icon: "local_shipping", count: queueCounts.arranged },
    { id: "active" as const, label: "稼働中", icon: "autorenew", count: queueCounts.active },
    { id: "closed" as const, label: "完了・取消", icon: "task_alt", count: queueCounts.closed },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-black text-slate-900 tracking-tight">受注・レンタル</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              実注文データ連携
            </span>
            <span>{total.toLocaleString()} 件{loading ? "（読込中…）" : ""}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon="inbox" label="受注待ち" value={`${queueCounts.new}件`} tone="amber" />
        <StatCard icon="local_shipping" label="手配中" value={`${queueCounts.arranged}件`} tone="blue" />
        <StatCard icon="autorenew" label="稼働中" value={`${queueCounts.active}件`} tone="emerald" />
        <StatCard icon="payments" label="レンタル売上" value={`¥${(liveOrders.kpis.rentalSales || 0).toLocaleString()}`} tone="blue" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="inline-flex w-full rounded-lg border border-slate-200 bg-white p-1 xl:w-auto overflow-x-auto">
              {queues.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setQueue(item.id)}
                  className={`flex h-[38px] flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition-colors xl:flex-none ${
                    queue === item.id ? "bg-[#1a1c9a] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">{item.icon}</span>
                  {item.label}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${queue === item.id ? "bg-white/18 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {item.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative min-w-[280px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="注文番号・顧客・現場を検索"
                className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#1a1c9a]/50 focus:ring-2 focus:ring-[#1a1c9a]/10"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">注文</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">顧客 / 現場</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">レンタル期間</th>
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
                    <div className="mt-1 font-mono text-[10px] font-bold text-slate-400">{row.date || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate text-sm font-black text-slate-900">{row.customer || "—"}</div>
                    <div className="mt-1 max-w-[260px] truncate text-xs font-bold text-slate-500">{row.site || "現場未設定"}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{row.start} - {row.end}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black text-slate-800">{row.items}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black text-slate-900">¥{(row.amount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Badge tone={queue === "new" ? "warning" : queue === "active" ? "ok" : "default"}>
                      {formatStatusWithReturnRequest(row.status, row.returnRequestType)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {queue === "new" && (
                        <Btn size="sm" variant="primary" icon="send" onClick={() => handleAccept(row)}>
                          受注確定
                        </Btn>
                      )}
                      {queue === "arranged" && (
                        <Btn size="sm" variant="secondary" icon="play_arrow" onClick={() => handleMoveToActive(row)}>
                          稼働開始
                        </Btn>
                      )}
                      <button onClick={() => openDeliveryDoc(row)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50">
                        <span className="material-symbols-outlined text-[16px]">description</span>
                        納品書
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
          {total === 0 && !loading && (
            <div className="py-14 text-center">
              <span className="material-symbols-outlined text-[42px] text-slate-300">inbox</span>
              <div className="mt-2 text-sm font-black text-slate-700">該当するレンタル注文がありません</div>
            </div>
          )}
          {hasMore && (
            <div className="py-4 text-center border-t border-slate-100">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm font-black text-blue-700 active:scale-95 transition disabled:opacity-50"
              >
                さらに表示（残り {(total - displayRows.length).toLocaleString()} 件）
              </button>
            </div>
          )}
        </div>
      </div>

      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          liveOrders.patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}) });
          triggerToast("ステータスを更新しました", "ok");
          setTimeout(refresh, 300);
        }}
        onUpdateOrder={(id, updates) => {
          liveOrders.patchOrder(id, updates);
          setSelectedOrder((prev: any) => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
          setTimeout(refresh, 300);
        }}
      />

      {viewingDocOrder && (
        <DocumentViewer order={viewingDocOrder} type="納品書" onClose={() => setViewingDocOrder(null)} />
      )}
    </div>
  );
}
