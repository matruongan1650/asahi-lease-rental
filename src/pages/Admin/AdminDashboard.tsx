import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminSidebar, { AdminTab } from "../../components/AdminSidebar";
import AdminCommandPalette from "../../components/AdminCommandPalette";
import AdminDashboardHome from "../../components/AdminDashboardHome";
import AdminProductManagement from "../../components/AdminProductManagement";
import AdminUserManagement from "../../components/AdminUserManagement";
import AdminCustomerManagement from "../../components/AdminCustomerManagement";
import AdminFieldReportManagement from "../../components/AdminFieldReportManagement";
import { ToastHost } from "../../components/AdminUI";
import { useAdminCollection, useAdminOrders } from "../../context/AdminDataContext";

// New Admin components
import AdminCalendar from "./AdminCalendar";
import AdminWarehouse from "./AdminWarehouse";
import AdminVehicles from "./AdminVehicles";
import AdminStocktake from "./AdminStocktake";
import AdminStockIn from "./AdminStockIn";
import AdminStockOut from "./AdminStockOut";
import AdminRental from "./AdminRental";
import AdminSales from "./AdminSales";
import AdminInvoices from "./AdminInvoices";
import AdminRecovery from "./AdminRecovery";
import AdminRepairWarranty from "./AdminRepairWarranty";
import AdminMaintenance from "./AdminMaintenance";
import AdminSuppliers from "./AdminSuppliers";
import AdminVendors from "./AdminVendors";
import AdminSettings from "./AdminSettings";
import AdminAuditLog from "./AdminAuditLog";
import { buildAdminNotifications } from "../../utils/notifications";
import { isClosedOrder, isOverdueRentalOrder } from "../../utils/orderStatus";
import { useNotificationReads } from "../../lib/notificationReads";
import { useUser } from "../../context/UserContext";
import { ROLES as INITIAL_ROLES } from "../../data/adminMockData";

function notificationToneClass(tone: string) {
  if (tone === "danger") return "bg-red-50 text-red-700 border-red-100";
  if (tone === "warning") return "bg-amber-50 text-amber-700 border-amber-100";
  if (tone === "success") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  return "bg-blue-50 text-blue-700 border-blue-100";
}

export default function AdminDashboard() {
  // タブ切替を URL(?tab=...) と履歴に連動させる。これによりブラウザの「戻る」で前の管理画面へ戻れ、
  // 履歴を遡り切ると（管理画面に入る前のエントリへ）そのままサイトを抜ける（ログイン画面や顧客サイトに飛ばさない）。
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = useCallback(
    (t: AdminTab) => setSearchParams(t === "dashboard" ? {} : { tab: t }),
    [setSearchParams],
  );
  const [showNotifications, setShowNotifications] = useState(false);
  // コマンドパレット(#13): ⌘K / Ctrl+K で開く画面ジャンプ。
  const [showPalette, setShowPalette] = useState(false);
  const { currentUser } = useUser();
  const liveOrders = useAdminOrders();
  const { rows: fieldReports } = useAdminCollection("fieldReports");
  const { rows: products } = useAdminCollection("products");
  const { rows: vehicles } = useAdminCollection("vehicles");
  const { rows: maintenance } = useAdminCollection("maintenance");
  const { rows: systemSettingsRows } = useAdminCollection("systemSettings");
  const { rows: roleRows } = useAdminCollection("roles");

  const allowedTabs = useMemo(() => {
    const roles = roleRows.length > 0 ? roleRows : INITIAL_ROLES;
    const explicitRoleId = (currentUser as any)?.permissionRoleId;
    const roleId = explicitRoleId || (currentUser?.role === "admin" ? "admin" : "viewer");
    const role = roles.find((r: any) => r.id === roleId) || roles.find((r: any) => r.id === "admin");
    const perms = Array.isArray(role?.perms) ? role.perms : ["編集", "編集", "編集", "編集", "編集", "編集"];
    const can = (moduleIndex: number) => perms[moduleIndex] !== "なし";
    const allowed = new Set<AdminTab>();
    const add = (ok: boolean, tabs: AdminTab[]) => {
      if (ok) tabs.forEach((tab) => allowed.add(tab));
    };
    add(can(0), ["dashboard", "calendar"]);
    add(can(1), ["products", "warehouse", "vehicles", "inventory", "incoming", "outgoing", "security_goods"]);
    add(can(2), ["orders", "sales", "invoices", "collection"]);
    add(can(3), ["repair", "maintenance", "field_report"]);
    add(can(4), ["users", "customers", "suppliers", "repairers"]);
    add(can(5), ["settings", "audit"]);
    if (allowed.size === 0) allowed.add("dashboard");
    return allowed;
  }, [currentUser, roleRows]);

  // アクティブタブは URL(?tab=) から導出（履歴連動）。権限外・不正タブはダッシュボードへフォールバック。
  const requestedTab = (searchParams.get("tab") || "dashboard") as AdminTab;
  const activeTab: AdminTab = allowedTabs.has(requestedTab) ? requestedTab : "dashboard";

  useEffect(() => {
    // 権限のないタブが URL に指定されたら、許可された先頭タブへ置換（履歴は増やさない）。
    if (!allowedTabs.has(requestedTab)) {
      const first = (allowedTabs.values().next().value || "dashboard") as AdminTab;
      setSearchParams(first === "dashboard" ? {} : { tab: first }, { replace: true });
    }
  }, [requestedTab, allowedTabs, setSearchParams]);

  // ⌘K / Ctrl+K でコマンドパレットをトグル。入力欄にフォーカスがあっても有効化する（既定動作は抑止）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const systemSettings = useMemo(
    () => ({ notifyVehicle: true, notifyOverdue: true, notifyFieldReport: true, ...(systemSettingsRows.find((r: any) => r.id === "global") || {}) }),
    [systemSettingsRows],
  );

  const notifications = useMemo(
    () =>
      buildAdminNotifications({ orders: liveOrders.orders, fieldReports, products, vehicles, maintenance }).filter((item) => {
        if (item.id === "admin-overdue" && systemSettings.notifyOverdue === false) return false;
        if (item.id === "admin-field-reports" && systemSettings.notifyFieldReport === false) return false;
        if (item.id === "admin-maintenance" && systemSettings.notifyVehicle === false) return false;
        return true;
      }),
    [liveOrders.orders, fieldReports, products, vehicles, maintenance, systemSettings],
  );
  const { isRead, markRead, unreadCount } = useNotificationReads("admin");
  const notificationCount = unreadCount(notifications);

  // サイドバーの未処理件数バッジ（どのタブに作業が溜まっているか一目で分かる）。
  const badgeCounts = useMemo(() => {
    const t0 = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
    const ords = liveOrders.orders || [];
    const overdue = ords.filter((o: any) => isOverdueRentalOrder(o)).length; // 未納品・回収済みを除外した共通判定(M15)
    const reports = (fieldReports || []).filter((r: any) => !["対応済", "完了"].includes(String(r.status || ""))).length
      + ords.filter((o: any) => (o.itemIssues?.length || 0) > 0 && !isClosedOrder(o.status)).length;
    // 車検残日数は inspectionDate から再計算（保存値は古くなり、車検切れ車両をバッジが取りこぼす。C25）。
    const vehOverdue = (vehicles || []).filter((v: any) => {
      const d = v.inspectionDate ? Math.round((new Date(String(v.inspectionDate).replace(/\//g, "-") + "T00:00:00").getTime() - t0) / 86400000) : Number(v.inspectionDaysRemaining ?? 999);
      return d < 0;
    }).length;
    return { collection: overdue, field_report: reports, vehicles: vehOverdue } as Partial<Record<AdminTab, number>>;
  }, [liveOrders.orders, fieldReports, vehicles]);
  // 通知 → 該当タブへ遷移できるようにする（クリックで業務画面に直行）。
  const NOTIF_TAB: Record<string, AdminTab> = {
    "admin-new-orders": "orders",
    "admin-inspection": "collection",
    "admin-overdue": "collection",
    "admin-field-reports": "field_report",
    "admin-maintenance": "maintenance",
  };

  const tabTitles: Record<AdminTab, { title: string; sub: string }> = {
    dashboard: { title: "概要", sub: "ダッシュボード" },
    calendar: { title: "カレンダー", sub: "配車・返却・メンテナンス予定" },
    products: { title: "商品管理", sub: "保安品マスターカタログ" },
    warehouse: { title: "倉庫管理", sub: "保管場所・棚・ラックの稼働状況" },
    vehicles: { title: "車庫管理", sub: "車両の稼働状況・車検・メンテナンス" },
    inventory: { title: "棚卸", sub: "在庫の差異照合とカウント調整" },
    incoming: { title: "入庫管理", sub: "購入・返却戻し・調整入庫の登録" },
    outgoing: { title: "出庫管理", sub: "レンタル出荷・販売出荷の登録" },
    orders: { title: "受注・レンタル", sub: "レンタル注文の受付・配送手配・稼働管理" },
    sales: { title: "販売受注", sub: "販売注文の受付・出庫準備・完了管理" },
    invoices: { title: "請求管理", sub: "レンタル・販売の請求書発行と月次集計" },
    collection: { title: "回収・返却", sub: "一部返却・一括返却・検品履歴の確認" },
    repair: { title: "修理・保証管理", sub: "破損した保安品の修理手配とメーカー保証追跡" },
    maintenance: { title: "メンテナンス管理", sub: "機械・機器の定期保守点検スケジュール" },
    field_report: { title: "現場報告", sub: "現場から報告された不足・破損の処理" },
    users: { title: "社員・ユーザ管理", sub: "管理システムを利用する社内ユーザの管理" },
    customers: { title: "顧客管理", sub: "取引先企業および現場情報の管理" },
    suppliers: { title: "仕入先管理", sub: "保安品の仕入先および買掛金の管理" },
    repairers: { title: "修理業者管理", sub: "提携修理工場および外注費用の管理" },
    settings: { title: "システム設定・データ連携", sub: "消費税・通知ルールおよびデータ同期管理" },
    security_goods: { title: "保安品管理", sub: "保安品マスターデータの詳細" },
    audit: { title: "操作ログ", sub: "だれが・いつ・なにを変更したかの記録（90日保持）" },
  };

  const activeMeta = tabTitles[activeTab] || { title: "管理コンソール", sub: "ASAHI LEASE" };

  return (
    <div className="admin-shell bg-[#eff8f7] min-h-screen text-[#173b38] flex font-body">
      {/* Sidebar Layout */}
      <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} allowedTabs={allowedTabs} badgeCounts={badgeCounts} />

      {/* Main Content */}
      <div className="flex-1 ml-[236px] flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-[#fffdf6]/95 backdrop-blur border-b border-[#cfe6e3] px-5 py-3 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#e8f6f5] border border-[#b5dad6] text-[#1e8c86] flex items-center justify-center">
              <span className="material-symbols-outlined text-[21px]">space_dashboard</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-[#173b38] tracking-tight leading-tight">{activeMeta.title}</h1>
              <p className="text-xs text-[#46706c] font-semibold mt-0.5 truncate">{activeMeta.sub}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#b5dad6] bg-[#e8f6f5] px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-[#27ae60]" />
              <span className="text-xs font-black text-[#1e8c86]">{liveOrders.live ? "実データ" : "接続確認中"}</span>
            </div>
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="w-10 h-10 rounded-lg border border-[#cfe6e3] bg-white hover:bg-[#fff8e7] flex items-center justify-center cursor-pointer relative transition-colors">
                <span className="material-symbols-outlined text-[#46706c]">notifications</span>
                {notificationCount > 0 && (
                  <div className="absolute top-2 right-2 min-w-4 h-4 px-1 bg-[#ef6c4a] rounded-full border-2 border-white text-white text-[9px] font-bold flex items-center justify-center">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </div>
                )}
              </button>
              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <div className="absolute right-0 top-12 z-50 w-[340px] rounded-xl border border-[#cfe6e3] bg-white p-4 shadow-xl">
                    <div className="mb-3 flex items-center justify-between border-b border-[#e3f1ef] pb-2">
                      <div className="text-sm font-black text-[#173b38]">実データ通知{notificationCount > 0 ? `（未読 ${notificationCount}）` : ""}</div>
                      {notificationCount > 0 && (
                        <button onClick={() => markRead(notifications)} className="text-[11px] font-bold text-[#1e8c86] hover:underline">すべて既読</button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="py-5 text-center text-sm font-bold text-slate-400">現在の通知はありません</div>
                      ) : notifications.map((item) => {
                        const read = isRead(item);
                        const target = NOTIF_TAB[item.id];
                        return (
                          <button
                            key={item.id}
                            onClick={() => { markRead([item]); if (target) setActiveTab(target); setShowNotifications(false); }}
                            className={`relative w-full text-left rounded-lg border px-3 py-2 ${notificationToneClass(item.tone)} ${read ? "opacity-50" : ""} ${target ? "hover:brightness-95 cursor-pointer" : ""}`}
                          >
                            {!read && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#ef6c4a]" />}
                            <div className="text-xs font-black pr-3">{item.title}</div>
                            <div className="mt-0.5 text-[11px] font-semibold text-slate-600">{item.body}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-4 xl:p-5 pb-16 admin-scrollbar">
          <div className="max-w-[1440px] mx-auto">
            {activeTab === "dashboard" && <AdminDashboardHome onNavigate={(t) => setActiveTab(t as AdminTab)} />}
            {activeTab === "calendar" && <AdminCalendar />}
            {activeTab === "products" && <AdminProductManagement />}
            {activeTab === "warehouse" && <AdminWarehouse />}
            {activeTab === "vehicles" && <AdminVehicles />}
            {activeTab === "inventory" && <AdminStocktake />}
            {activeTab === "incoming" && <AdminStockIn />}
            {activeTab === "outgoing" && <AdminStockOut />}
            {activeTab === "orders" && <AdminRental />}
            {activeTab === "sales" && <AdminSales />}
            {activeTab === "invoices" && <AdminInvoices />}
            {activeTab === "collection" && <AdminRecovery />}
            {activeTab === "repair" && <AdminRepairWarranty />}
            {activeTab === "maintenance" && <AdminMaintenance />}
            {activeTab === "field_report" && <AdminFieldReportManagement />}
            {activeTab === "users" && <AdminUserManagement />}
            {activeTab === "customers" && <AdminCustomerManagement />}
            {activeTab === "suppliers" && <AdminSuppliers />}
            {activeTab === "repairers" && <AdminVendors />}
            {activeTab === "settings" && <AdminSettings />}
            {activeTab === "audit" && <AdminAuditLog />}

            {activeTab === "security_goods" && (
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center text-slate-500 flex flex-col items-center h-[60vh] justify-center">
                <span className="material-symbols-outlined text-[48px] text-slate-300 mb-4">
                  shield
                </span>
                <h2 className="text-xl font-bold text-slate-700">保安品管理</h2>
                <p className="mt-2 text-sm">
                  詳細な保安品マスターデータは「商品管理」タブよりご確認いただけます。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* コマンドパレット(#13): ⌘K で開く画面ジャンプ。許可タブのみ表示し setActiveTab で遷移。 */}
      <AdminCommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        allowedTabs={allowedTabs}
        onNavigate={setActiveTab}
      />

      {/* Global Toast notifications handler */}
      <ToastHost />
    </div>
  );
}
