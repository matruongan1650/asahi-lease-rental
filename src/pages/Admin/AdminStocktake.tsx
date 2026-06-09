import React from "react";
import {
  Panel,
  Btn,
  Toolbar,
  Table,
  Badge,
  KPI
} from "../../components/AdminUI";
import { useAdminCollection } from "../../context/AdminDataContext";

export default function AdminStocktake() {
  const { rows: products } = useAdminCollection("products");
  
  // Generate stocktake list from real products
  const rows = (products || []).filter(Boolean).map((p: any) => {
    const sysStock = p.stock || 0;
    return {
      id: p.id,
      name: p.name,
      loc: `S-${(p.id?.match(/\d+/)?.[0] || '01').padStart(2, '0')}`,
      system: sysStock,
      counted: sysStock, // By default matches system stock
      state: "確認済"
    };
  });
  
  const diffCount = rows.filter((s: any) => s.counted !== s.system).length;

  const cols = [
    {
      h: "品名",
      wrap: true,
      cell: (r: any) => <span className="font-bold text-slate-800">{r.name}</span>
    },
    {
      h: "棚番",
      cell: (r: any) => <span className="font-mono text-slate-500 font-bold">{r.loc}</span>
    },
    {
      h: "帳簿数",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono text-slate-700">{r.system}</span>
    },
    {
      h: "実数",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono font-bold text-slate-800">{r.counted}</span>
    },
    {
      h: "差異",
      align: "right" as const,
      cell: (r: any) => {
        const d = r.counted - r.system;
        return (
          <span
            className={`font-mono font-bold ${
              d === 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {d > 0 ? "+" : ""}
            {d}
          </span>
        );
      }
    },
    {
      h: "状態",
      align: "right" as const,
      cell: (r: any) => <Badge>{r.state}</Badge>
    }
  ];

  return (
    <div className="space-y-6">
      {/* KPIs Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI label="棚卸対象" value={rows.length + " 品目"} icon="list_alt" />
        <KPI
          label="差異あり"
          value={diffCount + " 品目"}
          icon="error"
          accent="var(--color-warning)"
        />
        <KPI
          label="最終棚卸"
          value="06/02"
          icon="event_note"
          accent="var(--color-neutral-600)"
          sub="月次監査"
        />
      </div>

      {/* Audit operations */}
      <Toolbar
        right={
          <Btn icon="description" variant="primary" onClick={() => triggerStocktakePdf()}>
            棚卸し報告書を出力
          </Btn>
        }
      />

      {/* Main Stocktake Grid */}
      <Panel title="数量差異 ／ 状態" icon="checklist">
        <Table cols={cols} rows={rows} />
      </Panel>
    </div>
  );
}

function triggerStocktakePdf() {
  window.dispatchEvent(
    new CustomEvent("app-toast", {
      detail: { msg: "棚卸し報告書 PDFを生成中... (デモ)", type: "info", id: Date.now() }
    })
  );
}
