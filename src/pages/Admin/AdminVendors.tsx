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
import { FMT } from "../../data/adminMockData";
import { KV, DetailHead } from "./AdminSuppliers";
import { confirmDialog } from "../../components/AppDialog";
import OrderBus from "../../lib/orderBus";

export default function AdminVendors() {
  const [sel, setSel] = useState<any | null>(null);
  const [tab, setTab] = useState("info");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { rows: vendors, live } = useAdminCollection("vendors");
  // 修理履歴・件数は repairs ストアから業者名で実データを集計する（モックを廃止）。
  const { rows: repairs } = useAdminCollection("repairs");
  const [editingId, setEditingId] = useState<string | null>(null);

  // State for add/edit vendor form
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorCat, setNewVendorCat] = useState("金属・溶接");
  const [newVendorTel, setNewVendorTel] = useState("");
  const [newVendorContact, setNewVendorContact] = useState("");
  const [newVendorAddr, setNewVendorAddr] = useState("");

  const resetForm = () => {
    setNewVendorName(""); setNewVendorCat("金属・溶接"); setNewVendorTel("");
    setNewVendorContact(""); setNewVendorAddr("");
  };

  const handleSaveVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName.trim()) {
      triggerToast("業者名を入力してください", "warn");
      return;
    }
    const item = {
      name: newVendorName.trim(),
      cat: newVendorCat,
      tel: newVendorTel || "—",
      contact: newVendorContact || "—",
      addr: newVendorAddr || "—",
    };
    if (editingId) {
      OrderBus.patch("vendors", editingId, item);
      setSel((prev: any) => prev && prev.id === editingId ? { ...prev, ...item } : prev);
      triggerToast(`修理業者 ${item.name} を更新しました`, "ok");
    } else {
      OrderBus.push("vendors", { id: "V-" + Date.now().toString().slice(-5), ...item });
      triggerToast(`修理業者 ${item.name} を追加しました`, "ok");
    }
    setIsAddModalOpen(false);
    setEditingId(null);
    resetForm();
  };

  const openAdd = () => { setEditingId(null); resetForm(); setIsAddModalOpen(true); };
  const openEdit = (v: any) => {
    setEditingId(v.id);
    setNewVendorName(v.name || "");
    setNewVendorCat(v.cat || "金属・溶接");
    setNewVendorTel(v.tel && v.tel !== "—" ? v.tel : "");
    setNewVendorContact(v.contact && v.contact !== "—" ? v.contact : "");
    setNewVendorAddr(v.addr && v.addr !== "—" ? v.addr : "");
    setIsAddModalOpen(true);
  };
  const handleDeleteVendor = async (v: any) => {
    if (await confirmDialog(`修理業者「${v.name}」を削除しますか？`, { danger: true, okText: "削除" })) {
      OrderBus.remove("vendors", v.id);
      triggerToast(`${v.name} を削除しました`, "ok");
      setSel(null);
    }
  };

  if (sel) {
    const tabs = [
      { id: "info", label: "修理業者情報" },
      { id: "staff", label: "修理担当者" },
      { id: "addr", label: "修理先住所" },
      { id: "history", label: "修理履歴" },
      { id: "warranty", label: "修理・保証情報" },
    ];

    // この業者に紐づく修理を実データ（repairs）から集計する。
    const vendorRepairs = (repairs || []).filter((r: any) => r && (r.vendor === sel.name || r.vendorId === sel.id));
    const activeCount = vendorRepairs.filter((r: any) => r.status !== "完了").length;
    const warrantyCount = vendorRepairs.filter((r: any) => r.warranty).length;

    const staffRows = [{ n: sel.contact || "—", s: sel.cat || "—", t: sel.tel || "—" }];
    const addrRows = [{ n: "拠点", a: sel.addr || "—" }];

    return (
      <div className="space-y-4">
        <DetailHead
          icon="handyman"
          title={sel.name}
          sub={`${sel.cat} ・ ${sel.id}`}
          onBack={() => setSel(null)}
          actions={
            <div className="flex gap-2">
            <Btn icon="edit" variant="secondary" onClick={() => openEdit(sel)}>編集</Btn>
            <Btn icon="delete" variant="secondary" onClick={() => handleDeleteVendor(sel)}>削除</Btn>
            <Btn icon="build" variant="primary" onClick={() => {
              // 以前はトーストのみ（何も保存しない）。実際に修理依頼レコードを作成して
              // 修理依頼タブ・サーバーへ反映する。詳細(対象資産等)は修理依頼タブで編集。
              const id = "RP-" + Date.now().toString().slice(-6);
              OrderBus.push("repairs", {
                id,
                asset: "（対象資産を入力）",
                vendor: sel.name,
                vendorId: sel.id,
                status: "修理待ち",
                req: new Date().toLocaleDateString("sv-SE"), // JST ローカル日付(YYYY-MM-DD)。toISOString は UTC で夜間に前日へズレる。
                cost: null,
                warranty: false,
                issue: "修理業者画面からの依頼",
              });
              triggerToast(`修理依頼 ${id} を作成しました（修理依頼タブで詳細を編集）`, "ok");
            }}>
              修理を依頼
            </Btn>
            </div>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
          <KPI label="進行中の依頼" value={activeCount + " 件"} icon="build" />
          <KPI label="累計対応" value={vendorRepairs.length + " 件"} icon="task_alt" accent="var(--color-neutral-600)" />
          <KPI label="保証対応" value={warrantyCount + " 件"} icon="shield" accent="var(--color-teal)" />
        </div>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "info" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel title="修理業者情報" icon="business">
              <KV label="業者名" value={sel.name} />
              <KV label="区分" value={sel.cat} />
              <KV label="コード" value={sel.id} mono />
            </Panel>
            <Panel title="連絡先" icon="phone">
              <KV label="担当者" value={sel.contact || "—"} />
              <KV label="電話番号" value={sel.tel || "—"} mono />
            </Panel>
          </div>
        )}

        {tab === "staff" && (
          <Panel title="修理担当者" icon="group">
            <Table
              cols={[
                { h: "氏名", cell: (r) => <span className="font-bold">{r.n}</span> },
                { h: "専門", cell: (r) => <span>{r.s}</span> },
                { h: "電話", align: "right", cell: (r) => <span className="font-mono text-slate-500">{r.t}</span> },
              ]}
              rows={staffRows}
            />
          </Panel>
        )}

        {tab === "addr" && (
          <Panel title="修理先住所一覧" icon="location_on">
            <Table
              cols={[
                { h: "拠点", cell: (r) => <span className="font-bold">{r.n}</span> },
                { h: "住所", wrap: true, cell: (r) => <span className="text-slate-500">{r.a}</span> },
              ]}
              rows={addrRows}
            />
          </Panel>
        )}

        {tab === "history" && (
          <Panel title="修理履歴" icon="history">
            <Table
              cols={[
                { h: "依頼番号", cell: (r) => <span className="font-mono text-blue-700 font-bold">{r.id}</span> },
                { h: "対象", wrap: true, cell: (r) => <span>{r.asset}</span> },
                { h: "費用", align: "right", cell: (r) => <span className="font-mono font-bold">{r.cost ? FMT(r.cost) : "見積中"}</span> },
                { h: "日付", cell: (r) => <span className="font-mono text-slate-500">{r.date}</span> },
                { h: "状態", align: "right", cell: (r) => <Badge>{r.status}</Badge> },
              ]}
              rows={vendorRepairs.map((r: any) => ({ id: r.id, asset: r.asset, cost: r.cost, date: r.req || r.date || "—", status: r.status }))}
            />
          </Panel>
        )}

        {tab === "warranty" && (
          <Panel title="修理・保証情報" icon="shield">
            <Table
              cols={[
                { h: "依頼番号", cell: (r) => <span className="font-mono text-blue-700 font-bold">{r.id}</span> },
                { h: "対象", wrap: true, cell: (r) => <span>{r.asset}</span> },
                { h: "保証", cell: (r) => r.warranty ? <Badge tone="ok">完了</Badge> : <span className="text-slate-400">対象外</span> },
                { h: "日付", align: "right", cell: (r) => <span className="font-mono text-slate-500">{r.date}</span> },
              ]}
              rows={vendorRepairs.map((r: any) => ({ id: r.id, asset: r.asset, warranty: r.warranty, date: r.req || r.date || "—" }))}
            />
          </Panel>
        )}
      </div>
    );
  }

  const cols = [
    { h: "コード", cell: (r: any) => <span className="font-mono font-bold text-blue-700">{r.id}</span> },
    {
      h: "業者名",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.name}</div>
          <div className="text-[10px] text-slate-400 font-medium">{r.cat}</div>
        </div>
      ),
    },
    { h: "担当者", cell: (r: any) => <span>{r.contact || "—"}</span> },
    { h: "進行中", align: "right" as const, cell: (r: any) => <span className="font-mono font-bold">{(repairs || []).filter((x: any) => x && (x.vendor === r.name || x.vendorId === r.id) && x.status !== "完了").length}</span> },
    { h: "累計", align: "right" as const, cell: (r: any) => <span className="font-mono">{(repairs || []).filter((x: any) => x && (x.vendor === r.name || x.vendorId === r.id)).length}</span> },
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
          <Btn icon="add" variant="primary" onClick={openAdd}>
            修理業者を追加
          </Btn>
        }
      />
      <Panel
        title="修理業者一覧"
        icon="handyman"
        sub={`${vendors.length} 社`}
        action={live ? <Badge tone="ok">🟢 live</Badge> : null}
      >
        <Table cols={cols} rows={vendors} onRow={setSel} />
      </Panel>

      {/* Add Vendor Modal */}
      <Modal
        open={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setEditingId(null); }}
        title={editingId ? "修理業者を編集" : "新規修理業者を追加"}
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveVendor}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveVendor} className="space-y-3">
          <Field label="修理業者名" required>
            <TextInput value={newVendorName} onChange={e => setNewVendorName(e.target.value)} placeholder="例：オートサービス品川" />
          </Field>
          <Row>
            <Field label="区分" required>
              <SelectInput value={newVendorCat} onChange={e => setNewVendorCat(e.target.value)} options={["金属・溶接", "発電機・エンジン", "車両系・油圧", "電装・照明", "その他"]} />
            </Field>
            <Field label="担当者氏名">
              <TextInput value={newVendorContact} onChange={e => setNewVendorContact(e.target.value)} placeholder="例：山口 修" />
            </Field>
          </Row>
          <Field label="電話番号">
            <TextInput type="tel" value={newVendorTel} onChange={e => setNewVendorTel(e.target.value)} placeholder="例：03-3450-1100" />
          </Field>
          <Field label="住所拠点">
            <TextInput value={newVendorAddr} onChange={e => setNewVendorAddr(e.target.value)} placeholder="例：東京都品川区東品川3-1" />
          </Field>
          <div className="text-[11px] text-slate-400">※ 進行中／累計件数は修理依頼から自動集計されます。</div>
        </form>
      </Modal>
    </div>
  );
}
