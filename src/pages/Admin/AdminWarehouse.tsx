import React, { useMemo, useState } from "react";
import {
  Badge,
  Btn,
  Drawer,
  Field,
  KPI,
  Modal,
  Panel,
  Row,
  SelectInput,
  Table,
  Tabs,
  TextInput,
  Toolbar,
  triggerToast
} from "../../components/AdminUI";
import { useAdminCollection, useAdminData } from "../../context/AdminDataContext";
import { useVehicles, type VehicleDetail } from "../../context/VehicleContext";
import { daysUntil } from "../../context/MobileLiveContext";
import { useUser } from "../../context/UserContext";
import OrderBus from "../../lib/orderBus";
import { getCategoryIcon, getSupplyCategories, isVehicleCategory } from "../../utils/productUtils";
import { settleReturnStock, deductOrderStock } from "../../utils/stockLedger";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";

type WarehouseTab = "overview" | "supplies" | "vehicles" | "alerts";
type StockFilter = "all" | "available" | "low" | "empty" | "rented";
type VehicleFilter = "all" | "空車" | "使用中" | "整備中" | "inspection";
type SupplyActionKind = "stockIn" | "stockOut" | "move" | "reorder";

type SupplyRow = {
  id: string;
  name: string;
  category: string;
  image?: string;
  loc: string;
  zone: string;
  total: number;
  rented: number;
  available: number;
  utilization: number;
  status: "正常" | "高稼働" | "要補充" | "在庫なし";
};

const CLOSED_ORDER_STATUSES = ["完了", "キャンセル", "返却済", "返却済み"];
const DEFAULT_SUPPLY_CATEGORIES = [
  "カラーコーン",
  "コーンバー",
  "バリケード",
  "工事灯",
  "矢印板",
  "工事看板",
  "ウェイト",
  "フェンス",
  "照明",
  "電動機器",
  "その他"
];

function zoneForCategory(category: string) {
  if (["カラーコーン", "コーンバー", "ウェイト"].some((x) => category.includes(x))) return "Aゾーン";
  if (["バリケード", "フェンス", "マット"].some((x) => category.includes(x))) return "Bゾーン";
  if (["工事灯", "矢印板", "看板", "回転灯"].some((x) => category.includes(x))) return "Cゾーン";
  if (["発電機", "照明", "電動機器", "ガス"].some((x) => category.includes(x))) return "Dゾーン";
  return "Sゾーン";
}

function locationForProduct(product: any) {
  if (product?.location) return String(product.location);
  const zone = zoneForCategory(product?.category || "その他").replace("ゾーン", "");
  const n = String(product?.id || "").match(/\d+/)?.[0] || "1";
  return `${zone}-${n.padStart(2, "0")}`;
}

function stockStatus(total: number, rented: number, available: number): SupplyRow["status"] {
  if (total <= 0 || available <= 0) return "在庫なし";
  const utilization = total > 0 ? Math.round((rented / total) * 100) : 0;
  if (available <= 3) return "要補充";
  if (utilization >= 80) return "高稼働";
  return "正常";
}

// 在庫モデル = 台帳（products.stock = 現物在庫）。受注確定で在庫を減算し、倉庫最終検品で戻す。
// したがって「貸出中（rented）」= 出庫済み（stockDeducted）かつ未返却（未入庫）の注文を数える。
// これにより 保有総数 = 現物在庫(onHand) + 貸出中(rented) が受注確定〜返却の全段階で不変になる。
function isOutOnRental(order: any) {
  const status = String(order?.status || "");
  if (CLOSED_ORDER_STATUSES.includes(status)) return false; // 返却済・完了・キャンセル
  if (order?.stockRestored) return false;                   // 既に入庫済み（返却確定）
  if (order?.staffStatus === "完了") return false;
  if (order?.stockDeducted) return true;                    // 出庫済み・未返却 = 貸出中
  // 旧データ（stockDeducted 導入前）フォールバック: 納品済みを貸出中とみなす。
  return Boolean(order?.deliveryConfirmedAt)
    || order?.staffStatus === "配送完了"
    || ["レンタル中", "回収中", "検品待ち", "回収完了", "検品完了", "一部返却"].includes(status);
}

function formatDate(value: unknown) {
  return value ? String(value) : "—";
}

function formatDateTime() {
  // JST(UTC+9)で記録（+9h シフトして ISO 化）。toISOString() は UTC のため早朝 JST の入出庫が
  // 前日付・9時間ずれで記録されるのを防ぐ。
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/");
}

function formatDateSlash(date = new Date()) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function vehicleStatusColor(status: VehicleDetail["status"]): VehicleDetail["statusColor"] {
  if (status === "使用中") return "emerald";
  if (status === "整備中") return "orange";
  return "blue";
}

export default function AdminWarehouse() {
  const { raw: orders } = useAdminData();
  const { rows: products } = useAdminCollection("products");
  const { vehicles, updateVehicle } = useVehicles();
  const { currentUser } = useUser();
  // 担当者の既定値はログイン中の利用者「姓 名」（なければ email）。
  const loginName = currentUser ? (`${currentUser.lastName || ""} ${currentUser.firstName || ""}`.trim() || currentUser.email || "") : "";

  const [tab, setTab] = useState<WarehouseTab>("overview");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState<SupplyRow | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleDetail | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [supplyAction, setSupplyAction] = useState<{ kind: SupplyActionKind; supply: SupplyRow } | null>(null);
  const [supplySearch, setSupplySearch] = useState("");
  const [supplyCategory, setSupplyCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>("all");

  const [newName, setNewName] = useState("");
  const [newLoc, setNewLoc] = useState("");
  const [newTotal, setNewTotal] = useState(100);
  const [newCat, setNewCat] = useState("カラーコーン");
  const [actionQty, setActionQty] = useState(1);
  const [actionLocation, setActionLocation] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionStaff, setActionStaff] = useState(loginName || "佐藤");
  const [savingAction, setSavingAction] = useState(false);

  const activeOrdersByProduct = useMemo(() => {
    const map: Record<string, any[]> = {};
    (orders || []).forEach((order: any) => {
      if (!isOutOnRental(order)) return;
      (order.items || []).forEach((item: any) => {
        if (item?.type !== "rent") return;
        const qty = Math.max(0, Number(item.quantity || 0) - Number(item.returnedQuantity || 0));
        if (qty <= 0) return;
        const id = String(item.id || item.productId || "");
        if (!id) return;
        if (!map[id]) map[id] = [];
        map[id].push({ ...order, activeQty: qty, itemName: item.name });
      });
    });
    return map;
  }, [orders]);

  const rentedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(activeOrdersByProduct).forEach(([productId, productOrders]) => {
      counts[productId] = productOrders.reduce((sum, order) => sum + Number(order.activeQty || 0), 0);
    });
    return counts;
  }, [activeOrdersByProduct]);

  const supplyRows: SupplyRow[] = useMemo(() => {
    return (products || [])
      // 車両連動商品(P-<id>, vehicleId 付き)は保安用品から除外（在庫の二重計上防止）。
      .filter((p: any) => p && !p.vehicleId && !isVehicleCategory(p.category))
      .map((p: any) => {
        const onHand = Number(p.stock || 0);            // 現物在庫（出庫で減算・返却で加算済み）
        const rented = Number(rentedCounts[p.id] || 0); // 現在貸出中（出庫済み・未返却）
        const available = onHand;                        // 貸出可能 = 現物在庫
        const total = onHand + rented;                   // 保有総数 = 現物 + 貸出中
        const category = p.category || "その他";
        const utilization = total > 0 ? Math.round((rented / total) * 100) : 0;
        return {
          id: String(p.id || ""),
          name: p.name || "名称未設定",
          category,
          image: p.image,
          loc: locationForProduct(p),
          zone: zoneForCategory(category),
          total,
          rented,
          available,
          utilization,
          status: stockStatus(total, rented, available)
        };
      })
      .sort((a, b) => {
        const priority: Record<SupplyRow["status"], number> = { "在庫なし": 0, "要補充": 1, "高稼働": 2, "正常": 3 };
        return priority[a.status] - priority[b.status] || a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name);
      });
  }, [products, rentedCounts]);

  const supplyCategoryOptions = useMemo(() => {
    return Array.from(new Set([...DEFAULT_SUPPLY_CATEGORIES, ...getSupplyCategories(products)]));
  }, [products]);

  const filteredSupplies = useMemo(() => {
    const q = supplySearch.trim().toLowerCase();
    return supplyRows.filter((r) => {
      const matchesSearch =
        !q ||
        [r.id, r.name, r.category, r.loc, r.zone].some((v) => String(v || "").toLowerCase().includes(q));
      const matchesCategory = supplyCategory === "all" || r.category === supplyCategory;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "available" && r.available > 3) ||
        (stockFilter === "low" && r.available > 0 && r.available <= 3) ||
        (stockFilter === "empty" && r.available <= 0) ||
        (stockFilter === "rented" && r.rented > 0);
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [supplyRows, supplySearch, supplyCategory, stockFilter]);

  // 車検残日数は保存値ではなく inspectionDate から毎回再計算（経過で車検切れになった車両も拾う。AdminVehicles と同方針）。
  const vehiclesLive = useMemo(
    () => (vehicles || []).map((v: any) => ({ ...v, inspectionDaysRemaining: daysUntil(v.inspectionDate) ?? v.inspectionDaysRemaining })),
    [vehicles],
  );

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    return vehiclesLive.filter((v) => {
      const matchesSearch =
        !q ||
        [v.id, v.name, v.plate, v.category, v.manufacturer].some((value) =>
          String(value || "").toLowerCase().includes(q)
        );
      const matchesStatus =
        vehicleFilter === "all" ||
        (vehicleFilter === "inspection" && Number(v.inspectionDaysRemaining ?? 999) <= 30) ||
        v.status === vehicleFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vehiclesLive, vehicleSearch, vehicleFilter]);

  const stats = useMemo(() => {
    const totalSupply = supplyRows.reduce((sum, r) => sum + r.total, 0);
    const rentedSupply = supplyRows.reduce((sum, r) => sum + r.rented, 0);
    const availableSupply = supplyRows.reduce((sum, r) => sum + r.available, 0);
    const lowStock = supplyRows.filter((r) => r.status === "要補充" || r.status === "在庫なし");
    const vehicleInUse = vehiclesLive.filter((v) => v.status === "使用中").length;
    const vehicleIdle = vehiclesLive.filter((v) => v.status === "空車").length;
    const vehicleMaint = vehiclesLive.filter((v) => v.status === "整備中").length;
    const vehicleAlerts = vehiclesLive.filter((v) => v.status === "整備中" || Number(v.inspectionDaysRemaining ?? 999) <= 30 || (v.alerts || []).length > 0);
    return {
      totalSupply,
      rentedSupply,
      availableSupply,
      lowStock,
      vehicleInUse,
      vehicleIdle,
      vehicleMaint,
      vehicleAlerts,
      alertCount: lowStock.length + vehicleAlerts.length
    };
  }, [supplyRows, vehiclesLive]);

  const categorySummary = useMemo(() => {
    const map = new Map<string, { category: string; total: number; rented: number; available: number; count: number }>();
    supplyRows.forEach((r) => {
      const item = map.get(r.category) || { category: r.category, total: 0, rented: 0, available: 0, count: 0 };
      item.total += r.total;
      item.rented += r.rented;
      item.available += r.available;
      item.count += 1;
      map.set(r.category, item);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [supplyRows]);

  const zoneSummary = useMemo(() => {
    const map = new Map<string, { zone: string; total: number; rented: number; available: number; count: number }>();
    supplyRows.forEach((r) => {
      const item = map.get(r.zone) || { zone: r.zone, total: 0, rented: 0, available: 0, count: 0 };
      item.total += r.total;
      item.rented += r.rented;
      item.available += r.available;
      item.count += 1;
      map.set(r.zone, item);
    });
    return Array.from(map.values()).sort((a, b) => a.zone.localeCompare(b.zone));
  }, [supplyRows]);

  const vehicleSummary = useMemo(() => {
    const map = new Map<string, { category: string; total: number; idle: number; inUse: number; maint: number }>();
    vehicles.forEach((v) => {
      const item = map.get(v.category) || { category: v.category, total: 0, idle: 0, inUse: 0, maint: 0 };
      item.total += 1;
      if (v.status === "空車") item.idle += 1;
      if (v.status === "使用中") item.inUse += 1;
      if (v.status === "整備中") item.maint += 1;
      map.set(v.category, item);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [vehicles]);

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      triggerToast("品名を入力してください", "warn");
      return;
    }
    if (!newLoc.trim()) {
      triggerToast("棚番を入力してください", "warn");
      return;
    }

    // 一意な商品ID。4桁ランダムは既存の P-1000..9999 と衝突し、OrderBus.push が重複IDを追加して
    // 既存商品（在庫込み）を静かに破壊する。既存と重ならない高エントロピーIDにする。
    const existingIds = new Set((products || []).map((p: any) => String(p?.id || "")));
    let newId = "";
    do { newId = "P-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6); } while (existingIds.has(newId));
    OrderBus.push("products", {
      id: newId,
      name: newName.trim(),
      category: newCat,
      stock: Number(newTotal) || 0,
      location: newLoc.trim(),
      image: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=400",
      rentPrice: 1000,
      buyPrice: 5000
    });

    triggerToast(`品目 ${newName} を倉庫に登録しました`, "ok");
    setIsAddModalOpen(false);
    setNewName("");
    setNewLoc("");
    setNewTotal(100);
    setNewCat("カラーコーン");
  };

  const productForSupply = (supply: SupplyRow) => products.find((p: any) => String(p?.id || "") === supply.id);

  const openSupplyAction = (kind: SupplyActionKind, supply: SupplyRow) => {
    setSupplyAction({ kind, supply });
    setSavingAction(false);
    // 補充の既定値は「目標(10)までの不足分」。元の Math.max(10, …) は減算を常に打ち消し実質定数10だった。
    setActionQty(kind === "reorder" ? Math.max(1, 10 - supply.available) : 1);
    setActionLocation(supply.loc);
    setActionReason("");
  };

  const patchSelectedSupply = (updates: Partial<SupplyRow>) => {
    setSelectedSupply((prev) => prev ? { ...prev, ...updates } : prev);
  };

  const handleSaveSupplyAction = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!supplyAction) return;
    if (savingAction) return; // 二重送信ガード
    const { kind, supply } = supplyAction;
    const qty = Number(actionQty || 0);
    const product = productForSupply(supply);
    if (!product) {
      triggerToast("対象品目が見つかりません", "err");
      return;
    }

    // 書き込み直前に最新在庫を再読込する。レンダー時の product.stock は古く、別端末の入出庫や
    // 受注確定の在庫減算を、スナップショット基準の絶対値で上書きしてしまう（ロストアップデート）ため。
    const freshProduct = OrderBus.getAll<any>("products").find((p: any) => String(p?.id || "") === supply.id) || product;
    const currentStock = Number(freshProduct.stock || 0); // 現物在庫（最新）
    const available = currentStock;                   // 貸出可能 = 現物在庫（台帳モデル）
    const date = formatDateTime();

    if (kind !== "move" && qty <= 0) {
      triggerToast("数量は1以上にしてください", "warn");
      return;
    }

    if (kind === "stockIn") {
      const nextStock = currentStock + qty;
      OrderBus.patch("products", supply.id, { stock: nextStock });
      OrderBus.push("stockIn", {
        id: "IN-" + String(Date.now()).slice(-7) + "-" + String(Math.floor(100 + Math.random() * 900)),
        item: supply.name,
        productId: supply.id,
        qty,
        date,
        src: actionReason || "倉庫管理から入庫",
        type: "倉庫入庫",
        staff: actionStaff
      });
      patchSelectedSupply({ total: nextStock + supply.rented, available: nextStock, status: stockStatus(nextStock + supply.rented, supply.rented, nextStock) });
      triggerToast(`${supply.name} を ${qty} 点入庫しました`, "ok");
    }

    if (kind === "stockOut") {
      if (qty > available) {
        triggerToast(`倉庫在庫が不足しています（利用可能: ${available}点）`, "warn");
        return;
      }
      const nextStock = Math.max(0, currentStock - qty);
      OrderBus.patch("products", supply.id, { stock: nextStock });
      OrderBus.push("stockOut", {
        id: "OUT-" + String(Date.now()).slice(-7) + "-" + String(Math.floor(100 + Math.random() * 900)),
        item: supply.name,
        productId: supply.id,
        qty,
        date,
        dst: actionReason || "倉庫管理から出庫",
        type: "倉庫出庫",
        staff: actionStaff
      });
      patchSelectedSupply({ total: nextStock + supply.rented, available: nextStock, status: stockStatus(nextStock + supply.rented, supply.rented, nextStock) });
      triggerToast(`${supply.name} を ${qty} 点出庫しました`, "ok");
    }

    if (kind === "move") {
      if (!actionLocation.trim()) {
        triggerToast("移動先の棚番を入力してください", "warn");
        return;
      }
      OrderBus.patch("products", supply.id, { location: actionLocation.trim() });
      OrderBus.push("stockMoves", {
        id: "MOVE-" + Math.floor(1000 + Math.random() * 9000),
        productId: supply.id,
        item: supply.name,
        qty: supply.available,
        date,
        from: supply.loc,
        to: actionLocation.trim(),
        type: "棚移動",
        note: actionReason,
        staff: actionStaff
      });
      patchSelectedSupply({ loc: actionLocation.trim() });
      triggerToast(`${supply.name} を ${actionLocation.trim()} へ移動しました`, "ok");
    }

    if (kind === "reorder") {
      // 同一商品の未処理（予定）補充手配が既にあれば二重登録しない。
      const dup = (OrderBus.getAll<any>("stockMoves") || []).find(
        (m: any) => m && m.productId === supply.id && m.type === "補充手配" && m.status === "予定",
      );
      if (dup) {
        triggerToast(`${supply.name} の補充手配は既に予定済みです`, "warn");
        setSupplyAction(null);
        return;
      }
      OrderBus.push("stockMoves", {
        id: "REQ-" + Date.now().toString().slice(-8) + "-" + Math.floor(100 + Math.random() * 900),
        productId: supply.id,
        item: supply.name,
        qty,
        date,
        location: supply.loc,
        type: "補充手配",
        status: "予定",
        note: actionReason || "在庫不足による補充手配",
        staff: actionStaff
      });
      triggerToast(`${supply.name} の補充を ${qty} 点手配しました`, "ok");
    }

    setSavingAction(true); // 保存完了。モーダルを閉じるまでボタンを無効化し二重送信を防ぐ
    setSupplyAction(null);
  };

  const openOrderFromSupply = (order: any) => {
    setSelectedSupply(null);
    setSelectedOrder(order);
  };

  const handleVehicleStatusChange = (status: VehicleDetail["status"]) => {
    if (!selectedVehicle) return;
    const updates = {
      status,
      statusColor: vehicleStatusColor(status),
      maintenanceDesc: status === "整備中" ? "倉庫管理から整備手配" : selectedVehicle.maintenanceDesc,
      maintenanceDate: status === "整備中" ? formatDateSlash() : selectedVehicle.maintenanceDate
    };
    updateVehicle(selectedVehicle.id, updates);
    setSelectedVehicle((prev) => prev ? { ...prev, ...updates } : prev);
    if (status === "整備中") {
      // 未消化の「予定」が既にあれば重複作成しない（整備中⇄空車トグルで予定が増殖するのを防ぐ。C22）。
      const dupe = OrderBus.getAll<any>("maintenance").some(
        (m: any) => m && m.status === "予定" && (m.plate === selectedVehicle.plate || m.name === selectedVehicle.name),
      );
      if (!dupe) {
        OrderBus.push("maintenance", {
          id: "MN-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
          name: selectedVehicle.name,
          plate: selectedVehicle.plate,
          cat: selectedVehicle.category,
          cycle: "臨時",
          last: formatDateSlash(),
          next: formatDateSlash(),
          days: 0,
          status: "予定"
        });
      }
    }
    triggerToast(`${selectedVehicle.plate} を ${status} に更新しました`, "ok");
  };

  const supplyCols = [
    {
      h: "保安用品",
      wrap: true,
      cell: (r: SupplyRow) => (
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="w-10 h-10 rounded-lg bg-[#e8f6f5] border border-[#cfe6e3] flex items-center justify-center text-[#1e8c86] overflow-hidden flex-shrink-0">
            {r.image ? (
              <img
                src={r.image}
                alt={r.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span className="material-symbols-outlined text-[20px]">{getCategoryIcon(r.category)}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-black text-slate-800 truncate">{r.name}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{r.category}</div>
          </div>
        </div>
      )
    },
    {
      h: "保管場所",
      cell: (r: SupplyRow) => (
        <div>
          <div className="font-mono text-slate-700 font-black">{r.loc}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{r.zone}</div>
        </div>
      )
    },
    { h: "総数", align: "right" as const, cell: (r: SupplyRow) => <span className="font-mono font-black">{r.total}</span> },
    { h: "貸出中", align: "right" as const, cell: (r: SupplyRow) => <span className="font-mono font-black text-[#1e8c86]">{r.rented}</span> },
    { h: "倉庫在庫", align: "right" as const, cell: (r: SupplyRow) => <span className="font-mono font-black text-slate-800">{r.available}</span> },
    {
      h: "稼働率",
      cell: (r: SupplyRow) => (
        <div className="flex items-center gap-2 min-w-[130px]">
          <div className="flex-1 h-2 rounded-full bg-[#e8f6f5] overflow-hidden">
            <div
              style={{
                width: `${Math.min(100, r.utilization)}%`,
                background: r.status === "在庫なし" ? "#ef6c4a" : r.status === "要補充" ? "#ffd23f" : "#2ba8a2"
              }}
              className="h-full rounded-full"
            />
          </div>
          <span className="font-mono font-black text-[11px] text-slate-400 w-9 text-right">{r.utilization}%</span>
        </div>
      )
    },
    { h: "状態", align: "center" as const, cell: (r: SupplyRow) => <Badge>{r.status}</Badge> }
  ];

  const vehicleCols = [
    {
      h: "保安車両",
      wrap: true,
      cell: (v: VehicleDetail) => (
        <div>
          <div className="font-black text-slate-800">{v.name}</div>
          <div className="font-mono text-[11px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-1">
            {v.plate}
          </div>
        </div>
      )
    },
    { h: "カテゴリー", cell: (v: VehicleDetail) => <span className="font-bold text-slate-600">{v.category}</span> },
    { h: "メーカー", cell: (v: VehicleDetail) => <span className="text-slate-500">{v.manufacturer || "—"}</span> },
    { h: "走行距離", align: "right" as const, cell: (v: VehicleDetail) => <span className="font-mono font-bold">{v.mileage || "—"}</span> },
    {
      h: "車検",
      cell: (v: VehicleDetail) => {
        const warn = Number(v.inspectionDaysRemaining ?? 999) <= 30;
        return (
          <div>
            <div className={`font-mono font-bold ${warn ? "text-[#d45233]" : "text-slate-700"}`}>
              {formatDate(v.inspectionDate)}
            </div>
            {warn && <div className="text-[10px] font-black text-[#d45233] mt-0.5">残り{v.inspectionDaysRemaining}日</div>}
          </div>
        );
      }
    },
    { h: "状態", align: "center" as const, cell: (v: VehicleDetail) => <Badge>{v.status}</Badge> }
  ];

  const tabs = [
    { id: "overview", label: "概要" },
    { id: "supplies", label: "保安用品" },
    { id: "vehicles", label: "保安車両" },
    { id: "alerts", label: "要対応" }
  ];

  const counts = {
    overview: supplyRows.length + vehicles.length,
    supplies: filteredSupplies.length,
    vehicles: filteredVehicles.length,
    alerts: stats.alertCount
  };

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as WarehouseTab)} counts={counts} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        <KPI label="保安用品 在庫" value={stats.availableSupply.toLocaleString()} icon="inventory_2" sub={`総数 ${stats.totalSupply.toLocaleString()} 点`} />
        <KPI label="保安用品 貸出中" value={stats.rentedSupply.toLocaleString()} icon="sync" accent="#5DADE2" />
        <KPI label="保安車両 空車" value={`${stats.vehicleIdle} / ${vehicles.length}`} icon="local_parking" accent="#27AE60" />
        <KPI label="要対応" value={`${stats.alertCount} 件`} icon="warning" accent="#EF6C4A" />
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Panel title="カテゴリ別 保安用品" icon="category" sub="在庫数・貸出数をカテゴリ単位で確認">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categorySummary.map((c) => {
                const pct = c.total > 0 ? Math.round((c.rented / c.total) * 100) : 0;
                return (
                  <button
                    key={c.category}
                    onClick={() => {
                      setSupplyCategory(c.category);
                      setTab("supplies");
                    }}
                    className="text-left rounded-lg border border-[#cfe6e3] bg-[#f7fbfa] p-3 hover:bg-[#fff8e7] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-white border border-[#cfe6e3] text-[#1e8c86] flex items-center justify-center material-symbols-outlined text-[18px]">
                        {getCategoryIcon(c.category)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-black text-sm text-slate-800 truncate">{c.category}</div>
                        <div className="text-[10px] font-bold text-slate-400">{c.count} 品目</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div className="font-mono text-xl font-black text-slate-800">{c.available}</div>
                      <div className="text-[10px] font-black text-slate-400">貸出 {c.rented} / {pct}%</div>
                    </div>
                    <div className="mt-2 h-2 bg-[#e8f6f5] rounded-full overflow-hidden">
                      <div className="h-full bg-[#2ba8a2] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
              {categorySummary.length === 0 && <div className="py-10 text-center text-sm font-semibold text-slate-400 md:col-span-2">保安用品データがありません</div>}
            </div>
          </Panel>

          <Panel title="倉庫ゾーン" icon="warehouse" sub="棚番をゾーン単位で集約">
            <div className="space-y-2.5">
              {zoneSummary.map((z) => (
                <button
                  key={z.zone}
                  onClick={() => {
                    setSupplySearch(z.zone);
                    setTab("supplies");
                  }}
                  className="w-full flex items-center gap-3 rounded-lg border border-[#cfe6e3] bg-white p-3 hover:bg-[#e8f6f5] cursor-pointer transition-colors text-left"
                >
                  <div className="w-11 h-11 rounded-lg bg-[#fff8e7] border border-[#eadfb6] flex items-center justify-center font-black text-[#6a5200]">
                    {z.zone.replace("ゾーン", "")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-sm text-slate-800">{z.zone}</div>
                    <div className="text-[10px] text-slate-400 font-bold">{z.count} 品目 ・ 倉庫在庫 {z.available}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-black text-slate-800">{z.total}</div>
                    <div className="text-[10px] text-slate-400 font-bold">総数</div>
                  </div>
                </button>
              ))}
              {zoneSummary.length === 0 && <div className="py-10 text-center text-sm font-semibold text-slate-400">ゾーンデータがありません</div>}
            </div>
          </Panel>

          <Panel title="保安車両 稼働" icon="directions_car" sub="車種ごとの空車・使用中・整備中">
            <div className="space-y-2.5">
              {vehicleSummary.map((v) => (
                <button
                  key={v.category}
                  onClick={() => {
                    setVehicleSearch(v.category);
                    setTab("vehicles");
                  }}
                  className="w-full rounded-lg border border-[#cfe6e3] bg-white p-3 text-left hover:bg-[#e8f6f5] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-sm text-slate-800">{v.category}</div>
                    <div className="font-mono font-black text-slate-800">{v.total} 台</div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-black">
                    <div className="rounded-md bg-[#e8f6f5] px-2 py-1.5 text-[#1e8c86]">使用中 {v.inUse}</div>
                    <div className="rounded-md bg-[#eff8f7] px-2 py-1.5 text-[#1f8f50]">空車 {v.idle}</div>
                    <div className="rounded-md bg-[#fff8e7] px-2 py-1.5 text-[#8a6a00]">整備 {v.maint}</div>
                  </div>
                </button>
              ))}
              {vehicleSummary.length === 0 && <div className="py-10 text-center text-sm font-semibold text-slate-400">保安車両データがありません</div>}
            </div>
          </Panel>
        </div>
      )}

      {tab === "supplies" && (
        <>
          <Toolbar
            right={
              <Btn icon="add" variant="primary" onClick={() => setIsAddModalOpen(true)}>
                品目を追加
              </Btn>
            }
          >
            <div className="relative w-full md:w-72">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#7ca39f] text-[18px]">search</span>
              <input
                value={supplySearch}
                onChange={(e) => setSupplySearch(e.target.value)}
                placeholder="品名・棚番・カテゴリで検索"
                className="w-full h-[36px] pl-9 pr-3 rounded-lg border border-[#b5dad6] bg-white text-sm font-semibold outline-none focus:border-[#2ba8a2]"
              />
            </div>
            <select
              value={supplyCategory}
              onChange={(e) => setSupplyCategory(e.target.value)}
              className="h-[36px] rounded-lg border border-[#b5dad6] bg-white px-3 text-sm font-bold text-[#46706c] outline-none"
            >
              <option value="all">すべてのカテゴリ</option>
              {supplyCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              className="h-[36px] rounded-lg border border-[#b5dad6] bg-white px-3 text-sm font-bold text-[#46706c] outline-none"
            >
              <option value="all">すべての状態</option>
              <option value="available">在庫あり</option>
              <option value="rented">貸出中あり</option>
              <option value="low">要補充</option>
              <option value="empty">在庫なし</option>
            </select>
          </Toolbar>
          <Panel title="保安用品 在庫一覧" icon="inventory_2" sub={`${filteredSupplies.length} 品目を表示`}>
            <Table cols={supplyCols} rows={filteredSupplies} onRow={setSelectedSupply} />
          </Panel>
        </>
      )}

      {tab === "vehicles" && (
        <>
          <Toolbar>
            <div className="relative w-full md:w-72">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#7ca39f] text-[18px]">search</span>
              <input
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="車両名・ナンバー・車種で検索"
                className="w-full h-[36px] pl-9 pr-3 rounded-lg border border-[#b5dad6] bg-white text-sm font-semibold outline-none focus:border-[#2ba8a2]"
              />
            </div>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value as VehicleFilter)}
              className="h-[36px] rounded-lg border border-[#b5dad6] bg-white px-3 text-sm font-bold text-[#46706c] outline-none"
            >
              <option value="all">すべての車両</option>
              <option value="空車">空車</option>
              <option value="使用中">使用中</option>
              <option value="整備中">整備中</option>
              <option value="inspection">車検30日以内</option>
            </select>
          </Toolbar>
          <Panel title="保安車両 一覧" icon="directions_car" sub={`${filteredVehicles.length} 台を表示`}>
            <Table cols={vehicleCols} rows={filteredVehicles} onRow={setSelectedVehicle} />
          </Panel>
        </>
      )}

      {tab === "alerts" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Panel title="保安用品 要対応" icon="warning" sub="在庫なし・要補充の品目">
            <Table cols={supplyCols} rows={stats.lowStock} onRow={setSelectedSupply} />
          </Panel>
          <Panel title="保安車両 要対応" icon="car_repair" sub="整備中・車検期限が近い車両">
            <Table cols={vehicleCols} rows={stats.vehicleAlerts} onRow={setSelectedVehicle} />
          </Panel>
        </div>
      )}

      <Drawer
        open={!!selectedSupply}
        onClose={() => setSelectedSupply(null)}
        title="保安用品 詳細"
        sub={selectedSupply ? `${selectedSupply.id} ・ ${selectedSupply.loc}` : undefined}
        width={560}
      >
        {selectedSupply && (
          <div className="space-y-4">
            <Panel title={selectedSupply.name} icon={getCategoryIcon(selectedSupply.category)}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoCell label="カテゴリ" value={selectedSupply.category} />
                <InfoCell label="保管場所" value={`${selectedSupply.zone} / ${selectedSupply.loc}`} />
                <InfoCell label="総数" value={`${selectedSupply.total} 点`} />
                <InfoCell label="倉庫在庫" value={`${selectedSupply.available} 点`} />
                <InfoCell label="貸出中" value={`${selectedSupply.rented} 点`} />
                <div>
                  <div className="text-xs font-black text-slate-400 mb-1">状態</div>
                  <Badge>{selectedSupply.status}</Badge>
                </div>
              </div>
            </Panel>
            <Panel title="倉庫操作" icon="settings_suggest" sub="貸出中数は注文データから自動計算されます">
              <div className="grid grid-cols-2 gap-2">
                <Btn icon="login" variant="primary" onClick={() => openSupplyAction("stockIn", selectedSupply)}>
                  入庫
                </Btn>
                <Btn icon="logout" variant="secondary" onClick={() => openSupplyAction("stockOut", selectedSupply)} disabled={selectedSupply.available <= 0}>
                  出庫
                </Btn>
                <Btn icon="swap_horiz" variant="secondary" onClick={() => openSupplyAction("move", selectedSupply)}>
                  棚移動
                </Btn>
                <Btn icon="shopping_cart" variant={selectedSupply.status === "正常" ? "secondary" : "primary"} onClick={() => openSupplyAction("reorder", selectedSupply)}>
                  補充手配
                </Btn>
              </div>
            </Panel>
            <Panel title="貸出中の注文" icon="receipt_long" bodyPad={0}>
              <div className="divide-y divide-[#e0f0ee]">
                {(activeOrdersByProduct[selectedSupply.id] || []).slice(0, 8).map((order: any) => (
                  <button
                    key={`${order.id}-${order.activeQty}`}
                    className="w-full px-4 py-3 text-left hover:bg-[#e8f6f5] transition-colors"
                    onClick={() => openOrderFromSupply(order)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-black text-sm text-slate-800 truncate">{order.companyName || order.personName || "顧客未設定"}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{order.orderNumber || order.id} ・ {order.status || "—"}</div>
                      </div>
                      <div className="font-mono font-black text-[#1e8c86]">{order.activeQty}点</div>
                    </div>
                  </button>
                ))}
                {!(activeOrdersByProduct[selectedSupply.id] || []).length && (
                  <div className="px-4 py-8 text-center text-sm font-semibold text-slate-400">貸出中の注文はありません</div>
                )}
              </div>
            </Panel>
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        title="保安車両 詳細"
        sub={selectedVehicle?.plate}
        width={560}
      >
        {selectedVehicle && (
          <div className="space-y-4">
            <Panel title={selectedVehicle.name} icon="directions_car" action={<Badge>{selectedVehicle.status}</Badge>}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoCell label="ナンバー" value={selectedVehicle.plate} />
                <InfoCell label="カテゴリー" value={selectedVehicle.category} />
                <InfoCell label="メーカー" value={selectedVehicle.manufacturer || "—"} />
                <InfoCell label="走行距離" value={selectedVehicle.mileage || "—"} />
                <InfoCell label="車検満了日" value={formatDate(selectedVehicle.inspectionDate)} />
                <InfoCell label="任意保険" value={formatDate(selectedVehicle.insuranceDate)} />
              </div>
            </Panel>
            <Panel title="注意事項" icon="warning">
              <div className="space-y-2">
                {Number(selectedVehicle.inspectionDaysRemaining ?? 999) <= 30 && (
                  <div className="rounded-lg border border-[rgba(239,108,74,0.22)] bg-[rgba(239,108,74,0.10)] px-3 py-2 text-sm font-bold text-[#d45233]">
                    車検期限まで残り{selectedVehicle.inspectionDaysRemaining}日
                  </div>
                )}
                {(selectedVehicle.alerts || []).map((alert, i) => (
                  <div key={i} className="rounded-lg border border-[#eadfb6] bg-[#fff8e7] px-3 py-2 text-sm font-bold text-[#6a5200]">
                    <div>{alert.title}</div>
                    {alert.subtitle && <div className="mt-0.5 text-[11px] font-semibold text-[#8a6a00]">{alert.subtitle}</div>}
                  </div>
                ))}
                {Number(selectedVehicle.inspectionDaysRemaining ?? 999) > 30 && !(selectedVehicle.alerts || []).length && (
                  <div className="py-6 text-center text-sm font-semibold text-slate-400">注意事項はありません</div>
                )}
              </div>
            </Panel>
            <Panel title="車両ステータス操作" icon="published_with_changes" sub="車庫状況をすぐ更新">
              <div className="grid grid-cols-3 gap-2">
                <Btn
                  variant={selectedVehicle.status === "空車" ? "primary" : "secondary"}
                  icon="local_parking"
                  onClick={() => handleVehicleStatusChange("空車")}
                  disabled={selectedVehicle.status === "空車"}
                >
                  空車
                </Btn>
                <Btn
                  variant={selectedVehicle.status === "使用中" ? "primary" : "secondary"}
                  icon="sync"
                  onClick={() => handleVehicleStatusChange("使用中")}
                  disabled={selectedVehicle.status === "使用中"}
                >
                  使用中
                </Btn>
                <Btn
                  variant={selectedVehicle.status === "整備中" ? "primary" : "secondary"}
                  icon="build"
                  onClick={() => handleVehicleStatusChange("整備中")}
                  disabled={selectedVehicle.status === "整備中"}
                >
                  整備中
                </Btn>
              </div>
            </Panel>
          </div>
        )}
      </Drawer>

      <Modal
        open={!!supplyAction}
        onClose={() => { setSupplyAction(null); setSavingAction(false); }}
        title={
          supplyAction?.kind === "stockIn"
            ? "入庫を記録"
            : supplyAction?.kind === "stockOut"
              ? "出庫を記録"
              : supplyAction?.kind === "move"
                ? "棚移動を記録"
                : "補充を手配"
        }
        width={480}
        footer={
          <>
            <Btn variant="secondary" onClick={() => { setSupplyAction(null); setSavingAction(false); }}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveSupplyAction} disabled={savingAction}>保存</Btn>
          </>
        }
      >
        {supplyAction && (
          <form onSubmit={handleSaveSupplyAction} className="space-y-3">
            <div className="rounded-lg border border-[#cfe6e3] bg-[#f7fbfa] px-3 py-2">
              <div className="text-[10px] font-black text-slate-400 mb-1">対象品目</div>
              <div className="font-black text-sm text-slate-800">{supplyAction.supply.name}</div>
              <div className="mt-1 text-[11px] font-bold text-slate-400">
                倉庫在庫 {supplyAction.supply.available}点 ・ 貸出中 {supplyAction.supply.rented}点 ・ 棚番 {supplyAction.supply.loc}
              </div>
            </div>
            {supplyAction.kind !== "move" && (
              <Field label={supplyAction.kind === "reorder" ? "手配数量" : "数量"} required>
                <TextInput type="number" min="1" value={actionQty} onChange={(e) => setActionQty(Number(e.target.value))} />
                {/* 在庫ヒント: 選択中品目の現在庫を表示。出庫が在庫超過なら警告色。 */}
                {(() => {
                  const onHand = supplyAction.supply.available;
                  const short = supplyAction.kind === "stockOut" && Number(actionQty) > onHand;
                  return (
                    <div className={`mt-1.5 text-xs font-bold rounded-lg px-3 py-2 ${short ? "bg-red-50 text-red-600 border border-red-200" : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
                      現在庫: {onHand}点{short ? ` ・ 出庫数(${actionQty})が在庫を超えています` : ""}
                    </div>
                  );
                })()}
              </Field>
            )}
            {supplyAction.kind === "move" && (
              <Field label="移動先棚番" required>
                <TextInput value={actionLocation} onChange={(e) => setActionLocation(e.target.value)} placeholder="例：B-12" />
              </Field>
            )}
            <Field label={supplyAction.kind === "stockOut" ? "出庫先・理由" : supplyAction.kind === "reorder" ? "補充理由" : "メモ"}>
              <TextInput
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={
                  supplyAction.kind === "stockIn"
                    ? "例：新規購入 PO-1234"
                    : supplyAction.kind === "stockOut"
                      ? "例：廃棄・販売・別倉庫移管"
                      : supplyAction.kind === "move"
                        ? "例：棚替え"
                        : "例：安全在庫を下回ったため"
                }
              />
            </Field>
            <Field label="担当者" required>
              <TextInput value={actionStaff} onChange={(e) => setActionStaff(e.target.value)} />
            </Field>
          </form>
        )}
      </Modal>

      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="保安用品を登録"
        width={480}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveItem}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveItem} className="space-y-3">
          <Field label="品名" required>
            <TextInput autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例：カラーコーン 赤" />
          </Field>
          <Row>
            <Field label="カテゴリ" required>
              <SelectInput value={newCat} onChange={(e) => setNewCat(e.target.value)} options={supplyCategoryOptions} />
            </Field>
            <Field label="棚番" required>
              <TextInput value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="例：A-01" />
            </Field>
          </Row>
          <Field label="総保管数" required>
            <TextInput type="number" min="0" value={newTotal} onChange={(e) => setNewTotal(Number(e.target.value))} />
          </Field>
        </form>
      </Modal>

      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          // 「手配する」(処理中→確認済み) も受注確定 → 出庫。返却系クローズは settleReturnStock で入庫。
          const raw = (OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id)) || selectedOrder;
          const flags = status === "確認済み" ? deductOrderStock(raw) : settleReturnStock(raw, status);
          OrderBus.patch("orders", id, { status, staffStatus, ...flags });
          setSelectedOrder((prev: any) => prev ? { ...prev, status, staffStatus, ...flags } : prev);
          triggerToast("注文ステータスを更新しました", "ok");
        }}
        onUpdateOrder={(id, updates) => {
          OrderBus.patch("orders", id, updates);
          setSelectedOrder((prev: any) => prev ? { ...prev, ...updates } : prev);
        }}
      />
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#cfe6e3] bg-[#f7fbfa] px-3 py-2">
      <div className="text-[10px] font-black text-slate-400 mb-1">{label}</div>
      <div className="text-sm font-black text-slate-800 break-words">{value}</div>
    </div>
  );
}
