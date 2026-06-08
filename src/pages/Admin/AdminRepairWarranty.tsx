import React, { useState } from "react";
import { useAdminCollection, useAdminData } from "../../context/AdminDataContext";
import {
  Badge,
  Btn,
  Panel,
  KPI,
  Tabs,
  Table,
  triggerToast
} from "../../components/AdminUI";
import AdminDocDrawer from "../../components/AdminDocDrawer";
import { FMT, REPAIR_STATES } from "../../data/adminMockData";
import OrderBus from "../../lib/orderBus";

function QuickAct({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 cursor-pointer flex items-center justify-center transition-colors"
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );
}

export default function AdminRepairWarranty() {
  const [tab, setTab] = useState("すべて");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { rows: repairs, live } = useAdminCollection("repairs");
  const adminData = useAdminData();

  // Dynamic filter based on selected tab
  const filteredRepairs = tab === "すべて"
    ? repairs
    : repairs.filter((r) => r.status === tab);

  const counts: Record<string, number> = {
    "すべて": repairs.length,
    "修理待ち": repairs.filter((r) => r.status === "修理待ち").length,
    "修理中": repairs.filter((r) => r.status === "修理中").length,
    "完了": repairs.filter((r) => r.status === "完了").length,
  };

  const handleCompleteRepair = (id: string) => {
    OrderBus.patch("repairs", id, { status: "完了", cost: 12000 }); // simulated completed repair cost
    triggerToast(`${id} を完了にしました`, "ok");
  };

  // Add new repair handler linked to Drawer callback
  const handleCreateRepair = (doc: any) => {
    OrderBus.push("repairs", {
      id: doc.id,
      asset: doc.customer, // in repair form, customer field is used for asset
      vendor: doc.site, // in repair form, site field is used for vendor
      status: "修理待ち",
      req: doc.date,
      cost: null,
      warranty: true,
      issue: doc.note || "現場報告からの修理依頼"
    });
  };

  const cols = [
    {
      h: "依頼番号",
      cell: (r: any) => <span className="font-mono font-bold text-blue-700">{r.id}</span>,
    },
    {
      h: "対象 / 内容",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.asset}</div>
          <div className="text-[11px] text-slate-400 font-medium">{r.issue}</div>
        </div>
      ),
    },
    { h: "修理業者", wrap: true, cell: (r: any) => <span>{r.vendor}</span> },
    {
      h: "保証",
      cell: (r: any) =>
        r.warranty ? <Badge tone="ok">完了</Badge> : <span className="text-slate-400">対象外</span>,
    },
    {
      h: "費用",
      align: "right" as const,
      cell: (r: any) => (
        <span className="font-mono font-bold">{r.cost ? FMT(r.cost) : "見積中"}</span>
      ),
    },
    {
      h: "依頼日",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono text-[11px] text-slate-400">{r.req}</span>,
    },
    { h: "状態", cell: (r: any) => <Badge>{r.status}</Badge> },
    {
      h: "操作",
      align: "right" as const,
      cell: (r: any) => (
        <div className="inline-flex gap-1.5">
          <QuickAct
            icon="receipt"
            label="修理請求書"
            onClick={() => triggerToast(`${r.id} の修理請求書を表示しました (未実装)`, "info")}
          />
          {r.status !== "完了" && (
            <QuickAct
              icon="check_circle"
              label="完了にする"
              onClick={() => handleCompleteRepair(r.id)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-4">
        <KPI
          label="修理待ち"
          value={counts["修理待ち"] + " 件"}
          icon="hourglass_empty"
          accent="var(--color-secondary)"
        />
        <KPI
          label="修理中"
          value={counts["修理中"] + " 件"}
          icon="build"
        />
        <KPI
          label="完了（今月）"
          value={counts["完了"] + " 件"}
          icon="check_circle"
          accent="var(--color-success)"
        />
        <KPI
          label="保証対象"
          value={repairs.filter((r) => r.warranty).length + " 件"}
          icon="shield"
          accent="var(--color-teal)"
        />
      </div>

      <Tabs tabs={REPAIR_STATES} active={tab} onChange={setTab} counts={counts} />

      <Panel
        title="すべての修理依頼"
        icon="build"
        action={
          <Btn size="sm" variant="primary" icon="add" onClick={() => setDrawerOpen(true)}>
            修理を依頼
          </Btn>
        }
      >
        <Table cols={cols} rows={filteredRepairs} onRow={(r) => triggerToast(`${r.id} を開く (未実装)`, "info")} />
      </Panel>

      <AdminDocDrawer
        open={drawerOpen}
        kind="repair"
        onClose={() => setDrawerOpen(false)}
        onCreate={handleCreateRepair}
      />
    </div>
  );
}
