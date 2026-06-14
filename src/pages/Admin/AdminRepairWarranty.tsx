import React, { useState, useMemo } from "react";
import { useAdminCollection, useAdminData } from "../../context/AdminDataContext";
import {
  Badge,
  Btn,
  Panel,
  KPI,
  Tabs,
  Table,
  Modal,
  Field,
  TextInput,
  SelectInput,
  Row,
  triggerToast
} from "../../components/AdminUI";
import AdminDocDrawer from "../../components/AdminDocDrawer";
import { FMT } from "../../data/adminMockData";
import OrderBus from "../../lib/orderBus";

// 修理依頼の標準ステータス（業務フロー）:
//   修理待ち（受付済・業者未確定）→ 見積中（業者見積待ち）→ 修理中（作業中）→ 完了
const REPAIR_STATES = ["すべて", "修理待ち", "見積中", "修理中", "完了"];

/** YYYY/MM/DD で日付を整形 */
function fmtDate(d: Date) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function QuickAct({
  icon,
  label,
  onClick,
  color = "blue",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  color?: "blue" | "emerald" | "amber" | "red";
}) {
  const colorMap = {
    blue: "hover:text-blue-600",
    emerald: "hover:text-emerald-600",
    amber: "hover:text-amber-600",
    red: "hover:text-red-600",
  };
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded hover:bg-slate-100 text-slate-500 ${colorMap[color]} cursor-pointer flex items-center justify-center transition-colors`}
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );
}

export default function AdminRepairWarranty() {
  const [tab, setTab] = useState("すべて");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { rows: repairs } = useAdminCollection("repairs");
  const { rows: vendors } = useAdminCollection("vendors");

  // 完了処理用モーダル
  const [completing, setCompleting] = useState<any | null>(null);
  const [costInput, setCostInput] = useState("");
  const [doneDate, setDoneDate] = useState(fmtDate(new Date()).replace(/\//g, "-"));
  const [doneNote, setDoneNote] = useState("");

  // 見積登録モーダル
  const [estimating, setEstimating] = useState<any | null>(null);
  const [estVendor, setEstVendor] = useState("");
  const [estCost, setEstCost] = useState("");

  const filteredRepairs = useMemo(
    () => (tab === "すべて" ? repairs : repairs.filter((r: any) => r.status === tab)),
    [repairs, tab],
  );

  const counts: Record<string, number> = {
    "すべて": repairs.length,
    "修理待ち": repairs.filter((r: any) => r.status === "修理待ち").length,
    "見積中": repairs.filter((r: any) => r.status === "見積中").length,
    "修理中": repairs.filter((r: any) => r.status === "修理中").length,
    "完了": repairs.filter((r: any) => r.status === "完了").length,
  };

  // ── 完了処理 ────────────────────────────────────────────
  const openCompleteModal = (r: any) => {
    setCompleting(r);
    setCostInput(r.cost ? String(r.cost) : "");
    setDoneDate(fmtDate(new Date()).replace(/\//g, "-"));
    setDoneNote("");
  };
  const submitComplete = () => {
    if (!completing) return;
    const cost = Number(costInput);
    if (!Number.isFinite(cost) || cost < 0) {
      triggerToast("正しい修理費用を入力してください", "warn");
      return;
    }
    OrderBus.patch("repairs", completing.id, {
      status: "完了",
      cost,
      completedAt: doneDate.replace(/-/g, "/"),
      completionNote: doneNote,
    });
    // 修理が現場報告から作成されていれば、その報告も「対応済」にする
    if (completing.sourceReportId) {
      OrderBus.patch("fieldReports", completing.sourceReportId, { status: "対応済" });
    }
    // 定期点検からの「要修理」自動作成だった場合は、点検対象を「正常」に戻して履歴に追記
    if (completing.sourceInspectionId) {
      const m = OrderBus.getAll<any>("maintenance").find((x) => x.id === completing.sourceInspectionId);
      if (m) {
        const history = Array.isArray(m.history) ? [...m.history] : [];
        history.unshift({
          id: "INS-FIX-" + Date.now(),
          date: doneDate.replace(/-/g, "/"),
          result: "修理完了",
          inspector: "—",
          note: `修理依頼 ${completing.id} 完了（${FMT(cost)}）`,
        });
        OrderBus.patch("maintenance", completing.sourceInspectionId, { status: "正常", history });
      }
    }
    triggerToast(`${completing.id} を完了にしました（${FMT(cost)}）`, "ok");
    setCompleting(null);
  };

  // ── 見積登録 ────────────────────────────────────────────
  const openEstimateModal = (r: any) => {
    setEstimating(r);
    setEstVendor(r.vendor || "");
    setEstCost(r.cost ? String(r.cost) : "");
  };
  const submitEstimate = () => {
    if (!estimating) return;
    if (!estVendor) {
      triggerToast("修理業者を選択してください", "warn");
      return;
    }
    const cost = Number(estCost);
    if (!Number.isFinite(cost) || cost <= 0) {
      triggerToast("見積金額を入力してください", "warn");
      return;
    }
    OrderBus.patch("repairs", estimating.id, {
      vendor: estVendor,
      cost,
      status: "修理中",
      estimatedAt: fmtDate(new Date()),
    });
    triggerToast(`${estimating.id} を見積確定・修理中に更新しました`, "ok");
    setEstimating(null);
  };

  // ── 新規修理依頼 ──────────────────────────────────────────
  const handleCreateRepair = (doc: any) => {
    OrderBus.push("repairs", {
      id: doc.id,
      asset: doc.customer, // 修理フォームでは customer フィールドが対象資産名
      vendor: doc.site, // site フィールドが業者名
      status: "修理待ち",
      req: doc.date,
      cost: null,
      warranty: true,
      issue: doc.note || "管理者からの修理依頼",
    });
    triggerToast(`修理依頼 ${doc.id} を登録しました`, "ok");
  };

  const cols = [
    {
      h: "依頼番号",
      cell: (r: any) => (
        <div>
          <span className="font-mono font-bold text-blue-700">{r.id}</span>
          {r.sourceReportId && (
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              現場報告: {r.sourceReportId}
            </div>
          )}
          {r.sourceInspectionId && (
            <div className="text-[10px] text-emerald-600 font-mono mt-0.5">
              定期点検: {r.sourceInspectionId}
            </div>
          )}
        </div>
      ),
    },
    {
      h: "対象 / 内容",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.asset}</div>
          <div className="text-[11px] text-slate-400 font-medium">{r.issue}</div>
        </div>
      ),
    },
    { h: "修理業者", wrap: true, cell: (r: any) => <span>{r.vendor || "—"}</span> },
    {
      h: "保証",
      cell: (r: any) =>
        r.warranty ? <Badge tone="ok">対象</Badge> : <span className="text-slate-400">対象外</span>,
    },
    {
      h: "費用",
      align: "right" as const,
      cell: (r: any) => (
        <span className="font-mono font-bold">{r.cost ? FMT(r.cost) : "見積中"}</span>
      ),
    },
    {
      h: "依頼日",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono text-[11px] text-slate-400">{r.req}</span>,
    },
    { h: "状態", cell: (r: any) => <Badge>{r.status}</Badge> },
    {
      h: "操作",
      align: "right" as const,
      cell: (r: any) => (
        <div className="inline-flex gap-1.5">
          {r.status !== "完了" && (
            <QuickAct
              icon="request_quote"
              label="見積登録 / 業者確定"
              onClick={() => openEstimateModal(r)}
              color="amber"
            />
          )}
          {r.status !== "完了" && (
            <QuickAct
              icon="check_circle"
              label="完了にする"
              onClick={() => openCompleteModal(r)}
              color="emerald"
            />
          )}
        </div>
      ),
    },
  ];

  const totalCostThisMonth = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7).replace("-", "/");
    return repairs
      .filter((r: any) => r.status === "完了" && r.cost && String(r.completedAt || "").startsWith(ym))
      .reduce((s: number, r: any) => s + (r.cost || 0), 0);
  }, [repairs]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-4">
        <KPI
          label="修理待ち"
          value={counts["修理待ち"] + " 件"}
          icon="hourglass_empty"
          accent="var(--color-secondary)"
        />
        <KPI
          label="見積中"
          value={counts["見積中"] + " 件"}
          icon="request_quote"
        />
        <KPI
          label="修理中"
          value={counts["修理中"] + " 件"}
          icon="build"
        />
        <KPI
          label="今月 完了費用"
          value={FMT(totalCostThisMonth)}
          icon="paid"
          accent="var(--color-success)"
        />
      </div>

      <Tabs tabs={REPAIR_STATES} active={tab} onChange={setTab} counts={counts} />

      <Panel
        title="修理依頼"
        icon="build"
        sub="現場報告から自動作成、または管理者が直接依頼"
        action={
          <Btn size="sm" variant="primary" icon="add" onClick={() => setDrawerOpen(true)}>
            修理を依頼
          </Btn>
        }
      >
        <Table cols={cols} rows={filteredRepairs} />
      </Panel>

      {/* ── 見積登録モーダル ────────────────────────────────── */}
      <Modal
        open={!!estimating}
        onClose={() => setEstimating(null)}
        title="見積登録・業者確定"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEstimating(null)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={submitEstimate}>確定して修理中へ</Btn>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            依頼番号 <span className="font-mono font-bold text-blue-700">{estimating?.id}</span>
            ・ 対象 <span className="font-bold text-slate-700">{estimating?.asset}</span>
          </div>
          <Field label="修理業者" required>
            <SelectInput
              value={estVendor}
              onChange={(e) => setEstVendor(e.target.value)}
              options={["", ...vendors.map((v: any) => v.name)]}
            />
          </Field>
          <Field label="見積金額（円）" required>
            <TextInput
              type="number"
              value={estCost}
              onChange={(e) => setEstCost(e.target.value)}
              placeholder="例: 12000"
            />
          </Field>
        </div>
      </Modal>

      {/* ── 完了モーダル ────────────────────────────────────── */}
      <Modal
        open={!!completing}
        onClose={() => setCompleting(null)}
        title="修理完了の登録"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setCompleting(null)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={submitComplete}>完了として登録</Btn>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            依頼番号 <span className="font-mono font-bold text-blue-700">{completing?.id}</span>
            ・ 対象 <span className="font-bold text-slate-700">{completing?.asset}</span>
          </div>
          <Row>
            <Field label="実際の修理費用（円）" required>
              <TextInput
                type="number"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                placeholder="例: 12000"
              />
            </Field>
            <Field label="完了日" required>
              <TextInput type="date" value={doneDate} onChange={(e) => setDoneDate(e.target.value)} />
            </Field>
          </Row>
          <Field label="完了メモ（修理内容・備考）">
            <TextInput
              value={doneNote}
              onChange={(e) => setDoneNote(e.target.value)}
              placeholder="交換部品・対応内容など"
            />
          </Field>
          {completing?.sourceReportId && (
            <div className="text-[11px] text-slate-500 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2">
              この修理は現場報告 <span className="font-mono font-bold">{completing.sourceReportId}</span> から作成されました。
              完了登録すると報告も自動的に「対応済」に更新されます。
            </div>
          )}
        </div>
      </Modal>

      <AdminDocDrawer
        open={drawerOpen}
        kind="repair"
        onClose={() => setDrawerOpen(false)}
        onCreate={handleCreateRepair}
      />
    </div>
  );
}
