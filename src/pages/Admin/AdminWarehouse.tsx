import React, { useState } from "react";
import {
  Panel,
  Btn,
  Toolbar,
  Table,
  Badge,
  Modal,
  Field,
  TextInput,
  SelectInput,
  Row,
  triggerToast
} from "../../components/AdminUI";
import { useAdminCollection, useAdminData } from "../../context/AdminDataContext";
import OrderBus from "../../lib/orderBus";

export default function AdminWarehouse() {
  const { raw: orders } = useAdminData();
  const { rows: products } = useAdminCollection("products");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Compute live warehouse data from products and orders
  const rentedCounts: Record<string, number> = {};
  
  // Calculate rented quantities from active orders
  (orders || []).forEach(o => {
    // Exclude cancelled and completed (returned) orders from 'rented' stock
    const isCompleted = o.status === "完了" || o.status === "キャンセル" || o.staffStatus === "完了";
    if (!isCompleted && o.items) {
      o.items.forEach((item: any) => {
        if (item.type === "rent") {
          rentedCounts[item.id] = (rentedCounts[item.id] || 0) + (item.quantity || 1);
        }
      });
    }
  });

  // Map products to warehouse rows
  const liveRows = products.map(p => {
    const rented = rentedCounts[p.id] || 0;
    const total = p.stock || 0;
    // Generate a pseudo location based on ID if none exists
    const numMatch = p.id.match(/\d+/);
    const loc = `S-${numMatch ? numMatch[0].padStart(2, '0') : '01'}`;
    
    return {
      id: p.id,
      name: p.name,
      loc: loc,
      total: total,
      rented: rented,
      available: Math.max(0, total - rented),
      cat: p.category
    };
  });

  const rows = liveRows.length > 0 ? liveRows : [];

  // Form states
  const [newName, setNewName] = useState("");
  const [newLoc, setNewLoc] = useState("");
  const [newTotal, setNewTotal] = useState(100);
  const [newRented, setNewRented] = useState(0);
  const [newCat, setNewCat] = useState("コーン");

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      triggerToast("品名を入力してください", "warn");
      return;
    }
    if (!newLoc.trim()) {
      triggerToast("棚番を入力してください", "warn");
      return;
    }

    const newId = "P-" + Math.floor(1000 + Math.random() * 9000);
    const newProduct = {
      id: newId,
      name: newName,
      category: newCat,
      stock: Number(newTotal) || 0,
      image: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=400", // placeholder
      rentPrice: 1000,
      buyPrice: 5000,
    };

    // Add to real products store
    OrderBus.push("products", newProduct);
    
    triggerToast(`品目 ${newName} を倉庫に登録しました`, "ok");
    setIsAddModalOpen(false);

    // Reset
    setNewName("");
    setNewLoc("");
    setNewTotal(100);
    setNewRented(0);
  };

  const cols = [
    {
      h: "品名",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.name}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{r.cat}</div>
        </div>
      )
    },
    {
      h: "棚番",
      cell: (r: any) => <span className="font-mono text-slate-500 font-bold">{r.loc}</span>
    },
    {
      h: "総数",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono font-bold text-slate-800">{r.total}</span>
    },
    {
      h: "貸出中",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono text-blue-700 font-semibold">{r.rented}</span>
    },
    {
      h: "在庫",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono font-extrabold text-slate-800">{r.available}</span>
    },
    {
      h: "稼働率",
      cell: (r: any) => {
        const pct = r.total ? Math.round((r.rented / r.total) * 100) : 0;
        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                style={{ width: `${pct}%` }}
                className="h-full rounded-full bg-blue-600"
              />
            </div>
            <span className="font-mono font-bold text-[11.5px] text-slate-400 w-8 text-right">
              {pct}%
            </span>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">総保管数</p>
            <h4 className="text-2xl font-black text-slate-800 mt-1 font-mono">
              {rows.reduce((a, r) => a + (r.total || 0), 0).toLocaleString()}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-blue-100">warehouse</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">稼働中（貸出）</p>
            <h4 className="text-2xl font-black text-blue-600 mt-1 font-mono">
              {rows.reduce((a, r) => a + (r.rented || 0), 0).toLocaleString()}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-blue-100">sync</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">倉庫在庫</p>
            <h4 className="text-2xl font-black text-slate-800 mt-1 font-mono">
              {rows.reduce((a, r) => a + (r.available || 0), 0).toLocaleString()}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-blue-100">inventory_2</span>
        </div>
      </div>

      {/* Toolbar actions */}
      <Toolbar
        right={
          <Btn icon="add" variant="primary" onClick={() => setIsAddModalOpen(true)}>
            品目を追加
          </Btn>
        }
      >
        <div className="flex gap-2">
          <Btn size="sm" icon="filter" variant="ghost" onClick={() => triggerToast("カテゴリフィルターを開きました", "info")}>
            カテゴリ
          </Btn>
          <Btn size="sm" icon="grid_view" variant="ghost" onClick={() => triggerToast("棚レイアウトを表示しました", "info")}>
            棚レイアウト
          </Btn>
        </div>
      </Toolbar>

      {/* Main Shelves Panel */}
      <Panel title="倉庫管理・在庫管理" icon="warehouse">
        <Table cols={cols} rows={rows} />
      </Panel>

      {/* Add Shelf Item Modal */}
      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="倉庫に品目・棚番を登録"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveItem}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveItem} className="space-y-3">
          <Field label="品名" required>
            <TextInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：カラーコーン 赤" />
          </Field>
          <Row>
            <Field label="カテゴリ" required>
              <SelectInput value={newCat} onChange={e => setNewCat(e.target.value)} options={["コーン", "バリケード", "看板", "フェンス", "ウェイト", "照明", "電動機器", "その他"]} />
            </Field>
            <Field label="棚番" required>
              <TextInput value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="例：A-01" />
            </Field>
          </Row>
          <Row>
            <Field label="総保管数" required>
              <TextInput type="number" min="0" value={newTotal} onChange={e => setNewTotal(Number(e.target.value))} />
            </Field>
            <Field label="内 貸出中数" required>
              <TextInput type="number" min="0" value={newRented} onChange={e => setNewRented(Number(e.target.value))} />
            </Field>
          </Row>
        </form>
      </Modal>
    </div>
  );
}
