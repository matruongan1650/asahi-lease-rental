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
import { FMT, VENDOR_HISTORY } from "../../data/adminMockData";
import { KV, DetailHead } from "./AdminSuppliers";
import OrderBus from "../../lib/orderBus";

export default function AdminVendors() {
  const [sel, setSel] = useState<any | null>(null);
  const [tab, setTab] = useState("info");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { rows: vendors, live } = useAdminCollection("vendors");

  // State for add vendor form
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorCat, setNewVendorCat] = useState("金属・溶接");
  const [newVendorTel, setNewVendorTel] = useState("");
  const [newVendorContact, setNewVendorContact] = useState("");
  const [newVendorAddr, setNewVendorAddr] = useState("");
  const [newVendorJobs, setNewVendorJobs] = useState(0);
  const [newVendorActive, setNewVendorActive] = useState(0);

  const handleSaveVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName.trim()) {
      triggerToast("業者名を入力してください", "warn");
      return;
    }
    const newId = "V-" + Math.floor(304 + Math.random() * 900);
    const item = {
      id: newId,
      name: newVendorName,
      cat: newVendorCat,
      tel: newVendorTel || "03-0000-0000",
      contact: newVendorContact || "—",
      addr: newVendorAddr || "—",
      jobs: Number(newVendorJobs) || 0,
      active: Number(newVendorActive) || 0
    };

    OrderBus.push("vendors", item);
    triggerToast(`修理業者 ${newVendorName} を追加しました`, "ok");
    setIsAddModalOpen(false);

    // Reset fields
    setNewVendorName("");
    setNewVendorTel("");
    setNewVendorContact("");
    setNewVendorAddr("");
    setNewVendorJobs(0);
    setNewVendorActive(0);
  };

  if (sel) {
    const tabs = [
      { id: "info", label: "修理業者情報" },
      { id: "staff", label: "修理担当者" },
      { id: "addr", label: "修理先住所" },
      { id: "history", label: "修理履歴" },
      { id: "warranty", label: "修理・保証情報" },
    ];

    const staffRows = [
      { n: sel.contact || "—", s: "金属溶接", t: sel.tel || "—" },
      { n: "高田 学", s: "電装", t: "03-0000-9999" },
    ];

    const addrRows = [
      { n: "本社工場", a: sel.addr || "—" },
      { n: "第二整備センター", a: "東京都江東区新木場2-3" },
    ];

    return (
      <div className="space-y-4">
        <DetailHead
          icon="handyman"
          title={sel.name}
          sub={`${sel.cat} ・ ${sel.id}`}
          onBack={() => setSel(null)}
          actions={
            <Btn icon="build" variant="primary" onClick={() => triggerToast(`修理依頼書を作成しました (業者: ${sel.name})`, "ok")}>
              修理を依頼
            </Btn>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
          <KPI
            label="進行中の依頼"
            value={(sel.active || 0) + " 件"}
            icon="build"
          />
          <KPI
            label="累計対応"
            value={(sel.jobs || 0) + " 件"}
            icon="task_alt"
            accent="var(--color-neutral-600)"
          />
          <KPI
            label="保証対応"
            value="2 件"
            icon="shield"
            accent="var(--color-teal)"
          />
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
                { h: "費用", align: "right", cell: (r) => <span className="font-mono font-bold">{FMT(r.cost)}</span> },
                { h: "日付", cell: (r) => <span className="font-mono text-slate-500">{r.date}</span> },
                { h: "状態", align: "right", cell: (r) => <Badge>{r.status}</Badge> },
              ]}
              rows={VENDOR_HISTORY}
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
              rows={VENDOR_HISTORY}
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
    { h: "進行中", align: "right" as const, cell: (r: any) => <span className="font-mono font-bold">{r.active}</span> },
    { h: "累計", align: "right" as const, cell: (r: any) => <span className="font-mono">{r.jobs}</span> },
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
        onClose={() => setIsAddModalOpen(false)}
        title="新規修理業者を追加"
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
          <Row>
            <Field label="進行中の依頼数">
              <TextInput type="number" min="0" value={newVendorActive} onChange={e => setNewVendorActive(Number(e.target.value))} />
            </Field>
            <Field label="累計対応数">
              <TextInput type="number" min="0" value={newVendorJobs} onChange={e => setNewVendorJobs(Number(e.target.value))} />
            </Field>
          </Row>
        </form>
      </Modal>
    </div>
  );
}
