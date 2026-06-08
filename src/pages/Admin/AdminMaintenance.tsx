import React, { useState } from "react";
import { useAdminCollection } from "../../context/AdminDataContext";
import {
  Badge,
  Btn,
  Panel,
  KPI,
  Table,
  Modal,
  Field,
  TextInput,
  SelectInput,
  Row,
  triggerToast
} from "../../components/AdminUI";
import OrderBus from "../../lib/orderBus";

export default function AdminMaintenance() {
  const { rows: maintRows, live } = useAdminCollection("maintenance");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Add maintenance form states
  const [newMaintName, setNewMaintName] = useState("");
  const [newMaintCat, setNewMaintCat] = useState("電動機器");
  const [newMaintCycle, setNewMaintCycle] = useState("3ヶ月");
  const [newMaintLast, setNewMaintLast] = useState("");
  const [newMaintNext, setNewMaintNext] = useState("");

  const handleSaveMaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaintName.trim()) {
      triggerToast("対象機器名を入力してください", "warn");
      return;
    }
    if (!newMaintNext) {
      triggerToast("次回予定日を入力してください", "warn");
      return;
    }

    const nextDate = new Date(newMaintNext);
    const today = new Date("2026-06-02"); // mock reference today
    const diffTime = nextDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const newId = "MN-" + Math.floor(550 + Math.random() * 400);
    const item = {
      id: newId,
      name: newMaintName,
      cat: newMaintCat,
      cycle: newMaintCycle,
      last: newMaintLast || today.toISOString().split("T")[0].replace(/-/g, "/"),
      next: newMaintNext.replace(/-/g, "/"),
      days: diffDays,
      status: diffDays < 0 ? "超過" : "予定"
    };

    OrderBus.push("maintenance", item);
    triggerToast(`${newMaintName} の点検を予約しました`, "ok");
    setIsAddModalOpen(false);

    // Reset fields
    setNewMaintName("");
    setNewMaintLast("");
    setNewMaintNext("");
  };

  const schedCount = maintRows.filter((m) => m.status === "予定").length;
  const overdueCount = maintRows.filter((m) => m.days < 0).length;

  const cols = [
    {
      h: "管理番号",
      cell: (r: any) => <span className="font-mono font-bold text-blue-700">{r.id}</span>,
    },
    {
      h: "対象",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.name}</div>
          <div className="text-[11px] text-slate-400 font-medium">
            {r.cat} ・ {r.cycle}周期
          </div>
        </div>
      ),
    },
    {
      h: "前回点検",
      cell: (r: any) => <span className="font-mono text-slate-500">{r.last}</span>,
    },
    {
      h: "次回予定",
      cell: (r: any) => (
        <span className={`font-mono font-bold ${r.days < 0 ? "text-red-600" : "text-slate-700"}`}>
          {r.next}
        </span>
      ),
    },
    {
      h: "残り",
      align: "right" as const,
      cell: (r: any) => (
        <span
          className={`font-mono font-bold ${
            r.days < 0 ? "text-red-600" : r.days <= 7 ? "text-amber-600" : "text-slate-700"
          }`}
        >
          {r.days < 0 ? `${-r.days}日超過` : `${r.days}日`}
        </span>
      ),
    },
    { h: "状態", cell: (r: any) => <Badge>{r.status}</Badge> },
    {
      h: "操作",
      align: "right" as const,
      cell: (r: any) => (
        <div className="inline-flex gap-1.5">
          <button
            onClick={() => triggerToast(`${r.name} の点検を予約しました`, "ok")}
            title="スケジュール"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 cursor-pointer flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
          </button>
          <button
            onClick={() => {
              // mark complete inspection (sets next to + cycle, last to today)
              const todayStr = "2026/06/02";
              OrderBus.patch("maintenance", r.id, {
                last: todayStr,
                next: "2026/09/02", // 3 months later
                days: 92,
                status: "正常"
              });
              triggerToast(`${r.name} の点検を記録しました`, "ok");
            }}
            title="点検記録"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-emerald-600 cursor-pointer flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">check_box</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
        <KPI
          label="点検予定（今月）"
          value={schedCount + " 件"}
          icon="calendar_today"
        />
        <KPI
          label="超過"
          value={overdueCount + " 件"}
          icon="warning"
          accent="var(--color-danger)"
        />
        <KPI
          label="対象機器"
          value={maintRows.length + " 件"}
          icon="build"
          accent="var(--color-neutral-600)"
        />
      </div>

      <Panel
        title="定期メンテナンス"
        icon="engineering"
        sub="定期メンテナンスをスケジュールする"
        action={
          <Btn size="sm" variant="primary" icon="add" onClick={() => setIsAddModalOpen(true)}>
            点検を予約
          </Btn>
        }
      >
        <Table cols={cols} rows={maintRows} />
      </Panel>

      {/* Add Maintenance Reservation Modal */}
      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="新規点検予約をスケジュール"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveMaint}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveMaint} className="space-y-3">
          <Field label="対象機器名" required>
            <TextInput value={newMaintName} onChange={e => setNewMaintName(e.target.value)} placeholder="例：発電機 ヤマハ EF2500i" />
          </Field>
          <Row>
            <Field label="カテゴリ" required>
              <SelectInput value={newMaintCat} onChange={e => setNewMaintCat(e.target.value)} options={["電動機器", "照明", "車両系", "保安用品", "その他"]} />
            </Field>
            <Field label="点検周期" required>
              <SelectInput value={newMaintCycle} onChange={e => setNewMaintCycle(e.target.value)} options={["2週間", "1ヶ月", "3ヶ月", "6ヶ月", "1年"]} />
            </Field>
          </Row>
          <Row>
            <Field label="前回点検日">
              <TextInput type="date" value={newMaintLast} onChange={e => setNewMaintLast(e.target.value)} />
            </Field>
            <Field label="次回予定日" required>
              <TextInput type="date" value={newMaintNext} onChange={e => setNewMaintNext(e.target.value)} />
            </Field>
          </Row>
        </form>
      </Modal>
    </div>
  );
}
