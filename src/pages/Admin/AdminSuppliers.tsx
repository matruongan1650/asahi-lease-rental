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
  TextArea,
  SelectInput,
  Row,
  triggerToast
} from "../../components/AdminUI";
import { FMT } from "../../data/adminMockData";
import { confirmDialog } from "../../components/AppDialog";
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
  const { rows: purchaseOrders } = useAdminCollection("purchaseOrders");

  // 買掛金は発注（purchaseOrders）から集計する唯一の真実。手入力の payable と二重計上しない。受領済は除外。
  const payableBySupplier: Record<string, number> = {};
  (purchaseOrders as any[]).forEach((po) => {
    if (!po || po.status === "受領済") return;
    const key = po.supplierId || po.supplierName;
    if (!key) return;
    payableBySupplier[key] = (payableBySupplier[key] || 0) + (Number(po.total) || 0);
  });
  const payableOf = (s: any) => payableBySupplier[s?.id] ?? payableBySupplier[s?.name] ?? 0;
  // 購入資産数も発注実データから集計する（詳細画面の assetTotalQty と一致させる）。
  // 静的な r.assets はフォーム作成の新規仕入先には付かず常に 0、シード分は古い値で固定されるため使わない。
  const assetQtyBySupplier: Record<string, number> = {};
  (purchaseOrders as any[]).forEach((po) => {
    if (!po) return;
    const key = po.supplierId || po.supplierName;
    if (!key) return;
    const qty = (po.items || []).reduce((s: number, it: any) => s + (Number(it.qty) || 0), 0);
    assetQtyBySupplier[key] = (assetQtyBySupplier[key] || 0) + qty;
  });
  const assetQtyOf = (s: any) => assetQtyBySupplier[s?.id] ?? assetQtyBySupplier[s?.name] ?? 0;
  // 発注品名の候補は商品マスタ（products）から。未シードの "warehouse" は使わない。
  const { rows: products } = useAdminCollection("products");

  // State for purchase order (発注) form
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [poItems, setPoItems] = useState<{ name: string; qty: number; unitPrice: number }[]>([
    { name: "", qty: 1, unitPrice: 0 }
  ]);
  const [poExpectedDelivery, setPoExpectedDelivery] = useState("");
  const [poNote, setPoNote] = useState("");

  const itemNameOptions = ["", ...products.map((p: any) => p.name).filter(Boolean)];

  const openPOModal = () => {
    setPoItems([{ name: "", qty: 1, unitPrice: 0 }]);
    setPoExpectedDelivery("");
    setPoNote("");
    setIsPOModalOpen(true);
  };

  const updatePoItem = (idx: number, patch: Partial<{ name: string; qty: number; unitPrice: number }>) => {
    setPoItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addPoItem = () => setPoItems((items) => [...items, { name: "", qty: 1, unitPrice: 0 }]);
  const removePoItem = (idx: number) => setPoItems((items) => (items.length > 1 ? items.filter((_, i) => i !== idx) : items));

  const poTotal = poItems.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel) return;
    const cleanItems = poItems
      .map((it) => ({ name: it.name.trim(), qty: Number(it.qty) || 0, unitPrice: Number(it.unitPrice) || 0 }))
      .filter((it) => it.name && it.qty > 0);
    if (cleanItems.length === 0) {
      triggerToast("発注する品名と数量を入力してください", "warn");
      return;
    }

    const total = cleanItems.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
    // 衝突しにくい発注ID。800通り(PO-2200..2999)では数百件で重複し、買掛金KPIが壊れるため
    // ミリ秒タイムスタンプ下7桁 + 3桁乱数で採番する。
    const newId = "PO-" + String(Date.now()).slice(-7) + "-" + String(Math.floor(100 + Math.random() * 900));
    // 発注日も JST(UTC+9)で記録（+9h シフト）。toISOString() の UTC で夕方JSTの発注が前日付になるのを防ぐ。
    const dateStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/");

    OrderBus.push("purchaseOrders", {
      id: newId,
      supplierId: sel.id,
      supplierName: sel.name,
      items: cleanItems,
      total,
      status: "発注済",
      expectedDelivery: poExpectedDelivery || "",
      note: poNote || "",
      date: dateStr
    });

    // 買掛金は発注（purchaseOrders）から都度集計するため、ここで supplier.payable へ加算しない
    // （加算すると KPI が PO 由来の明細と二重計上になる）。
    triggerToast(`発注 ${newId} を作成しました (${cleanItems.length}品目 / ${FMT(total)})`, "ok");
    setIsPOModalOpen(false);
    setTab("purchase");
  };

  // State for add/edit supplier form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierCat, setNewSupplierCat] = useState("保安用品");
  const [newSupplierTel, setNewSupplierTel] = useState("");
  const [newSupplierPayable, setNewSupplierPayable] = useState(0);
  const [newSupplierWarranty, setNewSupplierWarranty] = useState("1年");

  const resetSupplierForm = () => {
    setNewSupplierName(""); setNewSupplierCat("保安用品"); setNewSupplierTel("");
    setNewSupplierPayable(0); setNewSupplierWarranty("1年");
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) {
      triggerToast("仕入先名を入力してください", "warn");
      return;
    }
    const item = {
      name: newSupplierName.trim(),
      cat: newSupplierCat,
      tel: newSupplierTel || "—",
      payable: Number(newSupplierPayable) || 0,
      warranty: newSupplierWarranty,
      status: "取引中",
    };
    if (editingId) {
      OrderBus.patch("suppliers", editingId, item);
      setSel((prev: any) => prev && prev.id === editingId ? { ...prev, ...item } : prev);
      triggerToast(`仕入先 ${item.name} を更新しました`, "ok");
    } else {
      OrderBus.push("suppliers", { id: "SP-" + Date.now().toString().slice(-5), ...item });
      triggerToast(`仕入先 ${item.name} を追加しました`, "ok");
    }
    setIsAddModalOpen(false);
    setEditingId(null);
    resetSupplierForm();
  };

  const openAddSupplier = () => { setEditingId(null); resetSupplierForm(); setIsAddModalOpen(true); };
  const openEditSupplier = (s: any) => {
    setEditingId(s.id);
    setNewSupplierName(s.name || "");
    setNewSupplierCat(s.cat || "保安用品");
    setNewSupplierTel(s.tel && s.tel !== "—" ? s.tel : "");
    setNewSupplierPayable(Number(s.payable) || 0);
    setNewSupplierWarranty(s.warranty || "1年");
    setIsAddModalOpen(true);
  };
  const handleDeleteSupplier = async (s: any) => {
    if (await confirmDialog(`仕入先「${s.name}」を削除しますか？`, { danger: true, okText: "削除" })) {
      OrderBus.remove("suppliers", s.id);
      triggerToast(`${s.name} を削除しました`, "ok");
      setSel(null);
    }
  };

  if (sel) {
    const tabs = [
      { id: "info", label: "仕入先情報" },
      { id: "purchase", label: "発注履歴" },
      { id: "payable", label: "買掛金" },
      { id: "assets", label: "購入資産一覧" },
      { id: "warranty", label: "資産保証履歴" },
    ];

    // この仕入先に紐づく発注（OrderBus の購入実データ）。
    const supplierPOs = (purchaseOrders as any[]).filter(
      (po) => po.supplierId === sel.id || po.supplierName === sel.name
    );

    // 買掛金: 発注ごとに 1 行の支払予定として表示（発注がまだ無ければ空）。
    const payableRows = supplierPOs.map((po: any) => ({
      // PO id の全数字から導出（list key 用）。PO id が一意なら AP も一意。
      id: "AP-" + String(po.id).replace(/\D/g, ""),
      po: po.id,
      amt: po.total || 0,
      s: po.status === "受領済" ? "完了" : "請求済",
    }));

    // 購入資産・資産保証も発注実データ（purchaseOrders.items）から生成する（モック廃止）。
    const assetRows = supplierPOs.flatMap((po: any) =>
      (po.items || []).map((it: any) => ({
        name: it.name,
        qty: it.qty,
        po: po.id,
        date: po.date ? String(po.date).slice(0, 10) : "—",
        warranty: sel.warranty || "1年",
      }))
    );
    const assetTotalQty = assetRows.reduce((s: number, a: any) => s + Number(a.qty || 0), 0);

    return (
      <div className="space-y-4">
        <DetailHead
          icon="storefront"
          title={sel.name}
          sub={`${sel.cat} ・ ${sel.id}`}
          badge={<Badge>{sel.status}</Badge>}
          onBack={() => setSel(null)}
          actions={
            <>
              <Btn icon="edit" variant="secondary" onClick={() => openEditSupplier(sel)}>編集</Btn>
              <Btn icon="delete" variant="secondary" onClick={() => handleDeleteSupplier(sel)}>削除</Btn>
              <Btn icon="shopping_cart" variant="primary" onClick={openPOModal}>発注</Btn>
            </>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
          <KPI
            label="買掛金残高"
            value={FMT(payableOf(sel))}
            icon="payments"
            accent={payableOf(sel) > 0 ? "var(--color-secondary)" : "var(--color-primary)"}
          />
          <KPI
            label="購入資産"
            value={assetTotalQty.toLocaleString("ja-JP") + " 点"}
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

        {tab === "purchase" && (
          <Panel
            title="発注履歴"
            icon="shopping_cart"
            sub={`${supplierPOs.length} 件`}
            action={<Btn icon="add" size="sm" variant="primary" onClick={openPOModal}>発注を作成</Btn>}
          >
            <Table
              cols={[
                { h: "発注番号", cell: (r) => <span className="font-mono text-blue-700 font-bold">{r.id}</span> },
                { h: "発注日", cell: (r) => <span className="font-mono text-slate-500">{r.date || "—"}</span> },
                {
                  h: "品目",
                  wrap: true,
                  cell: (r) => (
                    <span className="font-bold text-slate-800">
                      {(r.items || []).map((it: any) => `${it.name}×${it.qty}`).join("、") || "—"}
                    </span>
                  ),
                },
                { h: "納期", cell: (r) => <span className="font-mono text-slate-500">{r.expectedDelivery || "—"}</span> },
                { h: "金額", align: "right", cell: (r) => <span className="font-mono font-bold">{FMT(r.total || 0)}</span> },
                { h: "状態", align: "right", cell: (r) => <Badge>{r.status}</Badge> },
              ]}
              rows={supplierPOs}
            />
          </Panel>
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
              rows={assetRows}
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
                { h: "状態", align: "right", cell: () => <Badge tone="ok">保証中</Badge> },
              ]}
              rows={assetRows}
            />
          </Panel>
        )}

        {/* Purchase Order (発注) Modal */}
        <Modal
          open={isPOModalOpen}
          onClose={() => setIsPOModalOpen(false)}
          title={`発注書を作成 — ${sel.name}`}
          width={560}
          footer={
            <>
              <Btn variant="secondary" onClick={() => setIsPOModalOpen(false)}>キャンセル</Btn>
              <Btn variant="primary" icon="check" onClick={handleCreatePO}>発注する</Btn>
            </>
          }
        >
          <form onSubmit={handleCreatePO} className="space-y-3">
            <Field label="発注品目" required>
              <div className="space-y-2">
                {poItems.map((it, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <input
                        list="po-item-names"
                        value={it.name}
                        onChange={(e) => updatePoItem(idx, { name: e.target.value })}
                        placeholder="品名"
                        className="w-full h-[38px] px-3 border border-[#b5dad6] rounded-lg bg-[#fff8e7] text-[#173b38] text-sm outline-none focus:border-[#2ba8a2]"
                      />
                    </div>
                    <TextInput
                      type="number"
                      min="1"
                      value={it.qty}
                      onChange={(e) => updatePoItem(idx, { qty: Number(e.target.value) })}
                      className="!w-[72px]"
                      placeholder="数量"
                    />
                    <TextInput
                      type="number"
                      min="0"
                      value={it.unitPrice}
                      onChange={(e) => updatePoItem(idx, { unitPrice: Number(e.target.value) })}
                      className="!w-[110px]"
                      placeholder="単価"
                    />
                    <button
                      type="button"
                      onClick={() => removePoItem(idx)}
                      disabled={poItems.length <= 1}
                      className="w-[38px] h-[38px] flex-shrink-0 rounded-lg border border-[#b5dad6] bg-white text-[#d45233] flex items-center justify-center disabled:opacity-40 hover:bg-[#fff8e7]"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ))}
                <datalist id="po-item-names">
                  {itemNameOptions.filter(Boolean).map((n) => <option key={n} value={n} />)}
                </datalist>
                <Btn size="sm" icon="add" variant="ghost" onClick={addPoItem}>品目を追加</Btn>
              </div>
            </Field>
            <Row>
              <Field label="希望納期">
                <TextInput type="date" value={poExpectedDelivery} onChange={(e) => setPoExpectedDelivery(e.target.value)} />
              </Field>
              <Field label="発注金額（自動計算）">
                <TextInput value={FMT(poTotal)} disabled readOnly />
              </Field>
            </Row>
            <Field label="備考">
              <TextArea rows={2} value={poNote} onChange={(e) => setPoNote(e.target.value)} placeholder="納品先・支払条件など" />
            </Field>
          </form>
        </Modal>
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
        <span className={`font-mono font-bold ${payableOf(r) > 0 ? "text-amber-600" : "text-slate-800"}`}>
          {FMT(payableOf(r))}
        </span>
      ),
    },
    { h: "購入資産", align: "right" as const, cell: (r: any) => <span className="font-mono">{assetQtyOf(r).toLocaleString("ja-JP")}</span> },
    { h: "保証", cell: (r: any) => <Badge>{r.warranty || "1年"}</Badge> },
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
          <Btn icon="add" variant="primary" onClick={openAddSupplier}>
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
        onClose={() => { setIsAddModalOpen(false); setEditingId(null); }}
        title={editingId ? "仕入先を編集" : "新規仕入先を追加"}
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
          <div className="text-[11px] text-slate-400">※ 買掛金残高・購入資産は発注履歴（発注金額）から自動集計されます。</div>
        </form>
      </Modal>
    </div>
  );
}
