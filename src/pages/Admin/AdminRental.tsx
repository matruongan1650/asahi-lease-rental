import React, { useState, useMemo } from "react";
import {
  Panel,
  Btn,
  Toolbar,
  Table,
  Badge,
  KPI,
  Tabs,
  triggerToast
} from "../../components/AdminUI";
import AdminDocDrawer from "../../components/AdminDocDrawer";
import DocumentViewer from "../../components/DocumentViewer";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";
import { useAdminOrders } from "../../context/AdminDataContext";
import B2BInvoiceViewer from "../../components/B2BInvoiceViewer";
import AdminRentalInvoiceSection from "../../components/AdminRentalInvoiceSection";
import { getOrGenerateInvoiceBlocks } from "../../utils/billing";

export default function AdminRental() {
  const [tab, setTab] = useState("contract");
  const [drawer, setDrawer] = useState<{ kind: "rental-contract" | "rental-invoice" | "rental-delivery" | null; customer?: string } | null>(null);
  const [viewingDoc, setViewingDoc] = useState<"納品書" | "請求書" | "回収書" | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [viewingOrderDrawer, setViewingOrderDrawer] = useState<any>(null);
  const [viewingBlockId, setViewingBlockId] = useState<string | null>(null);
  const [showInvoiceSelector, setShowInvoiceSelector] = useState(false);
  
  // B2B Aggregation states
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [b2bOpen, setB2bOpen] = useState(false);
  const [b2bType, setB2bType] = useState<"summary" | "detailed">("summary");

  const liveOrders = useAdminOrders();

  const getTodayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Rental search & filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  // 既定は「全期間」: 返却済み・一部返却など過去の注文日の取引も含めて表示する。
  // （注文日付での絞り込みは 本日 / 今月 / 注文日（開始/終了）で行える）
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  // Dynamically compute unique statuses and companies for the filter dropdowns from liveOrders.rentals
  const rentalStatuses = useMemo(() => {
    const statuses = new Set<string>();
    liveOrders.rentals.forEach((r: any) => {
      if (r.status) statuses.add(r.status);
    });
    return Array.from(statuses);
  }, [liveOrders.rentals]);

  const rentalCompanies = useMemo(() => {
    const companies = new Set<string>();
    liveOrders.rentals.forEach((r: any) => {
      if (r.customer) companies.add(r.customer);
    });
    return Array.from(companies);
  }, [liveOrders.rentals]);

  // Apply filters to liveOrders.rentals
  const filteredRentals = useMemo(() => {
    return liveOrders.rentals.filter((r: any) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const idMatch = (r.id || "").toLowerCase().includes(query);
        const custMatch = (r.customer || "").toLowerCase().includes(query);
        const siteMatch = (r.site || "").toLowerCase().includes(query);
        if (!idMatch && !custMatch && !siteMatch) return false;
      }
      // 2. Status Filter
      if (statusFilter && r.status !== statusFilter) return false;
      // 3. Company Filter
      if (companyFilter && r.customer !== companyFilter) return false;
      // 4. 注文日付で絞り込み（注文日の年月日で比較）
      if (startDateFilter || endDateFilter) {
        if (!r.date) return false;
        // r.date 例: "2026/6/9 • 10:00"（ゼロ埋めされていない）。
        // input[type=date] は "2026-06-09"（ゼロ埋め）なので、比較前に ISO へ正規化する。
        const datePart = (r.date.split(" • ")[0] || "").trim();
        const m = datePart.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
        if (!m) return false;
        const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
        if (startDateFilter && iso < startDateFilter) return false;
        if (endDateFilter && iso > endDateFilter) return false;
      }
      return true;
    });
  }, [liveOrders.rentals, searchQuery, statusFilter, companyFilter, startDateFilter, endDateFilter]);

  const uniqueCompanies = useMemo(() => {
    const list = liveOrders.orders
      .map((o: any) => o.companyName)
      .filter(Boolean)
      .map((c: string) => c.trim());
    return Array.from(new Set(list)) as string[];
  }, [liveOrders.orders]);

  const uniqueMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    liveOrders.orders.forEach((o: any) => {
      const blocks = getOrGenerateInvoiceBlocks(o);
      blocks.forEach((b) => monthsSet.add(b.monthPeriod));
    });
    return Array.from(monthsSet).sort().reverse(); // Show newest first
  }, [liveOrders.orders]);

  const cols = [
    {
      h: "契約番号 / 注文日時",
      cell: (r: any) => (
        <div>
          <div className="font-mono text-blue-700 font-bold">{r.id}</div>
          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{r.date || "—"}</div>
        </div>
      )
    },
    {
      h: "顧客 / 現場",
      wrap: true,
      cell: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.customer}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{r.site}</div>
        </div>
      )
    },
    {
      h: "期間",
      cell: (r: any) => <span className="font-mono text-slate-500 text-xs">{r.start}〜{r.end}</span>
    },
    {
      h: "品目",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono text-slate-700 font-semibold">{r.items}</span>
    },
    {
      h: "金額",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono font-bold text-slate-800">¥{(r.amount || 0).toLocaleString()}</span>
    },
    {
      h: "状態",
      cell: (r: any) => (
        <Badge tone={r.status === "処理中" ? "warning" : "default"}>
          {r.status}
        </Badge>
      )
    },
    {
      h: "アクション",
      align: "right" as const,
      cell: (r: any) => (
        <div className="inline-flex gap-1.5 items-center" onClick={e => e.stopPropagation()}>
          {r.status === "処理中" && (
            <button
              onClick={() => {
                liveOrders.patchOrder(r.firestoreId, { status: "確認済み", staffStatus: "配送予定" });
                triggerToast(`${r.id} を手配・スタッフに送信しました`, "ok");
              }}
              className="inline-flex items-center gap-1 h-[24px] px-2.5 rounded border border-blue-600 bg-blue-600 text-[10.5px] font-bold text-white shadow-sm hover:bg-blue-700 cursor-pointer active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-[14px]">send</span>
              手配する
            </button>
          )}
          <button
            onClick={() => {
              const fullOrder = liveOrders.orders.find((o: any) => o.firestoreId === r.firestoreId || o.id === r.firestoreId || o.orderNumber === r.id);
              if (fullOrder) {
                setSelectedOrder(fullOrder);
                setViewingDoc("納品書");
              } else triggerToast("データが見つかりません", "err");
            }}
            className="inline-flex items-center gap-1 h-[24px] px-2 rounded-sm border border-slate-200 bg-white hover:bg-slate-50 text-[10.5px] font-bold text-slate-500 cursor-pointer active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[12px]">local_shipping</span>
            納品書
          </button>
          <button
            onClick={() => {
              const fullOrder = liveOrders.orders.find((o: any) => o.firestoreId === r.firestoreId || o.id === r.firestoreId || o.orderNumber === r.id);
              if (fullOrder) {
                setSelectedOrder(fullOrder);
                const blocks = getOrGenerateInvoiceBlocks(fullOrder);
                if (blocks && blocks.length > 1) {
                  setShowInvoiceSelector(true);
                } else if (blocks && blocks.length === 1) {
                  setViewingBlockId(blocks[0].id);
                  setViewingDoc("請求書");
                } else {
                  setViewingDoc("請求書");
                }
              } else triggerToast("データが見つかりません", "err");
            }}
            className="inline-flex items-center gap-1 h-[24px] px-2 rounded-sm border border-slate-200 bg-white hover:bg-slate-50 text-[10.5px] font-bold text-slate-500 cursor-pointer active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[12px]">receipt</span>
            請求書
          </button>
          <button
            onClick={() => {
              const fullOrder = liveOrders.orders.find((o: any) => o.firestoreId === r.firestoreId || o.id === r.firestoreId || o.orderNumber === r.id);
              if (fullOrder) {
                setSelectedOrder(fullOrder);
                setViewingDoc("回収書");
              } else triggerToast("データが見つかりません", "err");
            }}
            className="inline-flex items-center gap-1 h-[24px] px-2 rounded-sm border border-slate-200 bg-white hover:bg-slate-50 text-[10.5px] font-bold text-slate-500 cursor-pointer active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[12px]">inventory_2</span>
            回収書
          </button>
        </div>
      )
    }
  ];

  const tabs = [
    { id: "contract", label: "レンタル契約" },
    { id: "invoice", label: "レンタル請求書" },
    { id: "delivery", label: "レンタル納品書" }
  ];

  const getNewKind = () => {
    if (tab === "invoice") return "rental-invoice";
    if (tab === "delivery") return "rental-delivery";
    return "rental-contract";
  };

  const newKind = getNewKind();
  const ctaText = tab === "invoice" ? "請求書を発行" : tab === "delivery" ? "納品書を作成" : "契約を作成";

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI
          label="進行中の契約"
          value={liveOrders.rentals.filter((r: any) => r.status === "進行中").length + " 件"}
          icon="autorenew"
          accent="var(--brand-accent)"
        />
        <KPI
          label="今月のレンタル売上"
          value={"¥" + (liveOrders.kpis.rentalSales || 0).toLocaleString()}
          icon="attach_money"
        />
        <KPI
          label="延滞"
          value={liveOrders.rentals.filter((r: any) => r.status === "延滞").length + " 件"}
          icon="error"
          accent="var(--color-danger)"
        />
        <KPI
          label="未請求"
          value="2 件"
          icon="mail"
          accent="var(--color-warning)"
        />
      </div>

      {/* Sub Tabs */}
      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(next) => {
          // Đổi tab thì đóng các modal/drawer còn mở để tránh chồng lên tab mới
          setViewingDoc(null);
          setShowInvoiceSelector(false);
          setB2bOpen(false);
          setViewingBlockId(null);
          setSearchQuery("");
          setStatusFilter("");
          setCompanyFilter("");
          setStartDateFilter(getTodayStr());
          setEndDateFilter(getTodayStr());
          setTab(next);
        }}
      />

      {/* B2B Aggregation Form (Only visible in Rental Invoice tab) */}
      {tab === "invoice" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex flex-col md:flex-row gap-4 items-end bg-gradient-to-r from-blue-50/20 to-indigo-50/20">
          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">対象企業 (B2B Client Company)</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 font-semibold text-sm cursor-pointer"
              >
                <option value="">-- 企業を選択 --</option>
                {uniqueCompanies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">対象請求月 (Billing Period)</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 font-mono text-sm cursor-pointer"
              >
                <option value="">-- 対象月を選択 --</option>
                {uniqueMonths.map((m) => (
                  <option key={m} value={m}>{m}分</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => {
                if (!selectedCompany || !selectedMonth) {
                  triggerToast("企業と対象月を選択してください", "warn");
                  return;
                }
                setB2bType("summary");
                setB2bOpen(true);
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              総合請求書を出力
            </button>
            <button
              onClick={() => {
                if (!selectedCompany || !selectedMonth) {
                  triggerToast("企業と対象月を選択してください", "warn");
                  return;
                }
                setB2bType("detailed");
                setB2bOpen(true);
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">list_alt</span>
              内訳請求書を出力
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      {tab === "invoice" ? (
        <AdminRentalInvoiceSection
          orders={liveOrders.orders}
          monthPeriod={selectedMonth || undefined}
          companyFilter={selectedCompany || undefined}
        />
      ) : (
        <Panel
          title={tabs.find(t => t.id === tab)?.label}
          icon="autorenew"
          sub={liveOrders.live ? "🟢 OrderBus" : undefined}
          action={
            <Btn
              size="sm"
              variant="primary"
              icon="add"
              onClick={() => setDrawer({ kind: newKind })}
            >
              {ctaText}
            </Btn>
          }
        >
          {/* Dynamic Filter bar */}
          {liveOrders.rentals.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">契約番号・顧客・現場名</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="契約番号や現場名で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 w-full bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">契約状態</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 py-2.5 outline-none focus:border-blue-500 font-semibold text-xs cursor-pointer"
                >
                  <option value="">すべて</option>
                  {rentalStatuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">取引先企業</label>
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 py-2.5 outline-none focus:border-blue-500 font-semibold text-xs cursor-pointer"
                >
                  <option value="">すべて</option>
                  {rentalCompanies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">注文日（開始）</label>
                <input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 font-mono text-xs cursor-pointer h-[38px]"
                />
                <div className="flex gap-1 mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStartDateFilter(getTodayStr());
                      setEndDateFilter(getTodayStr());
                    }}
                    className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors cursor-pointer border ${
                      startDateFilter === getTodayStr() && endDateFilter === getTodayStr()
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    本日
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      setStartDateFilter(`${y}-${m}-01`);
                      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
                      setEndDateFilter(`${y}-${m}-${lastDay}`);
                    }}
                    className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors cursor-pointer border ${
                      startDateFilter === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    今月
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDateFilter("");
                      setEndDateFilter("");
                    }}
                    className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors cursor-pointer border ${
                      !startDateFilter && !endDateFilter
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    全期間
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">注文日（終了）</label>
                <input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 font-mono text-xs cursor-pointer h-[38px]"
                />
              </div>
            </div>
          )}

          {/* Matches Counter & Clear Filter */}
          {filteredRentals.length !== liveOrders.rentals.length && (
            <div className="text-xs font-bold text-slate-500 mb-3 bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2 flex justify-between items-center">
              <span>絞り込み結果: {filteredRentals.length} 件 / 全体: {liveOrders.rentals.length} 件</span>
              <button 
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("");
                  setCompanyFilter("");
                  setStartDateFilter("");
                  setEndDateFilter("");
                }}
                className="text-blue-600 hover:text-blue-700 font-bold transition-colors cursor-pointer flex items-center gap-1 border-0 bg-transparent p-0"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
                フィルターをクリア
              </button>
            </div>
          )}

          <Table
            cols={cols}
            rows={filteredRentals}
            onRow={(r) => {
              const fullOrder = liveOrders.orders.find((o: any) => o.firestoreId === r.firestoreId || o.id === r.firestoreId || o.orderNumber === r.id);
              if (fullOrder) {
                setViewingOrderDrawer(fullOrder);
              } else {
                 triggerToast("詳細データが見つかりません", "err");
              }
            }}
          />
        </Panel>
      )}

      <AdminDocDrawer
        open={!!drawer}
        kind={drawer?.kind || null}
        presetCustomer={drawer?.customer}
        onClose={() => setDrawer(null)}
      />

      <AdminOrderDrawer
        open={!!viewingOrderDrawer}
        order={viewingOrderDrawer}
        onClose={() => setViewingOrderDrawer(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          liveOrders.patchOrder(id, { status, staffStatus });
          triggerToast("手配が完了しました", "ok");
        }}
        onUpdateOrder={(id, updates) => {
          liveOrders.patchOrder(id, updates);
          setViewingOrderDrawer(prev => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
        }}
      />

      {viewingDoc && selectedOrder && (
        <DocumentViewer
          order={selectedOrder}
          type={viewingDoc}
          blockId={viewingBlockId || undefined}
          onClose={() => {
            setViewingDoc(null);
            setViewingBlockId(null);
          }}
        />
      )}

      {/* Invoice Month Selector Modal */}
      {showInvoiceSelector && selectedOrder && (
        (() => {
          const blocks = getOrGenerateInvoiceBlocks(selectedOrder);
          return (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4">
              <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden p-5 animate-scaleIn text-sm">
                <h3 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-[20px]">request_quote</span>
                  対象月を選択してください
                </h3>
                <div className="flex flex-col gap-2">
                  {blocks.map((block) => (
                    <button
                      key={block.id}
                      onClick={() => {
                        setViewingBlockId(block.id);
                        setViewingDoc("請求書");
                        setShowInvoiceSelector(false);
                      }}
                      className="w-full text-left p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 font-bold text-xs flex justify-between items-center transition-colors cursor-pointer text-slate-700"
                    >
                      <span>{block.monthPeriod}分 請求書</span>
                      <span className="text-[10px] text-slate-400">({block.startDate} 〜 {block.endDate})</span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 my-2"></div>
                  <button
                    onClick={() => {
                      setViewingBlockId(null);
                      setViewingDoc("請求書");
                      setShowInvoiceSelector(false);
                    }}
                    className="w-full text-left p-3 rounded-xl border border-dashed border-slate-200 bg-white hover:bg-slate-50 font-bold text-xs text-slate-600 text-center transition-colors cursor-pointer"
                  >
                    全体合計の請求書を表示
                  </button>
                  <button
                    onClick={() => {
                      setShowInvoiceSelector(false);
                      setSelectedOrder(null);
                    }}
                    className="w-full text-center py-2.5 text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* B2B Aggregated Invoice Viewer Modal */}
      {b2bOpen && selectedCompany && selectedMonth && (
        <B2BInvoiceViewer
          companyName={selectedCompany}
          monthPeriod={selectedMonth}
          type={b2bType}
          orders={liveOrders.orders}
          onClose={() => setB2bOpen(false)}
        />
      )}
    </div>
  );
}
