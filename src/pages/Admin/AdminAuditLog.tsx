import React, { useMemo, useState } from "react";
import { Panel, Table, Badge, SelectInput, TextInput, Toolbar, Btn } from "../../components/AdminUI";
import { useAdminCollection } from "../../context/AdminDataContext";
import { useUser } from "../../context/UserContext";

/**
 * AdminAuditLog — 操作ログ（監査ログ）閲覧タブ。
 * データは server(store.php) が全書き込みで記録した auditLogs ストア（admin のみ配信）。
 * クライアントは読み取り専用。記録漏れ・改竄はできない（server 側で一元記録のため）。
 */

// ストア → 日本語ラベル。
const STORE_LABEL: Record<string, string> = {
  orders: "受注", products: "商品", vehicles: "車両", users: "ユーザー",
  customers: "顧客", stocktake: "棚卸", walkinReturns: "持込返却",
  returnInspections: "検品", roles: "権限", systemSettings: "設定",
  suppliers: "仕入先", vendors: "修理業者", purchaseOrders: "発注", repairs: "修理",
};

// よく出る field → 日本語（無ければ元のキー名を表示）。
const FIELD_LABEL: Record<string, string> = {
  status: "ステータス", staffStatus: "配送状況", total: "合計", subtotal: "小計", tax: "税",
  delivery: "配送費", rentalStartDate: "開始日", rentalEndDate: "終了予定日", actualReturnDate: "返却日",
  deliveryDate: "納品日", stock: "在庫", name: "名称", price: "単価", rentPrice: "レンタル単価",
  buyPrice: "販売単価", companyName: "会社名", siteName: "現場名", deliveryLocation: "納品先",
  assignedStaff: "担当者", notes: "備考", inspectionDate: "車検満了日", plate: "ナンバー",
  email: "メール", phone: "電話", role: "権限", paid: "入金", paidAt: "入金日時",
};

const ACTION_META: Record<string, { label: string; tone: "default" | "ok" | "danger" | "warning" }> = {
  create: { label: "作成", tone: "ok" },
  update: { label: "更新", tone: "default" },
  delete: { label: "削除", tone: "danger" },
};

function fmtJst(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fieldLabel(f: string): string {
  return FIELD_LABEL[f] || f;
}

export default function AdminAuditLog() {
  const { rows: logs, live } = useAdminCollection("auditLogs");
  const { users } = useUser();

  const [storeFilter, setStoreFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(200);

  // userId → 表示名（姓 名／メール）。
  const userName = useMemo(() => {
    const m: Record<string, string> = {};
    (users || []).forEach((u: any) => {
      if (!u || !u.id) return;
      m[String(u.id)] = `${u.lastName || ""} ${u.firstName || ""}`.trim() || u.email || String(u.id);
    });
    return m;
  }, [users]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (logs || [])
      .filter((l: any) => l && l.ts)
      .filter((l: any) => storeFilter === "all" || l.store === storeFilter)
      .filter((l: any) => actionFilter === "all" || l.action === actionFilter)
      .filter((l: any) => {
        if (!query) return true;
        const hay = [
          l.recordLabel, l.recordId, userName[String(l.userId)] || l.userId,
          STORE_LABEL[l.store] || l.store,
          ...(Array.isArray(l.changes) ? l.changes.map((c: any) => `${fieldLabel(c.field)} ${c.from} ${c.to}`) : []),
        ].join(" ").toLowerCase();
        return hay.includes(query);
      })
      .sort((a: any, b: any) => String(b.ts).localeCompare(String(a.ts))); // 新しい順
  }, [logs, storeFilter, actionFilter, q, userName]);

  const shown = rows.slice(0, limit);

  const storeOptions = useMemo(() => {
    const present = Array.from(new Set((logs || []).map((l: any) => l && l.store).filter(Boolean)));
    return [{ v: "all", l: "すべての種別" }, ...present.map((s: any) => ({ v: s, l: STORE_LABEL[s] || s }))];
  }, [logs]);

  return (
    <div className="space-y-4">
      <Panel
        title="操作ログ"
        icon="history"
        sub={`だれが・いつ・なにを変更したか（新しい順・90日保持）${live ? "" : "・読込中…"}`}
        action={<Badge tone="default">{rows.length.toLocaleString()} 件</Badge>}
      >
        <Toolbar
          right={
            <div className="flex items-center gap-2">
              <div style={{ minWidth: 150 }}>
                <SelectInput value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} options={storeOptions} />
              </div>
              <div style={{ minWidth: 130 }}>
                <SelectInput
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  options={[
                    { v: "all", l: "すべての操作" },
                    { v: "create", l: "作成" },
                    { v: "update", l: "更新" },
                    { v: "delete", l: "削除" },
                  ]}
                />
              </div>
            </div>
          }
        >
          <div style={{ minWidth: 240 }}>
            <TextInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="対象・操作者・変更内容で検索"
            />
          </div>
        </Toolbar>

        <div className="mt-3">
          <Table
            maxHeight={620}
            cols={[
              {
                h: "日時",
                sortKey: (r: any) => r.ts,
                cell: (r: any) => <span className="whitespace-nowrap text-[13px] font-semibold text-[#173b38]">{fmtJst(r.ts)}</span>,
              },
              {
                h: "操作者",
                cell: (r: any) => (
                  <div>
                    <div className="font-bold text-[#173b38]">{userName[String(r.userId)] || r.userId || "—"}</div>
                    {r.userRole && <div className="text-[11px] text-[#7ca39f]">{r.userRole === "admin" ? "管理者" : r.userRole}</div>}
                  </div>
                ),
              },
              {
                h: "種別 / 操作",
                cell: (r: any) => (
                  <div className="flex items-center gap-1.5">
                    <Badge tone="default">{STORE_LABEL[r.store] || r.store}</Badge>
                    <Badge tone={ACTION_META[r.action]?.tone || "default"}>{ACTION_META[r.action]?.label || r.action}</Badge>
                  </div>
                ),
              },
              {
                h: "対象",
                cell: (r: any) => (
                  <div>
                    <div className="font-semibold text-[#173b38]">{r.recordLabel || "—"}</div>
                    <div className="text-[11px] text-[#9bb3af] font-mono">{r.recordId}</div>
                  </div>
                ),
              },
              {
                h: "変更内容",
                wrap: true,
                cell: (r: any) => {
                  if (r.action !== "update" || !Array.isArray(r.changes) || r.changes.length === 0) {
                    return <span className="text-[#9bb3af] text-[12px]">—</span>;
                  }
                  return (
                    <div className="space-y-0.5 max-w-[420px]">
                      {r.changes.map((c: any, i: number) => (
                        <div key={i} className="text-[12px] leading-snug">
                          <span className="font-bold text-[#5f6f6c]">{fieldLabel(c.field)}:</span>{" "}
                          <span className="text-[#c0392b] line-through decoration-[#e0b4ad]">{String(c.from ?? "") || "（空）"}</span>
                          <span className="text-[#9bb3af] mx-1">→</span>
                          <span className="text-[#1f8a4c] font-semibold">{String(c.to ?? "") || "（空）"}</span>
                        </div>
                      ))}
                    </div>
                  );
                },
              },
            ]}
            rows={shown}
          />
        </div>

        {rows.length > shown.length && (
          <div className="py-4 text-center">
            <Btn variant="secondary" onClick={() => setLimit((n) => n + 200)}>
              さらに表示（残り {(rows.length - shown.length).toLocaleString()} 件）
            </Btn>
          </div>
        )}
      </Panel>
    </div>
  );
}
