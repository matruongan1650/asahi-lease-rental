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

export default function AdminStockOut() {
  const { rows } = useAdminCollection("stockOut");
  const { rows: warehouseRows } = useAdminCollection("warehouse");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [actionKind, setActionKind] = useState<"レンタル" | "販売">("レンタル");

  // Form states
  const [itemSelect, setItemSelect] = useState("");
  const [qty, setQty] = useState(10);
  const [dst, setDst] = useState("");
  const [staff, setStaff] = useState("佐藤");

  const itemOptions = ["", ...warehouseRows.map(w => w.name)];

  const handleOpenModal = (kind: "レンタル" | "販売") => {
    setActionKind(kind);
    setIsAddModalOpen(true);
  };

  const handleSaveStockOut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemSelect.trim()) {
      triggerToast("品名を選択してください", "warn");
      return;
    }
    if (qty <= 0) {
      triggerToast("数量は1以上にしてください", "warn");
      return;
    }

    // Check inventory availability
    const match = warehouseRows.find(w => w.name === itemSelect);
    if (!match) {
      triggerToast("選択された品目が倉庫に見つかりません", "err");
      return;
    }
    if (match.available < qty) {
      triggerToast(`在庫不足です (利用可能: ${match.available}点, 出庫要求: ${qty}点)`, "warn");
      return;
    }

    const newId = "OUT-" + Math.floor(9900 + Math.random() * 90);
    const dateStr = new Date().toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/");

    const stockOutItem = {
      id: newId,
      item: itemSelect,
      qty: Number(qty) || 0,
      date: dateStr,
      dst: dst || "東京中央現場",
      type: actionKind,
      staff
    };

    // 1. Push to stockOut
    OrderBus.push("stockOut", stockOutItem);

    // 2. Decrement warehouse counts
    const nextAvailable = match.available - Number(qty);
    const nextRented = actionKind === "レンタル" ? (match.rented || 0) + Number(qty) : (match.rented || 0);
    // If it's a sale, it subtracts from total count as well because it leaves the assets list completely
    const nextTotal = actionKind === "販売" ? (match.total || 0) - Number(qty) : (match.total || 0);

    OrderBus.patch("warehouse", match.id, {
      available: nextAvailable,
      rented: nextRented,
      total: nextTotal
    });

    triggerToast(`出庫を記録し、倉庫 ${match.loc} の ${itemSelect} 在庫を -${qty} 減らしました`, "ok");
    setIsAddModalOpen(false);

    // Reset
    setItemSelect("");
    setQty(10);
    setDst("");
  };

  const cols = [
    {
      h: "出庫番号",
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
      cell: (r: any) => <span className="font-mono font-bold text-blue-700">−{r.qty}</span>
    },
    {
      h: "区分",
      cell: (r: any) => <Badge>{r.type === "レンタル" ? "レンタル中" : "完了"}</Badge>
    },
    {
      h: "区分名",
      cell: (r: any) => <span className="text-slate-500 text-xs font-semibold">{r.type}</span>
    },
    {
      h: "納品先",
      wrap: true,
      cell: (r: any) => <span className="text-slate-600 text-xs">{r.dst}</span>
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
          <div className="flex gap-2">
            <Btn icon="autorenew" onClick={() => handleOpenModal("レンタル")}>
              レンタル出庫
            </Btn>
            <Btn icon="payments" variant="primary" onClick={() => handleOpenModal("販売")}>
              販売出庫
            </Btn>
          </div>
        }
      />
      
      <Panel title="出庫履歴" icon="logout">
        <Table cols={cols} rows={rows} />
      </Panel>

      {/* Add Stock Out Modal */}
      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={`${actionKind}出庫を記録`}
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveStockOut}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveStockOut} className="space-y-3">
          <Field label="対象品名" required>
            <SelectInput value={itemSelect} onChange={e => setItemSelect(e.target.value)} options={itemOptions.map(v => ({ v, l: v || "選択してください" }))} />
          </Field>
          <Row>
            <Field label="数量" required>
              <TextInput type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} />
            </Field>
            <Field label="納品先・工事現場" required>
              <TextInput value={dst} onChange={e => setDst(e.target.value)} placeholder="例：大成建設 / 品川現場" />
            </Field>
          </Row>
          <Field label="担当者" required>
            <TextInput value={staff} onChange={e => setStaff(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
