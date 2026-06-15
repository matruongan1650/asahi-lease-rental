import React, { useState } from "react";
import { useOrders, Order } from "../context/OrderContext";
import { useUser } from "../context/UserContext";
import { CartItem } from "../context/CartContext";
import { useAdminCollection } from "../context/AdminDataContext";
import OrderBus from "../lib/orderBus";
import { triggerToast } from "./AdminUI";
import {
  Search,
  Camera,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  X,
  Save,
  Package,
  MinusCircle,
  FileText,
  Truck,
  Store,
} from "lucide-react";
import { isFullyReturned } from "../utils/orderStatus";

type WalkinReturnRecord = {
  id?: string;
  orderId?: string;
  firestoreId?: string;
  orderNumber?: string;
  source?: string;
  returningEverything?: boolean;
};

function hasPhotoValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

function firstPhotoUrl(value: unknown): string {
  if (Array.isArray(value)) {
    const first = value.find(Boolean);
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in first) {
      return String((first as { url?: unknown }).url || "");
    }
    return "";
  }
  return typeof value === "string" ? value : "";
}

function getMatchingWalkinReturn(order: Order, walkinReturns: WalkinReturnRecord[]) {
  return walkinReturns.find((w) => {
    if (!w) return false;
    return (
      w.orderId === order.id ||
      w.orderId === order.firestoreId ||
      w.firestoreId === order.firestoreId ||
      (!!w.orderNumber && w.orderNumber === order.orderNumber)
    );
  });
}

function getRecoveryModeInfo(order: Order, walkinReturns: WalkinReturnRecord[]) {
  const walkin = getMatchingWalkinReturn(order, walkinReturns);
  const status = String(order.status || "");
  const staffStatus = String(order.staffStatus || "");
  const isPartial =
    order.returnRequestType === "partial" ||
    status === "一部返却" ||
    String(order.orderNumber || "").includes("-R-");
  const isFull =
    order.returnRequestType === "full" ||
    ["返却済", "返却済み", "完了"].includes(status);

  if (walkin?.source === "customer_direct_return") {
    return {
      label: `直接持込・${walkin.returningEverything ? "一括返却" : "一部返却"}`,
      icon: Store,
      className: "bg-purple-50 text-purple-700",
    };
  }

  if (walkin?.source === "field_recovery") {
    return {
      label: `現場回収・${walkin.returningEverything === false ? "一部返却" : "一括返却"}`,
      icon: Truck,
      className: "bg-blue-50 text-blue-700",
    };
  }

  if (isPartial) {
    return {
      label: "一部返却",
      icon: Store,
      className: "bg-amber-50 text-amber-700",
    };
  }

  if (isFull) {
    return {
      label: "一括返却",
      icon: Truck,
      className: "bg-emerald-50 text-emerald-700",
    };
  }

  if (
    hasPhotoValue(order.collectionPhotos) ||
    !!order.collectionSignature ||
    staffStatus.includes("回収") ||
    ["回収予定", "回収中", "回収完了"].includes(status)
  ) {
    return {
      label: "現場回収",
      icon: Truck,
      className: "bg-blue-50 text-blue-700",
    };
  }

  if (
    hasPhotoValue(order.warehousePhotos) ||
    !!order.warehouseSignature ||
    order.inspectedByWarehouse ||
    status === "検品待ち"
  ) {
    return {
      label: status === "検品待ち" ? "持込・検品待ち" : "倉庫検品",
      icon: Store,
      className: "bg-slate-100 text-slate-700",
    };
  }

  return {
    label: "未指定",
    icon: Store,
    className: "bg-slate-100 text-slate-500",
  };
}

export default function AdminFieldReportManagement() {
  const { profile } = useUser();
  const { orders, updateOrder } = useOrders();
  const [activeTab, setActiveTab] = useState<"pending" | "completed">(
    "pending",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // New states for incidents integration
  const { rows: fieldReports } = useAdminCollection("fieldReports");
  const { rows: vendors } = useAdminCollection("vendors");
  const { rows: walkinReturns } = useAdminCollection("walkinReturns");
  
  const [mainTab, setMainTab] = useState<"verification" | "incidents">("verification");
  const [incidentTab, setIncidentTab] = useState<"all" | "pending" | "processing" | "completed">("pending");
  const [incidentQuery, setIncidentQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  
  // Repair form states
  const [selectedVendor, setSelectedVendor] = useState("");
  const [repairNotes, setRepairNotes] = useState("");
  const [isWarranty, setIsWarranty] = useState(true);

  const filteredReports = (fieldReports || []).filter((fr: any) => {
    if (incidentTab === "pending" && fr.status !== "未対応") return false;
    if (incidentTab === "processing" && fr.status !== "対応中") return false;
    if (incidentTab === "completed" && fr.status !== "対応済") return false;

    if (incidentQuery) {
      const q = incidentQuery.toLowerCase();
      const matchId = (fr.id || "").toLowerCase().includes(q);
      const matchRep = (fr.reporter || "").toLowerCase().includes(q);
      const matchCust = (fr.customer || "").toLowerCase().includes(q);
      const matchSite = (fr.site || "").toLowerCase().includes(q);
      const matchAsset = (fr.asset || "").toLowerCase().includes(q);
      const matchRef = (fr.ref || "").toLowerCase().includes(q);
      return matchId || matchRep || matchCust || matchSite || matchAsset || matchRef;
    }
    return true;
  });

  const handleSelectReport = (report: any) => {
    setSelectedReport(report);
    setSelectedVendor("");
    setIsWarranty(true);
    
    const notes = (report.entries || [])
      .map((e: any) => `${e.reason}: ${e.qty}個${e.note ? ` (${e.note})` : ""}`)
      .join("\n");
    setRepairNotes(notes);
  };

  const handleMarkProcessed = (reportId: string) => {
    OrderBus.patch("fieldReports", reportId, { status: "対応済" });
    triggerToast("現場報告を対応済みに更新しました", "ok");
    setSelectedReport(null);
  };

  const handleRequestRepair = (report: any) => {
    if (!selectedVendor) {
      triggerToast("修理業者を選択してください", "err");
      return;
    }
    const repairId = "RP-" + String(Date.now()).slice(-4) + Math.floor(Math.random() * 10);
    const today = new Date().toLocaleDateString("ja-JP");
    
    OrderBus.push("repairs", {
      id: repairId,
      asset: report.asset,
      vendor: selectedVendor,
      // 業者は確定したが金額未確定 → 見積中（金額入力後に「修理中」へ遷移）
      status: "見積中",
      req: today,
      cost: null,
      warranty: isWarranty,
      issue: repairNotes || "現場報告からの修理依頼",
      // ★ 現場報告に逆リンク: 修理完了時に報告も自動で「対応済」に更新するため
      sourceReportId: report.id,
    });

    OrderBus.patch("fieldReports", report.id, {
      status: "対応中",
      linkedRepair: repairId
    });

    triggerToast(`修理依頼 ${repairId} を作成しました`, "ok");
    setSelectedReport(null);
  };

  // Filter for rent orders
  const rentOrders = orders.filter((o) =>
    o.items?.some((i) => i.type === "rent"),
  );

  const pendingOrders = rentOrders.filter(
    (o) => !isFullyReturned(o.status) && o.status !== "新規",
  );
  const completedOrders = rentOrders.filter((o) => isFullyReturned(o.status));

  const filteredOrders = (
    activeTab === "pending" ? pendingOrders : completedOrders
  ).filter(
    (o) =>
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.siteName?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const [issueState, setIssueState] = useState<
    Record<
      string,
      { missing: number; broken: number; ok: number; note: string }
    >
  >({});

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);

    // Initialize issue state for rent items
    const initialIssues: Record<
      string,
      { missing: number; broken: number; ok: number; note: string }
    > = {};
    order.items
      ?.filter((i) => i.type === "rent")
      .forEach((item) => {
        // If the order already has saved issues
        const savedIssues =
          order.itemIssues?.filter((iss) => iss.itemId === item.id) || [];
        const m = savedIssues.find((s) => s.type === "missing")?.quantity || 0;
        const b = savedIssues.find((s) => s.type === "broken")?.quantity || 0;
        initialIssues[item.id] = {
          missing: m,
          broken: b,
          ok: item.quantity - m - b,
          note: savedIssues[0]?.notes || "",
        };
      });
    setIssueState(initialIssues);
  };

  const handleUpdateIssue = (
    itemId: string,
    field: "missing" | "broken" | "ok",
    val: number,
  ) => {
    const maxQty =
      selectedOrder?.items?.find((i) => i.id === itemId)?.quantity || 0;

    setIssueState((prev) => {
      const current = prev[itemId];
      let { missing, broken, ok } = current;

      if (field === "missing") missing = val;
      if (field === "broken") broken = val;
      if (field === "ok") ok = val;

      // Auto-balance if it exceeds max
      if (missing + broken + ok > maxQty) {
        if (field === "missing") {
          broken = 0;
          ok = maxQty - missing;
        } else if (field === "broken") {
          missing = 0;
          ok = maxQty - broken;
        } else {
          missing = 0;
          broken = maxQty - ok;
        }
      } else if (missing + broken + ok < maxQty) {
        // Auto-fill the rest into OK if we edited missing/broken
        if (field !== "ok") {
          ok = maxQty - missing - broken;
        }
      }

      // Ensure no negative values
      missing = Math.max(0, missing);
      broken = Math.max(0, broken);
      ok = Math.max(0, maxQty - missing - broken);

      return {
        ...prev,
        [itemId]: { ...current, missing, broken, ok },
      };
    });
  };

  const submitReport = async () => {
    if (!selectedOrder) return;

    const formattedIssues: NonNullable<Order["itemIssues"]> = [];

    Object.entries(issueState).forEach(([itemId, state]) => {
      if (state.missing > 0) {
        formattedIssues.push({
          itemId,
          type: "missing",
          quantity: state.missing,
          notes: state.note,
        });
      }
      if (state.broken > 0) {
        formattedIssues.push({
          itemId,
          type: "broken",
          quantity: state.broken,
          notes: state.note,
        });
      }
    });

    await updateOrder(selectedOrder.id, {
      status: "返却済",
      itemIssues: formattedIssues.length > 0 ? formattedIssues : undefined,
    });

    setSelectedOrder(null);
  };

  // Inspect View
  if (selectedOrder) {
    const rentItems = selectedOrder.items?.filter((i) => i.type === "rent") || [];
    const recoveryMode = getRecoveryModeInfo(selectedOrder, walkinReturns || []);
    const RecoveryIcon = recoveryMode.icon;
    const collectionPhotoUrl = firstPhotoUrl(selectedOrder.collectionPhotos);
    const warehousePhotoUrl = firstPhotoUrl(selectedOrder.warehousePhotos);

    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="relative">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-6 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => setSelectedOrder(null)}
                      className="p-1.5 bg-white rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <X size={18} className="text-slate-500" />
                    </button>
                    <span className="bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5">
                      <FileText size={14} />
                      現場報告 (Field Report)
                    </span>
                    <span className="text-slate-400 font-medium text-sm">
                      {selectedOrder.orderNumber}
                    </span>
                  </div>
                  <h1 className="text-2xl font-extrabold text-slate-800">
                    {selectedOrder.siteName || "持ち込み返却"}
                  </h1>
                  <p className="text-slate-500 mt-1 font-medium flex items-center gap-2">
                    <Store size={16} />
                    {selectedOrder.companyName} • {selectedOrder.personName}
                  </p>
                  <p className="text-sm font-bold text-slate-600 mt-3 pt-3 border-t border-slate-200 inline-flex items-center gap-2">
                    <span className="text-slate-400">
                      検品担当者（回収・倉庫）:
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                      {profile?.lastName} {profile?.firstName}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${recoveryMode.className}`}>
                      <RecoveryIcon size={13} />
                      {recoveryMode.label}
                    </span>
                  </p>
                </div>
                <button
                  onClick={submitReport}
                  className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Save size={18} />
                  報告を完了する
                </button>
              </div>
            </div>

            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">
                担当者からの報告 (Staff Reports)
              </h2>
              <div className="grid grid-cols-2 gap-6 mb-8">
                {/* Collection Report */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3">
                    <Truck size={16} className="text-blue-500" />
                    現場回収担当
                  </h3>
                  {selectedOrder.collectionSignature || collectionPhotoUrl ? (
                    <div className="space-y-4">
                      {collectionPhotoUrl && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-1">現場写真</p>
                          <img src={collectionPhotoUrl} alt="Collection" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                        </div>
                      )}
                      {selectedOrder.collectionSignature && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-1">顧客サイン</p>
                          <img src={selectedOrder.collectionSignature} alt="Signature" className="h-16 bg-white border border-slate-200 rounded-lg w-full" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 font-medium py-4 text-center">報告データなし</div>
                  )}
                </div>

                {/* Warehouse Report */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3">
                    <Package size={16} className="text-purple-500" />
                    倉庫検品担当
                  </h3>
                  {selectedOrder.warehouseSignature || warehousePhotoUrl ? (
                    <div className="space-y-4">
                      {warehousePhotoUrl && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-1">検品写真</p>
                          <img src={warehousePhotoUrl} alt="Warehouse Check" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                        </div>
                      )}
                      {selectedOrder.warehouseSignature && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-1">担当者サイン</p>
                          <img src={selectedOrder.warehouseSignature} alt="Signature" className="h-16 bg-white border border-slate-200 rounded-lg w-full" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 font-medium py-4 text-center">報告データなし</div>
                  )}
                </div>
              </div>

              <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">
                返却品目の確認
              </h2>

              <div className="space-y-6">
                {rentItems.map((item) => {
                  const state = issueState[item.id] || {
                    missing: 0,
                    broken: 0,
                    ok: item.quantity,
                    note: "",
                  };
                  const hasIssue = state.missing > 0 || state.broken > 0;

                  return (
                    <div
                      key={item.id}
                      className={`border rounded-xl p-5 transition-colors ${
                        hasIssue
                          ? "border-amber-200 bg-amber-50/30"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-16 h-16 object-cover rounded-lg border border-slate-200 bg-white"
                          />
                          <div>
                            <h3 className="font-bold text-slate-800">
                              {item.name}
                            </h3>
                            <p className="text-sm text-slate-500 mt-0.5 font-medium">
                              {item.category || "レンタル品"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-400 block mb-1">
                            貸出数量
                          </span>
                          <span className="text-xl font-extrabold text-slate-800 font-mono">
                            {item.quantity}
                          </span>
                        </div>
                      </div>

                      {/* State Inputs */}
                      <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                        {/* OK */}
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <label className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 mb-2">
                            <CheckCircle size={14} /> 正規 (OK)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={state.ok}
                            onChange={(e) =>
                              handleUpdateIssue(
                                item.id,
                                "ok",
                                parseInt(e.target.value) || 0,
                              )
                            }
                            className="w-full bg-white border border-slate-200 rounded-md py-1.5 px-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>

                        {/* Broken */}
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <label className="text-xs font-bold text-amber-600 flex items-center gap-1.5 mb-2">
                            <AlertTriangle size={14} /> 破損 (Broken)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={state.broken}
                            onChange={(e) =>
                              handleUpdateIssue(
                                item.id,
                                "broken",
                                parseInt(e.target.value) || 0,
                              )
                            }
                            className="w-full bg-white border border-slate-200 rounded-md py-1.5 px-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                          />
                        </div>

                        {/* Missing */}
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <label className="text-xs font-bold text-red-600 flex items-center gap-1.5 mb-2">
                            <MinusCircle size={14} /> 紛失 (Missing)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={state.missing}
                            onChange={(e) =>
                              handleUpdateIssue(
                                item.id,
                                "missing",
                                parseInt(e.target.value) || 0,
                              )
                            }
                            className="w-full bg-white border border-slate-200 rounded-md py-1.5 px-3 text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* Optional Note & Photo if there's an issue */}
                      {hasIssue && (
                        <div className="mt-4 pt-4 border-t border-amber-100/50 flex gap-4">
                          <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 mb-1.5 block">
                              備考 / 状態の詳細 (Notes)
                            </label>
                            <input
                              type="text"
                              value={state.note}
                              onChange={(e) =>
                                setIssueState((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    note: e.target.value,
                                  },
                                }))
                              }
                              placeholder="例：右側の持ち手が欠損..."
                              className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 mb-1.5 block">
                              証拠写真 (Photo)
                            </label>
                            <button className="h-[38px] px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-lg text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors">
                              <Camera size={16} />
                              撮影 / 添付
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Main Tab Switcher */}
      <div className="flex border-b border-slate-200 mb-6 bg-white p-1 rounded-xl shadow-sm">
        <button
          onClick={() => setMainTab("verification")}
          className={`flex-1 py-2.5 px-6 font-bold text-sm border-b-2 transition-all rounded-lg ${
            mainTab === "verification"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 shadow-sm"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          返却検品・紛失破損照合
        </button>
        <button
          onClick={() => setMainTab("incidents")}
          className={`flex-1 py-2.5 px-6 font-bold text-sm border-b-2 transition-all rounded-lg ${
            mainTab === "incidents"
              ? "border-blue-600 text-blue-600 bg-blue-50/50 shadow-sm"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          現場トラブル報告 (ドライバー・棚卸報告)
        </button>
      </div>

      {mainTab === "verification" ? (
        <div className="space-y-6">
          <div className="flex gap-4 items-center mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-slate-400" />
              </div>
              <input
                type="text"
                className="w-64 pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm font-medium"
                placeholder="伝票番号、現場名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="bg-white rounded-lg p-1 shadow-sm border border-slate-200 flex ml-auto">
              <button
                onClick={() => setActiveTab("pending")}
                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${
                  activeTab === "pending"
                    ? "bg-slate-100 text-slate-800"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                未報告
              </button>
              <button
                onClick={() => setActiveTab("completed")}
                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${
                  activeTab === "completed"
                    ? "bg-slate-100 text-slate-800"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                報告済
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50/50">
              <FileText size={18} className="text-slate-500" />
              <h2 className="font-bold text-slate-800">
                {activeTab === "pending" ? "現場報告待ち一覧" : "現場報告済み一覧"}
              </h2>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {filteredOrders.length}件
              </span>
            </div>

            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="p-4 font-bold text-xs">伝票番号 / 日付</th>
                  <th className="p-4 font-bold text-xs">顧客 / 現場名</th>
                  <th className="p-4 font-bold text-xs w-44">回収形態</th>
                  <th className="p-4 font-bold text-xs text-right pr-6">
                    アクション
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((o) => {
                  const recoveryMode = getRecoveryModeInfo(o, walkinReturns || []);
                  const RecoveryIcon = recoveryMode.icon;
                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => handleSelectOrder(o)}
                    >
                      <td className="p-4">
                        <p className="font-bold text-blue-700 font-mono">
                          {o.orderNumber || o.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 font-mono">
                          {o.date}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-slate-900">{o.companyName}</p>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                          {o.siteName || "持ち込み"}
                        </p>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${recoveryMode.className}`}>
                          <RecoveryIcon size={12} />
                          {recoveryMode.label}
                        </span>
                      </td>
                      <td className="p-4 text-right pr-6">
                        {activeTab === "pending" ? (
                          <button className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors group-hover:border-blue-300 group-hover:text-blue-700 inline-flex items-center gap-2">
                            <FileText size={16} />
                            報告する
                          </button>
                        ) : (
                          <button className="px-4 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors inline-flex items-center gap-2">
                            <CheckCircle size={16} className="text-emerald-500" />
                            確認済
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-8 text-center text-slate-500 font-medium"
                    >
                      {activeTab === "pending"
                        ? "未報告のデータはありません。"
                        : "報告済みのデータはありません。"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex gap-4 items-center mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-slate-400" />
              </div>
              <input
                type="text"
                className="w-64 pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm font-medium"
                placeholder="報告者、現場名、品名で検索..."
                value={incidentQuery}
                onChange={(e) => setIncidentQuery(e.target.value)}
              />
            </div>

            <div className="bg-white rounded-lg p-1 shadow-sm border border-slate-200 flex ml-auto">
              {(["all", "pending", "processing", "completed"] as const).map((t) => {
                const label = {
                  all: "すべて",
                  pending: "未対応",
                  processing: "対応中",
                  completed: "対応済",
                }[t];
                return (
                  <button
                    key={t}
                    onClick={() => setIncidentTab(t)}
                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                      incidentTab === t
                        ? "bg-slate-100 text-slate-800"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50/50">
              <AlertTriangle size={18} className="text-slate-500" />
              <h2 className="font-bold text-slate-800">
                現場・倉庫トラブル報告一覧
              </h2>
              <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full font-mono">
                {filteredReports.length} 件
              </span>
            </div>

            <table className="w-full text-left bg-white">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="p-4 font-bold text-xs">報告ID / 日時</th>
                  <th className="p-4 font-bold text-xs">ソース / 参照</th>
                  <th className="p-4 font-bold text-xs">報告者</th>
                  <th className="p-4 font-bold text-xs">顧客 / 現場</th>
                  <th className="p-4 font-bold text-xs">対象保安品</th>
                  <th className="p-4 font-bold text-xs w-28">状態</th>
                  <th className="p-4 font-bold text-xs text-right pr-6">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReports.map((fr: any) => {
                  let statusBadge = "";
                  if (fr.status === "未対応") {
                    statusBadge = "bg-red-50 text-red-700 border border-red-100";
                  } else if (fr.status === "対応中") {
                    statusBadge = "bg-blue-50 text-blue-700 border border-blue-100";
                  } else {
                    statusBadge = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                  }

                  return (
                    <tr
                      key={fr.id}
                      className="hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => handleSelectReport(fr)}
                    >
                      <td className="p-4">
                        <p className="font-bold text-slate-700 font-mono text-xs">{fr.id}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{fr.date}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-xs font-bold text-slate-600">{fr.source}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{fr.ref}</p>
                      </td>
                      <td className="p-4 font-bold text-xs text-slate-700">{fr.reporter}</td>
                      <td className="p-4">
                        <p className="text-xs font-bold text-slate-800">{fr.customer}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{fr.site || "—"}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-xs font-bold text-slate-800">{fr.asset}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">QR: {fr.qr || "—"}</p>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-extrabold ${statusBadge}`}>
                          {fr.status}
                        </span>
                      </td>
                      <td className="p-4 text-right pr-6">
                        <button className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded text-xs font-bold shadow-sm hover:bg-slate-50 transition-colors group-hover:border-blue-300 group-hover:text-blue-700">
                          詳細
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-medium text-xs">
                      該当するトラブル報告はありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* selectedReport Drawer/Modal Overlay */}
      {selectedReport && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-[500px] bg-white h-full shadow-2xl flex flex-col animate-[drawerIn_0.3s_ease-out]">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <span className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wide">
                  現場トラブル報告
                </span>
                <h3 className="text-lg font-bold text-slate-800 mt-1">{selectedReport.id}</h3>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <p className="text-slate-400 font-medium text-xs">報告日</p>
                  <p className="text-slate-800 font-bold font-mono mt-0.5">{selectedReport.date}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium text-xs">報告元 (ソース)</p>
                  <p className="text-slate-800 font-bold mt-0.5">{selectedReport.source} ({selectedReport.ref})</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium text-xs">報告者</p>
                  <p className="text-slate-800 font-bold mt-0.5">{selectedReport.reporter}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium text-xs">対象顧客</p>
                  <p className="text-slate-800 font-bold mt-0.5">{selectedReport.customer}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-400 font-medium text-xs">施工現場</p>
                  <p className="text-slate-800 font-bold mt-0.5">{selectedReport.site || "—"}</p>
                </div>
              </div>

              {/* Asset Info */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">対象保安品</h4>
                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                    <Package size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{selectedReport.asset}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">QR: {selectedReport.qr || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Issue Entries */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">報告内容 (トラブル詳細)</h4>
                <div className="space-y-3">
                  {selectedReport.entries?.map((entry: any, index: number) => (
                    <div key={index} className="border border-slate-100 bg-amber-50/20 rounded-xl p-4 flex gap-3 items-start">
                      <div className="mt-0.5 text-amber-500">
                        <AlertTriangle size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-800">{entry.reason}</span>
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded font-mono">
                            {entry.qty} 個
                          </span>
                        </div>
                        {entry.note && (
                          <p className="text-xs text-slate-600 mt-1.5 bg-white p-2.5 rounded border border-slate-100 font-medium">
                            {entry.note}
                          </p>
                        )}
                        {/* スタッフが現場で撮影した実画像 */}
                        {Array.isArray(entry.photoUrls) && entry.photoUrls.length > 0 ? (
                          <div className="grid grid-cols-4 gap-1.5 mt-2">
                            {entry.photoUrls.map((url: string, pi: number) => (
                              <img
                                key={pi}
                                src={url}
                                alt={`証拠写真 ${pi + 1}`}
                                className="aspect-square w-full rounded-lg object-cover border border-slate-200 cursor-zoom-in"
                                onClick={() => window.open(url, "_blank")}
                              />
                            ))}
                          </div>
                        ) : (entry.photos > 0 ? (
                          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                            <Camera size={12} /> 写真 {entry.photos} 枚（画像データなし）
                          </p>
                        ) : null)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Area */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">報告の処理・ステータス更新</h4>
                
                {selectedReport.status === "未対応" && (
                  <div className="space-y-4">
                    <button
                      onClick={() => handleMarkProcessed(selectedReport.id)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={16} />
                      対応済みにする
                    </button>

                    <div className="border-t border-slate-100 pt-4 space-y-3.5">
                      <p className="text-xs font-bold text-slate-500">外注修理・メンテナンスの手配</p>
                      
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">提携修理業者 (Vendors)</label>
                        <select
                          value={selectedVendor}
                          onChange={(e) => setSelectedVendor(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium"
                        >
                          <option value="">-- 業者を選択 --</option>
                          {vendors.map((v: any) => (
                            <option key={v.id} value={v.name}>{v.name} ({v.cat})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-400 block mb-1">不具合・修理指示内容 (Issue notes)</label>
                        <textarea
                          value={repairNotes}
                          onChange={(e) => setRepairNotes(e.target.value)}
                          rows={3}
                          className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium resize-none"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="warranty_chk"
                          checked={isWarranty}
                          onChange={(e) => setIsWarranty(e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                        />
                        <label htmlFor="warranty_chk" className="text-xs font-bold text-slate-600 cursor-pointer">
                          メーカー保証を適用する (Warranty)
                        </label>
                      </div>

                      <button
                        onClick={() => handleRequestRepair(selectedReport)}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[16px]">build</span>
                        修理を依頼する
                      </button>
                    </div>
                  </div>
                )}

                {selectedReport.status === "対応中" && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                      <span className="material-symbols-outlined text-[18px]">build</span>
                      外注修理中
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      この報告は修理依頼 <span className="font-mono font-bold text-slate-800">{selectedReport.linkedRepair}</span> に関連付けられて修理手配中です。
                    </p>
                    <button
                      onClick={() => handleMarkProcessed(selectedReport.id)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors"
                    >
                      修理完了・対応済みにする
                    </button>
                  </div>
                )}

                {selectedReport.status === "対応済" && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-2.5 items-start">
                    <div className="text-emerald-600 mt-0.5">
                      <CheckCircle size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-800">処理完了</p>
                      <p className="text-xs text-emerald-600 mt-0.5 font-medium">
                        このトラブル報告に対する処理（検品調整または修理手配）は完了しています。
                  </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
