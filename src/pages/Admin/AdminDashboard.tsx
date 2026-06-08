import React, { useState } from "react";
import AdminSidebar, { AdminTab } from "../../components/AdminSidebar";
import AdminDashboardHome from "../../components/AdminDashboardHome";
import AdminProductManagement from "../../components/AdminProductManagement";
import AdminUserManagement from "../../components/AdminUserManagement";
import AdminCustomerManagement from "../../components/AdminCustomerManagement";
import AdminFieldReportManagement from "../../components/AdminFieldReportManagement";
import { ToastHost } from "../../components/AdminUI";

// New Admin components
import AdminCalendar from "./AdminCalendar";
import AdminWarehouse from "./AdminWarehouse";
import AdminVehicles from "./AdminVehicles";
import AdminStocktake from "./AdminStocktake";
import AdminStockIn from "./AdminStockIn";
import AdminStockOut from "./AdminStockOut";
import AdminRental from "./AdminRental";
import AdminSales from "./AdminSales";
import AdminRecovery from "./AdminRecovery";
import AdminRepairWarranty from "./AdminRepairWarranty";
import AdminMaintenance from "./AdminMaintenance";
import AdminSuppliers from "./AdminSuppliers";
import AdminVendors from "./AdminVendors";
import AdminSettings from "./AdminSettings";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");

  const tabTitles: Record<AdminTab, { title: string; sub: string }> = {
    dashboard: { title: "概要", sub: "ダッシュボード" },
    calendar: { title: "カレンダー", sub: "配車・返却・メンテナンス予定" },
    products: { title: "商品管理", sub: "保安品マスターカタログ" },
    warehouse: { title: "倉庫管理", sub: "保管場所・棚・ラックの稼働状況" },
    vehicles: { title: "車庫管理", sub: "車両の稼働状況・車検・メンテナンス" },
    inventory: { title: "棚卸", sub: "在庫の差異照合とカウント調整" },
    incoming: { title: "入庫履歴", sub: "仕入・返却に伴う受入履歴" },
    outgoing: { title: "出庫履歴", sub: "出荷・レンタルに伴う払出履歴" },
    orders: { title: "レンタル管理", sub: "稼働中のレンタル契約および関連伝票" },
    sales: { title: "販売管理", sub: "製品販売契約および請求伝票" },
    collection: { title: "回収・返却管理", sub: "回収手配と返却確認" },
    repair: { title: "修理・保証管理", sub: "破損した保安品の修理手配とメーカー保証追跡" },
    maintenance: { title: "メンテナンス管理", sub: "機械・機器の定期保守点検スケジュール" },
    field_report: { title: "現場報告", sub: "現場から報告された不足・破損の処理" },
    users: { title: "社員・ユーザ管理", sub: "管理システムを利用する社内ユーザの管理" },
    customers: { title: "顧客管理", sub: "取引先企業および現場情報の管理" },
    suppliers: { title: "仕入先管理", sub: "保安品の仕入先および買掛金の管理" },
    repairers: { title: "修理業者管理", sub: "提携修理工場および外注費用の管理" },
    settings: { title: "システム設定・データ連携", sub: "消費税・通知ルールおよびデータ同期管理" },
    security_goods: { title: "保安品管理", sub: "保安品マスターデータの詳細" },
  };

  const activeMeta = tabTitles[activeTab] || { title: "管理コンソール", sub: "ASAHI LEASE" };

  return (
    <div className="bg-slate-100 min-h-screen text-slate-900 flex">
      {/* Sidebar Layout */}
      <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content */}
      <div className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{activeMeta.title}</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">{activeMeta.sub}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="検索（顧客、伝票、保安品…）"
                className="pl-9 pr-4 py-2 bg-slate-100 border-transparent rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500/20 outline-none"
              />
            </div>
            <div className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer relative">
              <span className="material-symbols-outlined text-slate-600">notifications</span>
              <div className="absolute top-2 right-2 w-4 h-4 bg-red-500 rounded-full border-2 border-white text-white text-[9px] font-bold flex items-center justify-center">
                3
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-20">
          <div className="max-w-6xl mx-auto">
            {activeTab === "dashboard" && <AdminDashboardHome />}
            {activeTab === "calendar" && <AdminCalendar />}
            {activeTab === "products" && <AdminProductManagement />}
            {activeTab === "warehouse" && <AdminWarehouse />}
            {activeTab === "vehicles" && <AdminVehicles />}
            {activeTab === "inventory" && <AdminStocktake />}
            {activeTab === "incoming" && <AdminStockIn />}
            {activeTab === "outgoing" && <AdminStockOut />}
            {activeTab === "orders" && <AdminRental />}
            {activeTab === "sales" && <AdminSales />}
            {activeTab === "collection" && <AdminRecovery />}
            {activeTab === "repair" && <AdminRepairWarranty />}
            {activeTab === "maintenance" && <AdminMaintenance />}
            {activeTab === "field_report" && <AdminFieldReportManagement />}
            {activeTab === "users" && <AdminUserManagement />}
            {activeTab === "customers" && <AdminCustomerManagement />}
            {activeTab === "suppliers" && <AdminSuppliers />}
            {activeTab === "repairers" && <AdminVendors />}
            {activeTab === "settings" && <AdminSettings />}

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

      {/* Global Toast notifications handler */}
      <ToastHost />
    </div>
  );
}
