import React, { useState, useEffect } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import {
  Badge,
  Btn,
  Panel,
  Tabs,
  Table,
  Modal,
  Field,
  TextInput,
  SelectInput,
  Row,
  triggerToast,
  Avatar
} from "../../components/AdminUI";
import {
  USERS as INITIAL_USERS,
  ROLES as INITIAL_ROLES,
  PERM_MODULES
} from "../../data/adminMockData";

const PERM_STYLE: Record<string, [string, string]> = {
  "編集": ["rgba(58,77,232,0.1)", "var(--color-primary)"],
  "閲覧": ["rgba(107,116,136,0.1)", "var(--color-neutral-700)"],
  "なし": ["transparent", "rgba(154,161,178,0.4)"],
};

function PermPill({ p }: { p: string }) {
  const [bg, fg] = PERM_STYLE[p] || PERM_STYLE["なし"];
  return (
    <span
      className="inline-flex items-center h-[22px] px-2.5 rounded-sm font-semibold text-xs whitespace-nowrap border"
      style={{
        background: bg,
        color: fg,
        borderColor: p === "なし" ? "rgba(107,116,136,0.2)" : "transparent",
        borderStyle: p === "なし" ? "dashed" : "solid",
      }}
    >
      {p}
    </span>
  );
}

function QuickAct({ icon, label, tone, onClick }: { icon: string; label: string; tone?: "danger" | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer ${
        tone === "danger" ? "text-red-500 hover:text-red-700 hover:bg-red-50" : "text-slate-500 hover:text-blue-600"
      }`}
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );
}

function AddUserModal({ open, onClose, onSave, rolesList }: { open: boolean; onClose: () => void; onSave: (u: any) => void; rolesList: any[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setRole(rolesList[1]?.name || "倉庫マネージャー");
      setDept("");
    }
  }, [open, rolesList]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      triggerToast("氏名を入力してください", "warn");
      return;
    }
    if (!email.trim()) {
      triggerToast("メールアドレスを入力してください", "warn");
      return;
    }

    const u = {
      id: "U-" + Math.floor(100 + Math.random() * 900),
      name,
      initials: name.slice(0, 1),
      role,
      dept: dept || "一般部門",
      mail: email,
      status: "有効",
      last: "—"
    };
    onSave(u);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ユーザを追加"
      width={460}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>キャンセル</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>追加</Btn>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="氏名" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" />
        </Field>
        <Field label="メールアドレス" required>
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@asahi.example" />
        </Field>
        <Row>
          <Field label="ロール" required>
            <SelectInput value={role} onChange={(e) => setRole(e.target.value)} options={rolesList.map((r) => r.name)} />
          </Field>
          <Field label="所属">
            <TextInput value={dept} onChange={(e) => setDept(e.target.value)} placeholder="例：東京中央倉庫" />
          </Field>
        </Row>
      </form>
    </Modal>
  );
}

function RolePermModal({ role, onClose, onSave }: { role: any | null; onClose: () => void; onSave: (roleId: string, perms: string[]) => void }) {
  const [perms, setPerms] = useState<string[]>([]);

  useEffect(() => {
    if (role) {
      setPerms([...role.perms]);
    }
  }, [role]);

  if (!role) return null;

  const submit = () => {
    onSave(role.id, perms);
    onClose();
  };

  return (
    <Modal
      open={!!role}
      onClose={onClose}
      title={role.name + " の権限を編集"}
      width={460}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>キャンセル</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>保存</Btn>
        </>
      }
    >
      <div className="text-xs text-slate-500 mb-4 leading-normal">{role.desc}</div>
      <div className="space-y-3">
        {PERM_MODULES.map((mod, i) => (
          <div key={mod} className="flex items-center gap-3 justify-between">
            <span className="text-sm font-bold text-slate-700">{mod}</span>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {["編集", "閲覧", "なし"].map((opt) => {
                const on = perms[i] === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setPerms((p) => p.map((x, xi) => (xi === i ? opt : x)))}
                    className={`h-7 px-3.5 rounded-md cursor-pointer transition-all border-none ${
                      on ? "bg-white text-blue-700 font-bold shadow-sm" : "bg-transparent text-slate-400 font-medium hover:text-slate-600"
                    } text-xs`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ToggleRow({ label, sub, on: initial }: { label: string; sub?: string; on?: boolean }) {
  const [on, setOn] = useState(!!initial);
  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-slate-100 justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-slate-800">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-0.5 leading-normal">{sub}</div>}
      </div>
      <button
        onClick={() => setOn((o) => !o)}
        className={`w-10 h-[22px] rounded-full border-none cursor-pointer relative transition-colors ${
          on ? "bg-blue-600" : "bg-slate-200"
        } flex-shrink-0`}
      >
        <span
          className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all shadow-sm"
          style={{ left: on ? "20px" : "2px" }}
        />
      </button>
    </div>
  );
}

function DataSyncTab() {
  const ctx = useAdminData();
  const [seeding, setSeeding] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const cols = ctx ? ctx.cols : {};

  const COLL_LABELS: Record<string, string> = {
    orders: "注文（顧客アプリ）",
    products: "商品カタログ",
    assets: "保安品",
    warehouse: "倉庫在庫",
    stocktake: "棚卸",
    stockIn: "入庫",
    stockOut: "出庫",
    repairs: "修理・保証",
    maintenance: "メンテナンス",
    customers: "顧客",
    suppliers: "仕入先",
    vendors: "修理業者",
    fieldReports: "現場報告",
    vehicles: "車両",
  };

  const doSeed = async () => {
    if (!ctx || !ctx.seedAll) return;
    setSeeding(true);
    try {
      const res = await ctx.seedAll();
      setResults(res);
      triggerToast("初期データの投入が完了しました", "ok");
    } catch (err) {
      triggerToast("シード処理中にエラーが発生しました", "err");
    } finally {
      setSeeding(false);
    }
  };

  const orderCount = ctx ? ctx.raw.length : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Panel title="データ連携状況" icon="database" sub="OrderBus (localStorage + BroadcastChannel)">
        <div className="flex items-center gap-3 py-3 border-b border-slate-100">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.16)] flex-shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-slate-800">接続中（リアルタイム同期）</div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">
              3アプリ間でlocalStorage + BroadcastChannelで同期
            </div>
          </div>
          <Badge tone="ok">完了</Badge>
        </div>
        <div className="py-3 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">注文ドキュメント数</span>
            <span className="font-mono font-bold text-slate-800">{orderCount} 件</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">連携中コレクション</span>
            <span className="font-mono font-bold text-slate-800">
              {Object.keys(cols).filter((k) => (cols[k] || []).length > 0).length} / {Object.keys(COLL_LABELS).length - 1}
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="初期データ投入（シード）" icon="upload" sub="マスタ・在庫データをローカルストレージに登録">
        <p className="text-xs text-slate-500 mb-4 leading-normal">
          保安品・倉庫・顧客・仕入先などのデータをlocalStorageに書き込みます。既にデータがある項目はスキップされます。
        </p>
        <Btn variant="primary" icon="upload" onClick={doSeed} disabled={seeding}>
          {seeding ? "投入中…" : "初期データを投入"}
        </Btn>
        {results && (
          <div className="mt-4 border-t border-slate-100 pt-3 space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                <span className="text-slate-500 font-medium">{COLL_LABELS[r.name] || r.name}</span>
                <span className={`font-bold ${r.error ? "text-red-500" : r.skipped ? "text-slate-400" : "text-emerald-600"}`}>
                  {r.error ? "エラー" : r.skipped ? "スキップ（既存）" : `${r.seeded} 件 登録`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="連携の仕組み" icon="info" style={{ gridColumn: "1 / -1" }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {[
            ["顧客アプリ", "顧客が注文 → orders コレクションに追加", "shopping_cart"],
            ["管理コンソール", "全データをリアルタイム表示・編集", "monitor"],
            ["現場スタッフアプリ", "注文を配送・回収タスクとして受信", "smartphone"],
          ].map(([t, d, ic], i) => (
            <div key={i} className="p-3.5 border border-slate-100 rounded-xl bg-slate-50 flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600 text-[20px] mt-0.5">{ic}</span>
              <div>
                <div className="font-bold text-xs text-slate-800">{t}</div>
                <div className="text-[10px] text-slate-500 mt-1 font-medium leading-normal">{d}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export default function AdminSettings() {
  const [tab, setTab] = useState("users");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editRole, setEditRole] = useState<any | null>(null);

  // Read admin users and roles from localStorage with fallback to initial data
  const [users, setUsers] = useState<any[]>(() => {
    const saved = localStorage.getItem("asahi.admin_users");
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [roles, setRoles] = useState<any[]>(() => {
    const saved = localStorage.getItem("asahi.admin_roles");
    return saved ? JSON.parse(saved) : INITIAL_ROLES;
  });

  useEffect(() => {
    localStorage.setItem("asahi.admin_users", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem("asahi.admin_roles", JSON.stringify(roles));
  }, [roles]);

  const handleAddUser = (newUser: any) => {
    setUsers((x) => [newUser, ...x]);
    triggerToast(`ユーザ ${newUser.name} を追加しました`, "ok");
  };

  const handleToggleUserStatus = (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "有効" ? "無効" : "有効";
    setUsers((x) =>
      x.map((u) => (u.id === id ? { ...u, status: nextStatus } : u))
    );
    triggerToast(`ユーザのステータスを ${nextStatus} に変更しました`, "ok");
  };

  const handleSaveRolePerms = (roleId: string, perms: string[]) => {
    setRoles((x) =>
      x.map((r) => (r.id === roleId ? { ...r, perms } : r))
    );
    triggerToast("権限設定を更新しました", "ok");
  };

  const userCols = [
    {
      h: "ユーザ",
      wrap: true,
      cell: (r: any) => (
        <div className="flex items-center gap-3">
          <Avatar
            initials={r.initials}
            size={32}
            color={r.status === "無効" ? "var(--color-neutral-400)" : "var(--color-primary)"}
          />
          <div>
            <div className="font-bold text-slate-800">{r.name}</div>
            <div className="text-[11px] text-slate-400 font-medium">{r.mail}</div>
          </div>
        </div>
      ),
    },
    { h: "ロール", cell: (r: any) => <span className="font-bold text-blue-700">{r.role}</span> },
    { h: "所属", wrap: true, cell: (r: any) => <span className="text-slate-500">{r.dept}</span> },
    { h: "最終ログイン", align: "right" as const, cell: (r: any) => <span className="font-mono text-[11px] text-slate-400">{r.last}</span> },
    { h: "状態", cell: (r: any) => <Badge>{r.status === "有効" ? "完了" : "在庫"}</Badge> },
    {
      h: "操作",
      align: "right" as const,
      cell: (r: any) => (
        <div className="inline-flex gap-1">
          <QuickAct icon="edit" label="編集" onClick={() => triggerToast(r.name + " を編集 (未実装)", "info")} />
          <QuickAct
            icon={r.status === "有効" ? "lock" : "lock_open"}
            label={r.status === "有効" ? "無効化" : "有効化"}
            tone={r.status === "有効" ? "danger" : null}
            onClick={() => handleToggleUserStatus(r.id, r.status)}
          />
        </div>
      ),
    },
  ];

  const roleCols = [
    {
      h: "ロール",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.name}</div>
          <div className="text-[10px] text-slate-400 font-medium leading-normal mt-0.5">{r.desc}</div>
        </div>
      ),
    },
    ...PERM_MODULES.map((mod, i) => ({
      h: mod,
      align: "center" as const,
      cell: (r: any) => <PermPill p={r.perms[i]} />,
    })),
    { h: "人数", align: "right" as const, cell: (r: any) => <span className="font-mono">{r.users}</span> },
    {
      h: "",
      align: "right" as const,
      cell: (r: any) => <QuickAct icon="edit" label="編集" onClick={() => setEditRole(r)} />,
    },
  ];

  const tabs = [
    { id: "users", label: "ユーザ" },
    { id: "roles", label: "権限（ロール）" },
    { id: "general", label: "一般設定" },
    { id: "data", label: "データ連携" },
  ];

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      
      {tab === "users" && (
        <Panel
          title="ユーザ管理"
          icon="group"
          sub={`${users.length} 名 ・ 有効 ${users.filter((u) => u.status === "有効").length} 名`}
          action={
            <Btn size="sm" variant="primary" icon="add" onClick={() => setAddUserOpen(true)}>
              ユーザを追加
            </Btn>
          }
        >
          <Table cols={userCols} rows={users} />
        </Panel>
      )}

      {tab === "roles" && (
        <Panel
          title="ロールと権限"
          icon="lock"
          sub="モジュールごとの編集／閲覧／なしを設定"
          action={
            <Btn size="sm" variant="primary" icon="add" onClick={() => triggerToast("新規ロール作成はデモ用です", "info")}>
              ロールを追加
            </Btn>
          }
        >
          <Table cols={roleCols} rows={roles} />
        </Panel>
      )}

      {tab === "general" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="取引・税" icon="payments">
            <Field label="消費税率">
              <SelectInput options={["10%", "8%（軽減税率）"]} />
            </Field>
            <Field label="請求書の支払期限（既定）">
              <SelectInput options={["翌月末", "30日後", "60日後"]} />
            </Field>
            <Field label="通貨">
              <SelectInput options={["日本円 (¥)"]} />
            </Field>
          </Panel>
          <Panel title="運用・通知" icon="notifications">
            <ToggleRow label="車検・保証の期限通知" sub="90 / 30 / 7日前に通知" on />
            <ToggleRow label="延滞レンタルのアラート" sub="返却期限超過で通知" on />
            <ToggleRow label="現場報告のプッシュ通知" sub="不足・破損 of 現場報告を受信" on />
            <ToggleRow label="棚卸し差異の自動フラグ" sub="差異が出た品目を強調" />
          </Panel>
          <Panel title="棚卸し" icon="checklist">
            <Field label="棚卸し周期">
              <SelectInput options={["毎月", "隔月", "四半期"]} />
            </Field>
            <Field label="差異許容範囲">
              <SelectInput options={["0（完全一致）", "±1", "±3"]} />
            </Field>
          </Panel>
          <Panel title="会社情報" icon="business">
            <Field label="会社名">
              <TextInput defaultValue="アサヒリース 株式会社" />
            </Field>
            <Field label="倉庫拠点">
              <TextInput defaultValue="東京中央倉庫" />
            </Field>
            <div className="mt-4">
              <Btn variant="primary" icon="save" onClick={() => triggerToast("設定を保存しました", "ok")}>
                変更を保存
              </Btn>
            </div>
          </Panel>
        </div>
      )}

      {tab === "data" && <DataSyncTab />}

      <AddUserModal open={addUserOpen} onClose={() => setAddUserOpen(false)} onSave={handleAddUser} rolesList={roles} />
      <RolePermModal role={editRole} onClose={() => setEditRole(null)} onSave={handleSaveRolePerms} />
    </div>
  );
}
