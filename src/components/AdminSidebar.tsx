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
  | "invoices"
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

type SidebarItem = {
  id: AdminTab;
  label: string;
  icon: string;
  badge?: number;
};

export default function AdminSidebar({
  activeTab,
  setActiveTab,
}: AdminSidebarProps) {
  const menuGroups: { title: string; items: SidebarItem[] }[] = [
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
      title: "受注・入出庫",
      items: [
        { id: "incoming", label: "入庫管理", icon: "input" },
        { id: "outgoing", label: "出庫管理", icon: "output" },
        { id: "orders", label: "受注・レンタル", icon: "sync" },
        { id: "sales", label: "販売受注", icon: "payments" },
        { id: "invoices", label: "請求", icon: "receipt_long" },
        { id: "collection", label: "回収・返却", icon: "inventory_2" },
      ],
    },
    {
      title: "保全",
      // 業務フローの順序で配置:
      //   現場報告（事故・トラブルの入口）→ 修理依頼（外注処理）→ 定期点検（予防保全）
      items: [
        { id: "field_report", label: "現場報告", icon: "assignment" },
        { id: "repair", label: "修理依頼", icon: "build" },
        { id: "maintenance", label: "定期点検", icon: "engineering" },
      ],
    },
    {
      title: "マスタ",
      items: [
        { id: "users", label: "ユーザー・パートナー", icon: "manage_accounts" },
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
    <aside className="w-[236px] bg-[#f7fbfa] border-r border-[#cfe6e3] flex flex-col h-screen fixed left-0 top-0 overflow-y-auto admin-scrollbar">
      <div className="px-4 py-4 border-b border-[#cfe6e3] bg-[#fffdf6]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#173b38] text-[#ffd23f] rounded-lg flex items-center justify-center font-black text-lg leading-none shadow-[0_4px_18px_rgba(43,168,162,0.22)]">
            A
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-[#173b38] leading-tight tracking-tight">
              ASAHI LEASE
            </h1>
            <p className="text-[10px] text-[#46706c] font-bold tracking-[0.14em] uppercase">Admin</p>
          </div>
        </div>
      </div>

      <div className="flex-1 py-3 px-3">
        {menuGroups.map((group, index) => (
          <div key={index} className="mb-4">
            <h3 className="px-2.5 text-[10px] font-black text-[#7ca39f] mb-1.5 tracking-[0.12em] uppercase">
              {group.title}
            </h3>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-all relative rounded-lg ${
                      activeTab === item.id
                        ? "bg-[#fff8e7] text-[#173b38] font-black shadow-[0_4px_18px_rgba(43,168,162,0.12)] ring-1 ring-[#ffd23f]/70"
                        : "text-[#46706c] hover:bg-white hover:text-[#173b38] font-semibold"
                    }`}
                  >
                    {activeTab === item.id && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-[#2ba8a2] rounded-r-md"></div>
                    )}
                    <span
                      className={`material-symbols-outlined text-[19px] ${activeTab === item.id ? "text-[#1e8c86]" : "text-[#8fbcb7]"}`}
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
    </aside>
  );
}
