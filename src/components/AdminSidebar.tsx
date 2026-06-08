import React from "react";

export type AdminTab =
  | "dashboard"
  | "orders"
  | "customers"
  | "users"
  | "products"
  | "vehicles"
  | "calendar"
  | "security_goods"
  | "warehouse"
  | "inventory"
  | "incoming"
  | "outgoing"
  | "sales"
  | "collection"
  | "repair"
  | "maintenance"
  | "field_report"
  | "suppliers"
  | "repairers"
  | "settings";

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
}

export default function AdminSidebar({
  activeTab,
  setActiveTab,
}: AdminSidebarProps) {
  const menuGroups = [
    {
      title: "業務",
      items: [
        { id: "dashboard", label: "概要", icon: "dashboard" },
        { id: "calendar", label: "カレンダー", icon: "calendar_today" },
      ],
    },
    {
      title: "資産・在庫",
      items: [
        { id: "products", label: "商品管理", icon: "inventory_2" },
        { id: "warehouse", label: "倉庫管理", icon: "warehouse" },
        { id: "vehicles", label: "車庫管理", icon: "directions_car" },
        { id: "inventory", label: "棚卸", icon: "checklist" },
      ],
    },
    {
      title: "取引",
      items: [
        { id: "incoming", label: "入庫", icon: "input" },
        { id: "outgoing", label: "出庫", icon: "output" },
        { id: "orders", label: "レンタル", icon: "sync" },
        { id: "sales", label: "販売", icon: "payments" },
        { id: "collection", label: "回収", icon: "inventory_2" },
      ],
    },
    {
      title: "保全",
      items: [
        { id: "repair", label: "修理・保証", icon: "build" },
        { id: "maintenance", label: "メンテナンス", icon: "engineering" },
        { id: "field_report", label: "現場報告", icon: "assignment", badge: 2 },
      ],
    },
    {
      title: "マスタ",
      items: [
        { id: "users", label: "Nhân sự & Đối tác", icon: "manage_accounts" },
        { id: "customers", label: "顧客", icon: "group" },
        { id: "suppliers", label: "仕入先", icon: "storefront" },
        { id: "repairers", label: "修理業者", icon: "handyman" },
      ],
    },
    {
      title: "システム",
      items: [{ id: "settings", label: "設定・権限", icon: "settings" }],
    },
  ];

  return (
    <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 overflow-y-auto">
      <div className="p-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-700 text-white rounded-lg flex items-center justify-center font-bold text-lg leading-none">
          C
        </div>
        <div>
          <h1 className="font-black text-slate-800 leading-tight">
            ASAHI LEASE
          </h1>
          <p className="text-[10px] text-slate-500 font-bold">管理コンソール</p>
        </div>
      </div>

      <div className="flex-1 py-4">
        {menuGroups.map((group, index) => (
          <div key={index} className="mb-6">
            <h3 className="px-6 text-xs font-bold text-slate-400 mb-2">
              {group.title}
            </h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveTab(item.id as AdminTab)}
                    className={`w-full flex items-center gap-3 px-6 py-2.5 text-sm transition-colors relative ${activeTab === item.id ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-600 hover:bg-slate-100 font-medium"}`}
                  >
                    {activeTab === item.id && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-md"></div>
                    )}
                    <span
                      className={`material-symbols-outlined text-[20px] ${activeTab === item.id ? "text-blue-600" : "text-slate-400"}`}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                    {item.badge && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-slate-200 mt-auto bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-700 text-white rounded-full flex items-center justify-center font-bold">
            佐
          </div>
          <div className="flex-1 overflow-hidden">
            <h4 className="font-bold text-sm text-slate-800 truncate">
              管理者 佐藤
            </h4>
            <p className="text-xs text-slate-500 truncate">倉庫マネージャー</p>
          </div>
          <button className="text-slate-400 hover:text-slate-700 transition-colors">
            <span className="material-symbols-outlined text-[20px]">
              logout
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
