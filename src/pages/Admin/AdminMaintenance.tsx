import React, { useState, useMemo } from "react";
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
  triggerToast,
} from "../../components/AdminUI";
import OrderBus from "../../lib/orderBus";

// 周期文字列 → 月数の換算（次回予定日の自動計算に使用）
const CYCLE_OPTIONS = ["2週間", "1ヶ月", "3ヶ月", "6ヶ月", "1年"] as const;
function addCycle(from: Date, cycle: string): Date {
  const d = new Date(from);
  switch (cycle) {
    case "2週間":
      d.setDate(d.getDate() + 14);
      break;
    case "1ヶ月":
      d.setMonth(d.getMonth() + 1);
      break;
    case "3ヶ月":
      d.setMonth(d.getMonth() + 3);
      break;
    case "6ヶ月":
      d.setMonth(d.getMonth() + 6);
      break;
    case "1年":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

function fmtDate(date: Date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}
function daysBetween(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}
function parseSlashDate(s: string | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split(/[/\-]/).map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function AdminMaintenance() {
  const { rows: maintRows } = useAdminCollection("maintenance");

  // 新規登録モーダル
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("電動機器");
  const [newCycle, setNewCycle] = useState<typeof CYCLE_OPTIONS[number]>("3ヶ月");
  const [newLast, setNewLast] = useState("");
  const [newNext, setNewNext] = useState("");

  // 点検実施モーダル
  const [inspecting, setInspecting] = useState<any | null>(null);
  const [inspDate, setInspDate] = useState("");
  const [inspResult, setInspResult] = useState<"合格" | "要修理">("合格");
  const [inspBy, setInspBy] = useState("");
  const [inspNote, setInspNote] = useState("");

  // ── 残り日数を毎レンダリングで再計算（リアルタイムで超過を反映） ──
  const rowsWithDays = useMemo(() => {
    const today = new Date();
    return (maintRows || []).map((r: any) => {
      const next = parseSlashDate(r.next);
      const days = next ? daysBetween(today, next) : (r.days ?? 0);
      const status = r.status === "正常" ? "正常" : days < 0 ? "超過" : days <= 7 ? "期限間近" : "予定";
      return { ...r, days, status };
    });
  }, [maintRows]);

  const overdue = rowsWithDays.filter((r) => r.days < 0);
  const dueSoon = rowsWithDays.filter((r) => r.days >= 0 && r.days <= 7);

  // ── 新規登録 ──
  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      triggerToast("対象機器名を入力してください", "warn");
      return;
    }
    if (!newNext) {
      triggerToast("次回予定日を入力してください", "warn");
      return;
    }
    const today = new Date();
    const nextD = new Date(newNext);
    const id = "MN-" + Math.floor(550 + Math.random() * 4000);
    OrderBus.push("maintenance", {
      id,
      name: newName,
      cat: newCat,
      cycle: newCycle,
      last: newLast ? newLast.replace(/-/g, "/") : "—",
      next: fmtDate(nextD),
      days: daysBetween(today, nextD),
      status: "予定",
    });
    triggerToast(`${newName} を登録しました`, "ok");
    setIsAddOpen(false);
    setNewName("");
    setNewLast("");
    setNewNext("");
  };

  // ── 点検実施 ──
  const openInspect = (r: any) => {
    setInspecting(r);
    setInspDate(fmtDate(new Date()).replace(/\//g, "-"));
    setInspResult("合格");
    setInspBy("");
    setInspNote("");
  };
  const submitInspect = () => {
    if (!inspecting) return;
    const doneDate = inspDate ? new Date(inspDate) : new Date();
    const nextDate = addCycle(doneDate, inspecting.cycle || "3ヶ月");
    const days = daysBetween(new Date(), nextDate);

    // 点検履歴を1件追加してマスタを更新
    const history = Array.isArray(inspecting.history) ? inspecting.history : [];
    history.unshift({
      id: "INS-" + Date.now(),
      date: fmtDate(doneDate),
      result: inspResult,
      inspector: inspBy || "—",
      note: inspNote,
    });
    OrderBus.patch("maintenance", inspecting.id, {
      last: fmtDate(doneDate),
      next: fmtDate(nextDate),
      days,
      status: inspResult === "要修理" ? "要修理" : "正常",
      history,
    });

    // 「要修理」なら自動的に修理依頼を作成して保全業務を一本化
    if (inspResult === "要修理") {
      const repairId = "RP-" + String(Date.now()).slice(-5);
      OrderBus.push("repairs", {
        id: repairId,
        asset: inspecting.name,
        vendor: "",
        status: "修理待ち",
        req: fmtDate(doneDate),
        cost: null,
        warranty: false,
        issue: `定期点検で要修理判定: ${inspNote || inspecting.name}`,
        sourceInspectionId: inspecting.id,
      });
      triggerToast(`点検記録を保存し、修理依頼 ${repairId} を自動作成しました`, "ok");
    } else {
      triggerToast(`${inspecting.name} の点検（合格）を記録しました`, "ok");
    }
    setInspecting(null);
  };

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
        <span className={`font-mono font-bold ${r.days < 0 ? "text-red-600" : r.days <= 7 ? "text-amber-600" : "text-slate-700"}`}>
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
    {
      h: "状態",
      cell: (r: any) => (
        <Badge tone={r.status === "超過" ? "danger" : r.status === "正常" ? "ok" : r.status === "期限間近" ? "warning" : "default"}>
          {r.status}
        </Badge>
      ),
    },
    {
      h: "操作",
      align: "right" as const,
      cell: (r: any) => (
        <div className="inline-flex gap-1.5">
          <button
            onClick={() => openInspect(r)}
            title="点検実施"
            className="p-1.5 rounded hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 cursor-pointer flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">fact_check</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-4">
        <KPI label="登録機器" value={maintRows.length + " 件"} icon="build" />
        <KPI
          label="超過"
          value={overdue.length + " 件"}
          icon="warning"
          accent="var(--color-danger)"
        />
        <KPI
          label="期限間近（7日以内）"
          value={dueSoon.length + " 件"}
          icon="schedule"
          accent="var(--color-secondary)"
        />
        <KPI
          label="正常運用"
          value={rowsWithDays.filter((r) => r.status === "正常").length + " 件"}
          icon="check_circle"
          accent="var(--color-success)"
        />
      </div>

      {/* 超過アラート（最優先で目に入る） */}
      {overdue.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-red-600 text-[22px]">priority_high</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700">
              点検期限を超過している機器が {overdue.length} 件あります。早急に点検を実施してください。
            </p>
            <p className="text-[11px] text-red-500 mt-0.5 font-medium">
              {overdue
                .slice(0, 3)
                .map((r) => `${r.name}（${-r.days}日超過）`)
                .join(" / ")}
              {overdue.length > 3 ? ` 他 ${overdue.length - 3} 件` : ""}
            </p>
          </div>
        </div>
      )}

      <Panel
        title="定期点検"
        icon="engineering"
        sub="点検実施を記録すると次回予定日が自動で更新されます。要修理判定で修理依頼を自動作成。"
        action={
          <Btn size="sm" variant="primary" icon="add" onClick={() => setIsAddOpen(true)}>
            機器を登録
          </Btn>
        }
      >
        <Table cols={cols} rows={rowsWithDays} />
      </Panel>

      {/* ── 新規登録モーダル ────────────────────────────────── */}
      <Modal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="点検対象機器を登録"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveNew}>登録</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveNew} className="space-y-3">
          <Field label="対象機器名" required>
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例：発電機 ヤマハ EF2500i" />
          </Field>
          <Row>
            <Field label="カテゴリ" required>
              <SelectInput
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                options={["電動機器", "照明", "車両系", "保安用品", "ガス検知器", "その他"]}
              />
            </Field>
            <Field label="点検周期" required>
              <SelectInput
                value={newCycle}
                onChange={(e) => setNewCycle(e.target.value as any)}
                options={[...CYCLE_OPTIONS]}
              />
            </Field>
          </Row>
          <Row>
            <Field label="前回点検日">
              <TextInput type="date" value={newLast} onChange={(e) => setNewLast(e.target.value)} />
            </Field>
            <Field label="次回予定日" required>
              <TextInput type="date" value={newNext} onChange={(e) => setNewNext(e.target.value)} />
            </Field>
          </Row>
        </form>
      </Modal>

      {/* ── 点検実施モーダル ────────────────────────────────── */}
      <Modal
        open={!!inspecting}
        onClose={() => setInspecting(null)}
        title="点検実施の記録"
        width={520}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setInspecting(null)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={submitInspect}>記録する</Btn>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            対象 <span className="font-bold text-slate-800">{inspecting?.name}</span>
            ・ 周期 <span className="font-mono">{inspecting?.cycle}</span>
          </div>
          <Row>
            <Field label="点検実施日" required>
              <TextInput type="date" value={inspDate} onChange={(e) => setInspDate(e.target.value)} />
            </Field>
            <Field label="点検結果" required>
              <SelectInput
                value={inspResult}
                onChange={(e) => setInspResult(e.target.value as any)}
                options={["合格", "要修理"]}
              />
            </Field>
          </Row>
          <Field label="点検担当">
            <TextInput value={inspBy} onChange={(e) => setInspBy(e.target.value)} placeholder="例：鈴木 健" />
          </Field>
          <Field label="点検メモ">
            <TextInput
              value={inspNote}
              onChange={(e) => setInspNote(e.target.value)}
              placeholder={inspResult === "要修理" ? "不具合の内容・症状" : "点検時の所見など（任意）"}
            />
          </Field>
          {inspResult === "要修理" && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
              「要修理」を選択すると、修理依頼として自動的に <span className="font-bold">修理待ち</span> ステータスで登録され、保全タブで業者割当・見積登録に進めます。
            </div>
          )}
          {inspecting?.cycle && inspDate && (
            <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              次回予定日（自動計算）：
              <span className="font-mono font-bold text-slate-700 ml-1">
                {fmtDate(addCycle(new Date(inspDate), inspecting.cycle))}
              </span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
