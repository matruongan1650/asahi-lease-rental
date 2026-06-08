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
import { useAdminCollection } from "../../context/AdminDataContext";
import OrderBus from "../../lib/orderBus";

export default function AdminStockIn() {
  const { rows } = useAdminCollection("stockIn");
  const { rows: warehouseRows } = useAdminCollection("warehouse");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states
  const [itemSelect, setItemSelect] = useState("");
  const [customItem, setCustomItem] = useState("");
  const [qty, setQty] = useState(10);
  const [src, setSrc] = useState("");
  const [type, setType] = useState("新規購入");
  const [staff, setStaff] = useState("佐藤");

  // Get options for items from current warehouse
  const itemOptions = ["", ...warehouseRows.map(w => w.name), "その他 (直接入力)"];

  const handleSaveStockIn = (e: React.FormEvent) => {
    e.preventDefault();
    const itemName = itemSelect === "その他 (直接入力)" ? customItem : itemSelect;
    if (!itemName.trim()) {
      triggerToast("品名を選択または入力してください", "warn");
      return;
    }
    if (qty <= 0) {
      triggerToast("数量は1以上にしてください", "warn");
      return;
    }

    const newId = "IN-" + Math.floor(7700 + Math.random() * 200);
    const dateStr = new Date().toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/");

    const stockInItem = {
      id: newId,
      item: itemName,
      qty: Number(qty) || 0,
      date: dateStr,
      src: src || (type === "新規購入" ? "新規購入 PO-" + Math.floor(2200 + Math.random() * 50) : "回収 RT-" + Math.floor(5000 + Math.random() * 200)),
      type,
      staff
    };

    // 1. Push to stockIn
    OrderBus.push("stockIn", stockInItem);

    // 2. Increment quantity in warehouse
    const match = warehouseRows.find(w => w.name === itemName);
    if (match) {
      const nextTotal = (match.total || 0) + Number(qty);
      const nextAvailable = (match.available || 0) + Number(qty);
      OrderBus.patch("warehouse", match.id, {
        total: nextTotal,
        available: nextAvailable
      });
      triggerToast(`入庫を記録し、倉庫 ${match.loc} の ${itemName} 在庫を +${qty} 増やしました`, "ok");
    } else {
      // create new warehouse entry if not present
      const newWhId = "W-" + Math.floor(10 + Math.random() * 80);
      OrderBus.push("warehouse", {
        id: newWhId,
        name: itemName,
        loc: "A-01 (自動割当)",
        total: Number(qty),
        rented: 0,
        available: Number(qty),
        cat: "その他"
      });
      triggerToast(`入庫を記録し、倉庫に新しい品目 ${itemName} を登録しました`, "ok");
    }

    setIsAddModalOpen(false);

    // Reset
    setItemSelect("");
    setCustomItem("");
    setQty(10);
    setSrc("");
  };

  const cols = [
    {
      h: "入庫番号",
      cell: (r: any) => <span className="font-mono text-blue-700 font-bold">{r.id}</span>
    },
    {
      h: "品名",
      wrap: true,
      cell: (r: any) => <span className="font-bold text-slate-800">{r.item}</span>
    },
    {
      h: "数量",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono font-bold text-emerald-600">+{r.qty}</span>
    },
    {
      h: "区分",
      cell: (r: any) => <Badge tone={r.type === "新規購入" ? "ok" : undefined}>{r.type === "新規購入" ? "完了" : "在庫"}</Badge>
    },
    {
      h: "区分名",
      cell: (r: any) => <span className="text-slate-500 text-xs font-semibold">{r.type}</span>
    },
    {
      h: "参照",
      wrap: true,
      cell: (r: any) => <span className="text-slate-500 text-xs">{r.src}</span>
    },
    {
      h: "日時",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono text-slate-400 text-xs">{r.date}</span>
    },
    {
      h: "担当",
      align: "right" as const,
      cell: (r: any) => <span className="font-bold text-slate-700">{r.staff}</span>
    }
  ];

  return (
    <div className="space-y-6">
      <Toolbar
        right={
          <Btn icon="add" variant="primary" onClick={() => setIsAddModalOpen(true)}>
            新規購入を登録
          </Btn>
        }
      >
        <Btn size="sm" icon="date_range" variant="ghost" onClick={() => triggerToast("期間フィルター（全期間表示中）", "info")}>
          期間
        </Btn>
      </Toolbar>
      
      <Panel title="入庫履歴" icon="login">
        <Table cols={cols} rows={rows} />
      </Panel>

      {/* Add Stock In Modal */}
      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="新規入庫・購入を記録"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveStockIn}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveStockIn} className="space-y-3">
          <Field label="対象品名" required>
            <SelectInput value={itemSelect} onChange={e => setItemSelect(e.target.value)} options={itemOptions.map(v => ({ v, l: v || "選択してください" }))} />
          </Field>
          {itemSelect === "その他 (直接入力)" && (
            <Field label="直接入力品名" required>
              <TextInput value={customItem} onChange={e => setCustomItem(e.target.value)} placeholder="例：新型カラーコーン 青" />
            </Field>
          )}
          <Row>
            <Field label="数量" required>
              <TextInput type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} />
            </Field>
            <Field label="入庫区分" required>
              <SelectInput value={type} onChange={e => setType(e.target.value)} options={["新規購入", "回収戻し", "その他"]} />
            </Field>
          </Row>
          <Field label="伝票参照 (任意)">
            <TextInput value={src} onChange={e => setSrc(e.target.value)} placeholder="例：PO-2204" />
          </Field>
          <Field label="担当者" required>
            <TextInput value={staff} onChange={e => setStaff(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
