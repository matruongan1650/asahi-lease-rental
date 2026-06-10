import React, { useState } from "react";
import { useAdminOrders, useAdminCollection } from "../../context/AdminDataContext";
import {
  Badge,
  Btn,
  Panel,
  KPI,
  Table,
  triggerToast
} from "../../components/AdminUI";
import { FMT } from "../../data/adminMockData";
import OrderBus from "../../lib/orderBus";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";

export default function AdminRecovery() {
  const { rentals, orders, live, patchOrder } = useAdminOrders();
  const { rows: fieldReports } = useAdminCollection("fieldReports");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Filter rentals that are either renting or overdue for recovery scheduling
  const recoveryRentals = rentals.filter(
    (r) => r.status === "レンタル中" || r.status === "進行中" || r.status === "延滞"
  );

  // 返却・回収が発生した注文（検品待ち・一部返却・返却済・完了）。詳細を確認できるようにする。
  const RETURN_STATUSES = ["検品待ち", "一部返却", "返却済", "返却済み", "完了"];
  const returnedOrders = (orders || []).filter(
    (o: any) =>
      o &&
      (RETURN_STATUSES.includes(o.status) ||
        o.staffStatus === "回収完了" ||
        o.staffStatus === "完了" ||
        o.collectionSignature ||
        (o.itemIssues && o.itemIssues.length > 0))
  );

  const returnedCols = [
    {
      h: "注文番号",
      cell: (o: any) => <span className="font-mono font-bold text-blue-700">{o.orderNumber || o.id}</span>,
    },
    {
      h: "顧客 / 現場",
      wrap: true,
      cell: (o: any) => (
        <div>
          <div className="font-bold text-slate-800">{o.customer}</div>
          <div className="text-[11px] text-slate-400 font-medium">{o.site}</div>
        </div>
      ),
    },
    {
      h: "返却日",
      cell: (o: any) => <span className="font-mono text-slate-500">{o.actualReturnDate || o.rentalEnd || o.rentalEndDate || "—"}</span>,
    },
    {
      h: "返却品目",
      align: "right" as const,
      cell: (o: any) => <span className="font-mono">{(o.items || []).length} 品目</span>,
    },
    {
      h: "不足・破損",
      align: "right" as const,
      cell: (o: any) =>
        o.itemIssues && o.itemIssues.length > 0 ? (
          <span className="font-bold text-red-600">{o.itemIssues.length} 件</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      h: "状態",
      cell: (o: any) => <Badge>{o.status}</Badge>,
    },
    {
      h: "操作",
      align: "right" as const,
      cell: (o: any) => (
        <Btn size="sm" variant="secondary" onClick={() => setSelectedOrder(o)}>
          詳細
        </Btn>
      ),
    },
  ];

  const pendingReports = fieldReports.filter((fr) => fr.status === "未対応").length;
  const overdueCount = rentals.filter((r) => r.status === "延滞").length;

  const handleProcessRecovery = (id: string) => {
    // Simulate updating order status to returned
    const target = rentals.find(r => r.id === id);
    if (target) {
      const firestoreId = target.firestoreId || target.id;
      OrderBus.patch("orders", firestoreId, { status: "返却済み", staffStatus: "完了" });
      triggerToast(`契約 ${id} の回収を完了にしました`, "ok");
    } else {
      triggerToast("契約が見つかりませんでした", "err");
    }
  };

  const cols = [
    {
      h: "契約番号",
      cell: (r: any) => <span className="font-mono font-bold text-blue-700">{r.id}</span>,
    },
    {
      h: "顧客 / 現場",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.customer}</div>
          <div className="text-[11px] text-slate-400 font-medium">{r.site}</div>
        </div>
      ),
    },
    {
      h: "返却予定日",
      cell: (r: any) => <span className="font-mono text-slate-500">{r.end}</span>,
    },
    {
      h: "品目数",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono">{r.items || 0}</span>,
    },
    {
      h: "状態",
      cell: (r: any) => <Badge>{r.status}</Badge>,
    },
    {
      h: "操作",
      align: "right" as const,
      cell: (r: any) => (
        <div className="inline-flex gap-1.5">
          <Btn size="sm" variant="secondary" onClick={() => triggerToast(`${r.id} の回収ルートを確認中 (未実装)`, "info")}>
            ルート
          </Btn>
          <Btn size="sm" variant="primary" onClick={() => handleProcessRecovery(r.id)}>
            回収完了
          </Btn>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
        <KPI
          label="回収対象（稼働中）"
          value={recoveryRentals.length + " 件"}
          icon="local_shipping"
        />
        <KPI
          label="延滞中"
          value={overdueCount + " 件"}
          icon="warning"
          accent="var(--color-danger)"
        />
        <KPI
          label="未対応の現場報告"
          value={pendingReports + " 件"}
          icon="inbox"
          accent="var(--color-secondary)"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Panel
          title="回収・返却手配リスト"
          icon="local_shipping"
          sub="現在レンタル中または返却遅延が発生している現場一覧"
        >
          <Table cols={cols} rows={recoveryRentals} />
        </Panel>

        <Panel
          title="返却・検品 履歴"
          icon="assignment_return"
          sub="お客様が返却した注文（検品待ち・一部返却・返却済）。行の「詳細」で返却品目・サイン・不足/破損を確認できます。"
        >
          {returnedOrders.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">返却された注文はまだありません。</div>
          ) : (
            <Table cols={returnedCols} rows={returnedOrders} />
          )}
        </Panel>
      </div>

      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}) });
          triggerToast("ステータスを更新しました", "ok");
        }}
        onUpdateOrder={(id, updates) => {
          patchOrder(id, updates);
          setSelectedOrder((prev: any) =>
            prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev
          );
        }}
      />
    </div>
  );
}
