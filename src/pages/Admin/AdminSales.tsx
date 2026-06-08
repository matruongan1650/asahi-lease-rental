import React, { useState } from "react";
import {
  Panel,
  Btn,
  Toolbar,
  Table,
  Badge,
  KPI,
  Tabs,
  triggerToast
} from "../../components/AdminUI";
import AdminDocDrawer from "../../components/AdminDocDrawer";
import { useAdminOrders } from "../../context/AdminDataContext";

export default function AdminSales() {
  const [tab, setTab] = useState("contract");
  const [drawer, setDrawer] = useState<{ kind: "sale-contract" | "sale-invoice" | null; customer?: string } | null>(null);
  const liveOrders = useAdminOrders();

  const cols = [
    {
      h: "伝票番号",
      cell: (r: any) => <span className="font-mono text-blue-700 font-bold">{r.id}</span>
    },
    {
      h: "顧客 / 現場",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.customer}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{r.site}</div>
        </div>
      )
    },
    {
      h: "日付",
      cell: (r: any) => <span className="font-mono text-slate-500 text-xs">{r.date}</span>
    },
    {
      h: "品目",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono text-slate-700 font-semibold">{r.items}</span>
    },
    {
      h: "金額",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono font-bold text-slate-800">¥{(r.amount || 0).toLocaleString()}</span>
    },
    {
      h: "状態",
      cell: (r: any) => <Badge>{r.status}</Badge>
    },
    {
      h: "帳票",
      align: "right" as const,
      cell: (r: any) => (
        <div className="inline-flex gap-1.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => triggerToast(`${r.id} の販売契約書を表示`, "info")}
            className="inline-flex items-center gap-1 h-[24px] px-2 rounded-sm border border-slate-200 bg-white hover:bg-slate-50 text-[10.5px] font-bold text-slate-500 cursor-pointer active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[12px]">description</span>
            販売契約
          </button>
          <button
            onClick={() => setDrawer({ kind: "sale-invoice", customer: r.customer })}
            className="inline-flex items-center gap-1 h-[24px] px-2 rounded-sm border border-slate-200 bg-white hover:bg-slate-50 text-[10.5px] font-bold text-slate-500 cursor-pointer active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[12px]">receipt</span>
            請求書
          </button>
        </div>
      )
    }
  ];

  const tabs = [
    { id: "contract", label: "販売契約" },
    { id: "invoice", label: "販売請求書" }
  ];

  const newKind = tab === "contract" ? "sale-contract" : "sale-invoice";
  const ctaText = tab === "invoice" ? "請求書を発行" : "契約を作成";

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI
          label="今月の販売売上"
          value={"¥" + (liveOrders.kpis.productSales || 0).toLocaleString()}
          icon="payments"
          accent="var(--color-primary)"
        />
        <KPI
          label="販売件数"
          value={liveOrders.sales.length + " 件"}
          icon="attach_money"
        />
        <KPI
          label="請求待ち"
          value="1 件"
          icon="mail"
          accent="var(--color-warning)"
        />
      </div>

      {/* Sub Tabs */}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* Main Grid */}
      <Panel
        title={tabs.find(t => t.id === tab)?.label}
        icon="payments"
        sub={liveOrders.live ? "🟢 OrderBus" : undefined}
        action={
          <Btn
            size="sm"
            variant="primary"
            icon="add"
            onClick={() => setDrawer({ kind: newKind })}
          >
            {ctaText}
          </Btn>
        }
      >
        <Table cols={cols} rows={liveOrders.sales} onRow={r => triggerToast(`${r.id} を開く (デモ)`, "info")} />
      </Panel>

      <AdminDocDrawer
        open={!!drawer}
        kind={drawer?.kind || null}
        presetCustomer={drawer?.customer}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
