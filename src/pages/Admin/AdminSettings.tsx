import React, { useEffect, useMemo, useState } from "react";
import { alertDialog } from "../../components/AppDialog";
import { useAdminData } from "../../context/AdminDataContext";
import { useUser, type UserProfile } from "../../context/UserContext";
import OrderBus from "../../lib/orderBus";
import {
  Avatar,
  Badge,
  Btn,
  Field,
  Modal,
  Panel,
  Row,
  SelectInput,
  Table,
  Tabs,
  TextInput,
  triggerToast,
} from "../../components/AdminUI";
import { PERM_MODULES, ROLES as INITIAL_ROLES } from "../../data/adminMockData";

const PERM_OPTIONS = ["編集", "閲覧", "なし"];

const PERM_STYLE: Record<string, [string, string]> = {
  "編集": ["rgba(43,168,162,0.12)", "#1E8C86"],
  "閲覧": ["rgba(255,210,63,0.22)", "#6A5200"],
  "なし": ["transparent", "rgba(124,163,159,0.65)"],
};

const ROLE_FALLBACK_BY_USER_ROLE: Record<string, string> = {
  admin: "admin",
  staff: "driver",
  customer: "viewer",
  customer_staff: "viewer",
};

const DEFAULT_SETTINGS = {
  id: "global",
  taxRate: "10",
  invoiceDue: "翌月末",
  currency: "JPY",
  stocktakeCycle: "毎月",
  stocktakeTolerance: "0",
  companyName: "アサヒリース株式会社",
  warehouseName: "東京中央倉庫",
  notifyVehicle: true,
  notifyOverdue: true,
  notifyFieldReport: true,
  flagStocktakeDiff: true,
  requireStaffSignature: true,
  allowSameDayBefore14: true,
};

type SystemSettings = typeof DEFAULT_SETTINGS;

function roleFromStore(row: any) {
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    desc: String(row.desc || ""),
    perms: Array.isArray(row.perms) ? row.perms : [...PERM_MODULES].map(() => "なし"),
  };
}

function normalizeRoles(rows: any[]) {
  const source = rows.length > 0 ? rows : INITIAL_ROLES;
  return source.map(roleFromStore);
}

function displayName(user: UserProfile) {
  return `${user.lastName || ""} ${user.firstName || ""}`.trim() || user.email || user.id;
}

function initials(user: UserProfile) {
  const name = displayName(user);
  return name.slice(0, 1).toUpperCase();
}

function userPermissionRoleId(user: UserProfile) {
  const explicit = (user as any).permissionRoleId;
  if (explicit) return String(explicit);
  return ROLE_FALLBACK_BY_USER_ROLE[String(user.role || "")] || "viewer";
}

function statusLabel(status?: string) {
  return status === "inactive" ? "無効" : "有効";
}

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

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-slate-100 justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-slate-800">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-0.5 leading-normal">{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-[22px] rounded-full border-none cursor-pointer relative transition-colors ${
          checked ? "bg-blue-600" : "bg-slate-200"
        } flex-shrink-0`}
      >
        <span
          className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all shadow-sm"
          style={{ left: checked ? "20px" : "2px" }}
        />
      </button>
    </div>
  );
}

function AddUserModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (u: UserProfile) => void }) {
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [team, setTeam] = useState("");
  const [position, setPosition] = useState("配送・回収・倉庫スタッフ");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setLastName("");
    setFirstName("");
    setEmail("");
    setEmployeeCode("");
    setTeam("");
    setPosition("配送・回収・倉庫スタッフ");
    setRole("staff");
    setPassword("");
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    if (!lastName.trim() || !firstName.trim() || !mail) {
      triggerToast("氏名とメールアドレスを入力してください", "warn");
      return;
    }
    const generatedPassword = password.trim() || Math.random().toString(36).slice(-8);
    const id = employeeCode.trim() || "USR_" + Date.now();
    onSave({
      id,
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      companyName: "ASAHI LEASE",
      email: mail,
      phone: "",
      address: "",
      avatarUrl: "",
      role,
      companyType: "our_company",
      password: generatedPassword,
      employeeCode: id,
      team: team.trim(),
      position: position.trim(),
      status: "active",
    } as UserProfile);
    if (!password.trim()) {
      void alertDialog(`ログイン情報\n\nログインID: ${mail}\nパスワード: ${generatedPassword}\n\n必ず本人に共有してください。`);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="社内アカウントを追加"
      width={560}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>キャンセル</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>追加</Btn>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Row>
          <Field label="姓" required>
            <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field label="名" required>
            <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
        </Row>
        <Field label="メールアドレス" required>
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@asahi-lease.jp" />
        </Field>
        <Row>
          <Field label="社員ID">
            <TextInput value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="未入力なら自動採番" />
          </Field>
          <Field label="ログイン種別">
            <SelectInput value={role} onChange={(e) => setRole(e.target.value as "admin" | "staff")} options={[{ v: "staff", l: "スタッフ" }, { v: "admin", l: "管理者" }]} />
          </Field>
        </Row>
        <Row>
          <Field label="拠点・チーム">
            <TextInput value={team} onChange={(e) => setTeam(e.target.value)} placeholder="例：東京中央倉庫" />
          </Field>
          <Field label="職種">
            <TextInput value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
        </Row>
        <Field label="初期パスワード" hint="空欄の場合は自動生成されます">
          <TextInput value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function RolePermModal({ role, onClose, onSave }: { role: any | null; onClose: () => void; onSave: (roleId: string, updates: any) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [perms, setPerms] = useState<string[]>([]);

  useEffect(() => {
    if (!role) return;
    setName(role.name || "");
    setDesc(role.desc || "");
    setPerms(PERM_MODULES.map((_, i) => role.perms?.[i] || "なし"));
  }, [role]);

  if (!role) return null;

  const submit = () => {
    if (!name.trim()) {
      triggerToast("ロール名を入力してください", "warn");
      return;
    }
    onSave(role.id, { name: name.trim(), desc: desc.trim(), perms });
    onClose();
  };

  return (
    <Modal
      open={!!role}
      onClose={onClose}
      title="ロール・権限を編集"
      width={560}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>キャンセル</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>保存</Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Row>
          <Field label="ロール名" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="説明">
            <TextInput value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
        </Row>
        <div className="space-y-3">
          {PERM_MODULES.map((mod, i) => (
            <div key={mod} className="flex items-center gap-3 justify-between">
              <span className="text-sm font-bold text-slate-700">{mod}</span>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {PERM_OPTIONS.map((opt) => {
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
      </div>
    </Modal>
  );
}

function DataSyncTab() {
  const ctx = useAdminData();
  const [seeding, setSeeding] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const cols = ctx ? ctx.cols : {};

  const doSeed = async () => {
    if (!ctx || !ctx.seedAll) return;
    setSeeding(true);
    try {
      const res = await ctx.seedAll();
      setResults(res);
      triggerToast("初期データの投入が完了しました", "ok");
    } catch {
      triggerToast("シード処理中にエラーが発生しました", "err");
    } finally {
      setSeeding(false);
    }
  };

  const syncStores = ["products", "orders", "users", "roles", "systemSettings", "vehicles", "warehouse", "stockIn", "stockOut", "returnInspections"];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Panel title="データ連携状況" icon="database" sub="XServer / records テーブルで全サイト共有">
        <div className="flex items-center gap-3 py-3 border-b border-slate-100">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.16)] flex-shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-slate-800">接続中（XServer / PHP MySQL）</div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">管理・スタッフ・顧客サイトが同じデータを参照します</div>
          </div>
          <Badge tone="ok">完了</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 py-3">
          {syncStores.map((name) => (
            <div key={name} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <div className="text-[10px] font-bold text-slate-400">{name}</div>
              <div className="font-mono text-sm font-black text-slate-700">{name === "orders" ? ctx.raw.length : (cols[name] || []).length} 件</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="初期データ投入" icon="upload" sub="空のマスタだけ登録">
        <p className="text-xs text-slate-500 mb-4 leading-normal">
          保安品・倉庫・顧客・仕入先などの初期データを登録します。既にデータがある項目はスキップされます。
        </p>
        <Btn variant="primary" icon="upload" onClick={doSeed} disabled={seeding}>
          {seeding ? "投入中…" : "初期データを投入"}
        </Btn>
        {results && (
          <div className="mt-4 border-t border-slate-100 pt-3 space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                <span className="text-slate-500 font-medium">{r.name}</span>
                <span className={`font-bold ${r.error ? "text-red-500" : r.skipped ? "text-slate-400" : "text-emerald-600"}`}>
                  {r.error ? "エラー" : r.skipped ? "スキップ" : `${r.seeded} 件 登録`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function AdminSettings() {
  const { users, addUser, updateUser } = useUser();
  const [tab, setTab] = useState("users");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editRole, setEditRole] = useState<any | null>(null);
  const [roleRows, setRoleRows] = useState<any[]>(() => OrderBus.getAll("roles"));
  const [settingsRows, setSettingsRows] = useState<any[]>(() => OrderBus.getAll("systemSettings"));
  const [settingsDraft, setSettingsDraft] = useState<SystemSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const unsubRoles = OrderBus.subscribe("roles", (rows) => setRoleRows(rows || []));
    const unsubSettings = OrderBus.subscribe("systemSettings", (rows) => setSettingsRows(rows || []));
    return () => {
      unsubRoles();
      unsubSettings();
    };
  }, []);

  const roles = useMemo(() => normalizeRoles(roleRows), [roleRows]);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(settingsRows.find((r) => r.id === "global") || {}) }), [settingsRows]);

  useEffect(() => {
    setSettingsDraft(settings);
  }, [settings]);

  const roleOptions = roles.map((r) => ({ v: r.id, l: r.name }));
  const systemUsers = users.filter((u) => u.companyType === "our_company" || u.role === "admin" || u.role === "staff");

  const roleUserCount = (roleId: string) =>
    systemUsers.filter((u) => userPermissionRoleId(u) === roleId).length;

  const handleSaveRole = (roleId: string, updates: any) => {
    const current = roles.find((r) => r.id === roleId);
    const payload = { ...(current || { id: roleId }), ...updates, id: roleId, updatedAt: new Date().toISOString() };
    if (roleRows.some((r) => r.id === roleId)) {
      OrderBus.patch("roles", roleId, payload);
    } else {
      OrderBus.push("roles", payload);
    }
    triggerToast("権限設定をXServerへ保存しました", "ok");
  };

  const handleAssignRole = (userId: string, roleId: string) => {
    updateUser(userId, { ...( { permissionRoleId: roleId } as any) });
    triggerToast("ユーザーの権限ロールを更新しました", "ok");
  };

  const handleToggleUserStatus = (user: UserProfile) => {
    const next = user.status === "inactive" ? "active" : "inactive";
    updateUser(user.id, { status: next });
    triggerToast(`${displayName(user)} を${next === "inactive" ? "無効" : "有効"}にしました`, "ok");
  };

  const handleAddUser = (user: UserProfile) => {
    addUser({ ...user, ...( { permissionRoleId: user.role === "admin" ? "admin" : "driver" } as any) });
    triggerToast(`${displayName(user)} を追加しました`, "ok");
  };

  const handleSaveSettings = () => {
    const payload = { ...settingsDraft, id: "global", updatedAt: new Date().toISOString() };
    if (settingsRows.some((row) => row.id === "global")) {
      OrderBus.patch("systemSettings", "global", payload);
    } else {
      OrderBus.push("systemSettings", payload);
    }
    triggerToast("システム設定をXServerへ保存しました", "ok");
  };

  const userCols = [
    {
      h: "ユーザ",
      wrap: true,
      cell: (u: UserProfile) => (
        <div className="flex items-center gap-3">
          <Avatar initials={initials(u)} size={32} color={u.status === "inactive" ? "var(--color-neutral-400)" : "var(--color-primary)"} />
          <div>
            <div className="font-bold text-slate-800">{displayName(u)}</div>
            <div className="text-[11px] text-slate-400 font-medium">{u.email || u.id}</div>
          </div>
        </div>
      ),
    },
    { h: "ログイン種別", cell: (u: UserProfile) => <span className="font-bold text-blue-700">{u.role === "admin" ? "管理者" : "スタッフ"}</span> },
    { h: "所属", wrap: true, cell: (u: UserProfile) => <span className="text-slate-500">{u.team || u.position || "—"}</span> },
    {
      h: "権限ロール",
      cell: (u: UserProfile) => (
        <SelectInput
          value={userPermissionRoleId(u)}
          onChange={(e) => handleAssignRole(u.id, e.target.value)}
          options={roleOptions}
          className="min-w-[160px]"
        />
      ),
    },
    { h: "状態", cell: (u: UserProfile) => <Badge tone={u.status === "inactive" ? "danger" : "ok"}>{statusLabel(u.status)}</Badge> },
    {
      h: "操作",
      align: "right" as const,
      cell: (u: UserProfile) => (
        <QuickAct
          icon={u.status === "inactive" ? "lock_open" : "lock"}
          label={u.status === "inactive" ? "有効化" : "無効化"}
          tone={u.status === "inactive" ? null : "danger"}
          onClick={() => handleToggleUserStatus(u)}
        />
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
      cell: (r: any) => <PermPill p={r.perms[i] || "なし"} />,
    })),
    { h: "人数", align: "right" as const, cell: (r: any) => <span className="font-mono">{roleUserCount(r.id)}</span> },
    { h: "", align: "right" as const, cell: (r: any) => <QuickAct icon="edit" label="編集" onClick={() => setEditRole(r)} /> },
  ];

  const tabs = [
    { id: "users", label: "アカウント権限" },
    { id: "roles", label: "ロール設定" },
    { id: "general", label: "一般設定" },
    { id: "data", label: "データ連携" },
  ];

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "users" && (
        <Panel
          title="実アカウント権限"
          icon="group"
          sub={`${systemUsers.length} 名 ・ 有効 ${systemUsers.filter((u) => u.status !== "inactive").length} 名`}
          action={<Btn size="sm" variant="primary" icon="add" onClick={() => setAddUserOpen(true)}>社内アカウント追加</Btn>}
        >
          <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            ここで変更した権限・停止状態は XServer の users レコードに保存され、admin / staff ログインへ反映されます。
          </div>
          <Table cols={userCols} rows={systemUsers} />
        </Panel>
      )}

      {tab === "roles" && (
        <Panel title="ロールと権限" icon="lock" sub="モジュールごとの編集／閲覧／なしを設定">
          <Table cols={roleCols} rows={roles} />
        </Panel>
      )}

      {tab === "general" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="取引・請求" icon="payments">
            <Row>
              <Field label="消費税率">
                <SelectInput value={settingsDraft.taxRate} onChange={(e) => setSettingsDraft((s) => ({ ...s, taxRate: e.target.value }))} options={[{ v: "10", l: "10%" }, { v: "8", l: "8%（軽減税率）" }]} />
              </Field>
              <Field label="請求書の支払期限">
                <SelectInput value={settingsDraft.invoiceDue} onChange={(e) => setSettingsDraft((s) => ({ ...s, invoiceDue: e.target.value }))} options={["翌月末", "30日後", "60日後"]} />
              </Field>
            </Row>
            <Field label="通貨">
              <SelectInput value={settingsDraft.currency} onChange={(e) => setSettingsDraft((s) => ({ ...s, currency: e.target.value }))} options={[{ v: "JPY", l: "日本円 (¥)" }]} />
            </Field>
          </Panel>

          <Panel title="運用・通知" icon="notifications">
            <ToggleRow label="車検・保証の期限通知" sub="90 / 30 / 7日前に通知" checked={settingsDraft.notifyVehicle} onChange={(v) => setSettingsDraft((s) => ({ ...s, notifyVehicle: v }))} />
            <ToggleRow label="延滞レンタルのアラート" sub="返却期限超過で通知" checked={settingsDraft.notifyOverdue} onChange={(v) => setSettingsDraft((s) => ({ ...s, notifyOverdue: v }))} />
            <ToggleRow label="現場報告の通知" sub="不足・破損の報告を通知" checked={settingsDraft.notifyFieldReport} onChange={(v) => setSettingsDraft((s) => ({ ...s, notifyFieldReport: v }))} />
            <ToggleRow label="スタッフ署名を必須扱い" sub="納品・回収記録にサインを残す運用" checked={settingsDraft.requireStaffSignature} onChange={(v) => setSettingsDraft((s) => ({ ...s, requireStaffSignature: v }))} />
          </Panel>

          <Panel title="棚卸し" icon="checklist">
            <Row>
              <Field label="棚卸し周期">
                <SelectInput value={settingsDraft.stocktakeCycle} onChange={(e) => setSettingsDraft((s) => ({ ...s, stocktakeCycle: e.target.value }))} options={["毎月", "隔月", "四半期"]} />
              </Field>
              <Field label="差異許容範囲">
                <SelectInput value={settingsDraft.stocktakeTolerance} onChange={(e) => setSettingsDraft((s) => ({ ...s, stocktakeTolerance: e.target.value }))} options={[{ v: "0", l: "0（完全一致）" }, { v: "1", l: "±1" }, { v: "3", l: "±3" }]} />
              </Field>
            </Row>
            <ToggleRow label="棚卸し差異の自動フラグ" checked={settingsDraft.flagStocktakeDiff} onChange={(v) => setSettingsDraft((s) => ({ ...s, flagStocktakeDiff: v }))} />
          </Panel>

          <Panel title="会社情報" icon="business" action={<Btn variant="primary" icon="save" onClick={handleSaveSettings}>保存</Btn>}>
            <Field label="会社名">
              <TextInput value={settingsDraft.companyName} onChange={(e) => setSettingsDraft((s) => ({ ...s, companyName: e.target.value }))} />
            </Field>
            <Field label="倉庫拠点">
              <TextInput value={settingsDraft.warehouseName} onChange={(e) => setSettingsDraft((s) => ({ ...s, warehouseName: e.target.value }))} />
            </Field>
            <ToggleRow label="14時前の当日納品受付" checked={settingsDraft.allowSameDayBefore14} onChange={(v) => setSettingsDraft((s) => ({ ...s, allowSameDayBefore14: v }))} />
          </Panel>
        </div>
      )}

      {tab === "data" && <DataSyncTab />}

      <AddUserModal open={addUserOpen} onClose={() => setAddUserOpen(false)} onSave={handleAddUser} />
      <RolePermModal role={editRole} onClose={() => setEditRole(null)} onSave={handleSaveRole} />
    </div>
  );
}
