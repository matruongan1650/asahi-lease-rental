import React, { useState } from "react";
import { useAdminCollection } from "../../context/AdminDataContext";
import {
  Badge,
  Btn,
  Panel,
  KPI,
  Tabs,
  Table,
  Toolbar,
  Modal,
  Field,
  TextInput,
  SelectInput,
  Row,
  triggerToast
} from "../../components/AdminUI";
import { FMT, SUPPLIER_ASSETS } from "../../data/adminMockData";
import OrderBus from "../../lib/orderBus";

export function KV({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-4 py-2.5 border-b border-slate-100">
      <span className="text-xs font-semibold text-slate-500 flex-shrink-0">{label}</span>
      <span className={`text-xs font-bold text-slate-800 text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

interface DetailHeadProps {
  icon: string;
  title: string;
  sub: string;
  badge?: React.ReactNode;
  onBack: () => void;
  actions?: React.ReactNode;
}

export function DetailHead({ icon, title, sub, badge, onBack, actions }: DetailHeadProps) {
  return (
    <div className="flex items-center gap-3.5 mb-5 flex-wrap">
      <button
        onClick={onBack}
        className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center cursor-pointer text-slate-500 hover:bg-slate-50 transition-colors active:scale-95 flex-shrink-0"
      >
        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
      </button>
      <span className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-[24px]">{icon}</span>
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-lg font-black text-slate-800 tracking-tight">{title}</span>
          {badge}
        </div>
        <div className="text-xs text-slate-400 mt-0.5 font-medium">{sub}</div>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export default function AdminSuppliers() {
  const [sel, setSel] = useState<any | null>(null);
  const [tab, setTab] = useState("info");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { rows: suppliers, live } = useAdminCollection("suppliers");

  // State for add supplier form
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierCat, setNewSupplierCat] = useState("保安用品");
  const [newSupplierTel, setNewSupplierTel] = useState("");
  const [newSupplierPayable, setNewSupplierPayable] = useState(0);
  const [newSupplierAssets, setNewSupplierAssets] = useState(0);
  const [newSupplierWarranty, setNewSupplierWarranty] = useState("1年");

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) {
      triggerToast("仕入先名を入力してください", "warn");
      return;
    }
    const newId = "SP-" + Math.floor(204 + Math.random() * 900);
    const item = {
      id: newId,
      name: newSupplierName,
      cat: newSupplierCat,
      tel: newSupplierTel || "03-0000-0000",
      payable: Number(newSupplierPayable) || 0,
      assets: Number(newSupplierAssets) || 0,
      warranty: newSupplierWarranty,
      status: "取引中"
    };

    OrderBus.push("suppliers", item);
    triggerToast(`仕入先 ${newSupplierName} を追加しました`, "ok");
    setIsAddModalOpen(false);

    // Reset fields
    setNewSupplierName("");
    setNewSupplierTel("");
    setNewSupplierPayable(0);
    setNewSupplierAssets(0);
  };

  if (sel) {
    const tabs = [
      { id: "info", label: "仕入先情報" },
      { id: "payable", label: "買掛金" },
      { id: "assets", label: "購入資産一覧" },
      { id: "warranty", label: "資産保証履歴" },
    ];

    const payableRows = [
      { id: "AP-9920", po: "PO-2204", amt: sel.payable > 0 ? sel.payable : 1240000, s: "請求済" },
      { id: "AP-9905", po: "PO-2190", amt: 680000, s: "完了" },
    ];

    return (
      <div className="space-y-4">
        <DetailHead
          icon="storefront"
          title={sel.name}
          sub={`${sel.cat} ・ ${sel.id}`}
          badge={<Badge>{sel.status}</Badge>}
          onBack={() => setSel(null)}
          actions={
            <Btn icon="shopping_cart" variant="primary" onClick={() => triggerToast(`発注伝票を作成しました (仕入先: ${sel.name})`, "ok")}>
              発注
            </Btn>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
          <KPI
            label="買掛金残高"
            value={FMT(sel.payable)}
            icon="payments"
            accent={sel.payable > 0 ? "var(--color-secondary)" : "var(--color-primary)"}
          />
          <KPI
            label="購入資産"
            value={(sel.assets || 0).toLocaleString("ja-JP") + " 点"}
            icon="inventory_2"
          />
          <KPI
            label="保証期間"
            value={sel.warranty || "1年"}
            icon="shield"
            accent="var(--color-teal)"
          />
        </div>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        
        {tab === "info" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel title="仕入先情報" icon="business">
              <KV label="会社名" value={sel.name} />
              <KV label="区分" value={sel.cat} />
              <KV label="仕入先コード" value={sel.id} mono />
              <KV label="標準保証" value={sel.warranty || "1年"} />
            </Panel>
            <Panel title="連絡先" icon="phone">
              <KV label="電話番号" value={sel.tel || "—"} mono />
              <KV label="ステータス" value={sel.status} />
            </Panel>
          </div>
        )}

        {tab === "payable" && (
          <Panel title="買掛金" icon="payments">
            <Table
              cols={[
                { h: "請求番号", cell: (r) => <span className="font-mono text-blue-700 font-bold">{r.id}</span> },
                { h: "発注", cell: (r) => <span className="font-mono text-slate-500">{r.po}</span> },
                { h: "金額", align: "right", cell: (r) => <span className="font-mono font-bold">{FMT(r.amt)}</span> },
                { h: "状態", align: "right", cell: (r) => <Badge>{r.s}</Badge> },
              ]}
              rows={payableRows}
            />
          </Panel>
        )}

        {tab === "assets" && (
          <Panel title="購入資産一覧（仕入先別）" icon="inventory_2">
            <Table
              cols={[
                { h: "品名", wrap: true, cell: (r) => <span className="font-bold">{r.name}</span> },
                { h: "数量", align: "right", cell: (r) => <span className="font-mono">{r.qty}</span> },
                { h: "発注番号", cell: (r) => <span className="font-mono text-slate-500">{r.po}</span> },
                { h: "購入日", cell: (r) => <span className="font-mono text-slate-500">{r.date}</span> },
                { h: "保証期限", align: "right", cell: (r) => <span className="font-mono font-bold text-slate-700">{r.warranty}</span> },
              ]}
              rows={SUPPLIER_ASSETS}
            />
          </Panel>
        )}

        {tab === "warranty" && (
          <Panel title="仕入先別 資産保証履歴" icon="shield">
            <Table
              cols={[
                { h: "品名", wrap: true, cell: (r) => <span className="font-bold">{r.name}</span> },
                { h: "購入日", cell: (r) => <span className="font-mono text-slate-500">{r.date}</span> },
                { h: "保証期限", cell: (r) => <span className="font-mono font-bold text-slate-700">{r.warranty}</span> },
                { h: "状態", align: "right", cell: () => <Badge tone="ok">完了</Badge> },
              ]}
              rows={SUPPLIER_ASSETS}
            />
          </Panel>
        )}
      </div>
    );
  }

  const cols = [
    { h: "コード", cell: (r: any) => <span className="font-mono font-bold text-blue-700">{r.id}</span> },
    {
      h: "仕入先名",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.name}</div>
          <div className="text-[10px] text-slate-400 font-medium">{r.cat}</div>
        </div>
      ),
    },
    {
      h: "買掛金",
      align: "right" as const,
      cell: (r: any) => (
        <span className={`font-mono font-bold ${r.payable > 0 ? "text-amber-600" : "text-slate-800"}`}>
          {FMT(r.payable)}
        </span>
      ),
    },
    { h: "購入資産", align: "right" as const, cell: (r: any) => <span className="font-mono">{(r.assets || 0).toLocaleString("ja-JP")}</span> },
    { h: "保証", cell: (r: any) => <Badge>{r.warranty === "2年" ? "完了" : "在庫"}</Badge> },
    {
      h: "",
      align: "right" as const,
      cell: () => (
        <span className="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        right={
          <Btn icon="add" variant="primary" onClick={() => setIsAddModalOpen(true)}>
            仕入先を追加
          </Btn>
        }
      />
      <Panel
        title="仕入先一覧"
        icon="storefront"
        sub={`${suppliers.length} 社`}
        action={live ? <Badge tone="ok">🟢 live</Badge> : null}
      >
        <Table cols={cols} rows={suppliers} onRow={setSel} />
      </Panel>

      {/* Add Supplier Modal */}
      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="新規仕入先を追加"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveSupplier}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveSupplier} className="space-y-3">
          <Field label="仕入先名" required>
            <TextInput value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} placeholder="例：セフティ産業 株式会社" />
          </Field>
          <Row>
            <Field label="区分" required>
              <SelectInput value={newSupplierCat} onChange={e => setNewSupplierCat(e.target.value)} options={["保安用品", "電動機器・車両系", "照明", "バリケード", "その他"]} />
            </Field>
            <Field label="標準保証" required>
              <SelectInput value={newSupplierWarranty} onChange={e => setNewSupplierWarranty(e.target.value)} options={["1年", "2年", "3年", "なし"]} />
            </Field>
          </Row>
          <Field label="電話番号">
            <TextInput type="tel" value={newSupplierTel} onChange={e => setNewSupplierTel(e.target.value)} placeholder="例：03-3210-4400" />
          </Field>
          <Row>
            <Field label="買掛金残高 (円)">
              <TextInput type="number" min="0" value={newSupplierPayable} onChange={e => setNewSupplierPayable(Number(e.target.value))} />
            </Field>
            <Field label="購入資産点数">
              <TextInput type="number" min="0" value={newSupplierAssets} onChange={e => setNewSupplierAssets(Number(e.target.value))} />
            </Field>
          </Row>
        </form>
      </Modal>
    </div>
  );
}
