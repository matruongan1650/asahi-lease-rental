import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAdminCollection, useAdminOrders } from "../context/AdminDataContext";
import { byOrderDateDesc } from "../utils/orderSort";
import { isVehicleCategory } from "../utils/productUtils";
import { deductOrderStock, settleReturnStock, stockFlagsForStatusChange } from "../utils/stockLedger";
import { closeOrderBillingPatch, getOrGenerateInvoiceBlocks } from "../utils/billing";
import { isOverdueRentalOrder, isRecoverableRentalOrder } from "../utils/orderStatus";
import OrderBus from "../lib/orderBus";
import AdminOrderDrawer from "./AdminOrderDrawer";
import { Btn, Modal, triggerToast } from "./AdminUI";
import {
  Eye,
  TrendingUp,
  ChevronDown,
  Truck,
  CalendarClock,
  AlertTriangle,
  Clock,
  Package,
  Users,
  Star,
  BarChart3,
  ArrowRight,
  ShieldAlert,
  Wrench,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────
function fmtYen(n: number) {
  return "¥" + n.toLocaleString("ja-JP");
}

function pctBadge(pct: number) {
  const up = pct >= 0;
  return (
    <span
      className={`text-xs font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5 ${up ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"}`}
    >
      <TrendingUp size={12} className={up ? "" : "rotate-180"} />
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

function todayStr() {
  const d = new Date();
  return formatDateKey(d);
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseOrderDate(order: any): Date | null {
  const raw = order?.createdAt || order?.date || "";
  if (!raw) return null;
  if (typeof raw === "string" && raw.includes("T")) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  const datePart = String(raw).split("•")[0]?.trim() || "";
  const m = datePart.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function normalizeDateKey(raw: unknown): string {
  if (!raw) return "";
  const text = String(raw).split("•")[0]?.trim() || "";
  const m = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function isClosedOrder(status: unknown): boolean {
  return ["返却済", "返却済み", "完了", "キャンセル"].includes(String(status || ""));
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function itemLineSubtotal(item: any): number {
  if (!item) return 0;
  const qty = Number(item.quantity || 0);
  if (item.type === "rent") {
    return (Number(item.calculatedPrice ?? item.rentPrice ?? 0) * qty) + Number(item.guaranteeFeeFlat || 0);
  }
  return Number(item.buyPrice || 0) * qty;
}

function splitOrderRevenue(order: any, totalOverride?: number): { rental: number; sales: number } {
  let rentalSub = 0;
  let salesSub = 0;
  (order.items || []).forEach((item: any) => {
    const value = itemLineSubtotal(item);
    if (item.type === "rent") rentalSub += value;
    else if (item.type === "buy") salesSub += value;
  });

  const subtotal = rentalSub + salesSub;
  const total = Number(totalOverride ?? order.total ?? 0);
  if (subtotal <= 0) {
    // 明細価格が degenerate(0) のときは品目「件数」で按分する。rent 行が1つでもあれば全額レンタルに
    // するのは、rent+buy 混在注文でレンタル比率を過大計上するため。
    const rentCount = order.items?.filter((i: any) => i.type === "rent").length || 0;
    const buyCount = order.items?.filter((i: any) => i.type === "buy").length || 0;
    if (rentCount > 0 && buyCount > 0) {
      const rental = Math.round((rentCount / (rentCount + buyCount)) * total);
      return { rental, sales: total - rental };
    }
    return buyCount > 0 ? { rental: 0, sales: total } : { rental: total, sales: 0 };
  }
  return {
    rental: Math.round((rentalSub / subtotal) * total),
    sales: Math.round((salesSub / subtotal) * total),
  };
}

// ─── component ───────────────────────────────────────────
export default function AdminDashboardHome({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const go = (tab: string) => onNavigate?.(tab);
  const liveOrders = useAdminOrders();
  const { rows: products } = useAdminCollection("products");
  const { rows: vehicles } = useAdminCollection("vehicles");
  const { rows: fieldReports } = useAdminCollection("fieldReports");
  const { rows: maintenance } = useAdminCollection("maintenance");
  const { rows: repairs } = useAdminCollection("repairs");
  const orders = liveOrders.orders;
  const [trendRange, setTrendRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [viewAllModal, setViewAllModal] = useState<"unreturned" | "transactions" | null>(null);

  // 請求実態ベースの注文合計（延滞自動延長・当月ロールフォワード込みのブロック合計）。
  // 保存済み order.total は納品時に凍結され、延滞中の注文では毎日ズレる(M5/M6)。
  const effTotals = useMemo(() => {
    const m = new Map<any, number>();
    orders.forEach((o: any) => {
      let v = Number(o?.total) || 0;
      try {
        const blocks = getOrGenerateInvoiceBlocks(o);
        if (Array.isArray(blocks) && blocks.length > 0) v = blocks.reduce((sum: number, b: any) => sum + (Number(b?.total) || 0), 0);
      } catch { /* 保存値へフォールバック */ }
      m.set(o, v);
    });
    return m;
  }, [orders]);
  const eff = (o: any) => effTotals.get(o) ?? (Number(o?.total) || 0);

  // ══════════════════════════════════════
  // KPIs
  // ══════════════════════════════════════
  const kpis = useMemo(() => {
    const rentOrders = orders.filter((o) => o.items?.some((i) => i.type === "rent"));
    const buyOrders = orders.filter((o) => o.items?.some((i) => i.type === "buy"));
    // 売上系の集計はキャンセル注文を除外（実現売上のみ）。件数(totalOrders等)は従来どおり全件。
    const revenueOrders = orders.filter((o) => String(o.status) !== "キャンセル");
    const avgTransaction = revenueOrders.length > 0 ? Math.round(revenueOrders.reduce((s, o) => s + eff(o), 0) / revenueOrders.length) : 0;

    let rentalRevenue = 0;
    let salesRevenue = 0;
    revenueOrders.forEach((o) => {
      const split = splitOrderRevenue(o, eff(o));
      rentalRevenue += split.rental;
      salesRevenue += split.sales;
    });

    rentalRevenue = Math.round(rentalRevenue);
    salesRevenue = Math.round(salesRevenue);
    const totalRevenue = rentalRevenue + salesRevenue;

    const total = totalRevenue;
    const rental = rentalRevenue;
    const sales = salesRevenue;
    const avg = avgTransaction;
    const rentalPct = total > 0 ? Math.round((rental / total) * 100) : 0;
    const salesPct = total > 0 ? 100 - rentalPct : 0;

    const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
    const activeRentQty = rentOrders
      // 出庫前（処理中/注文確認中＝受注未確定で在庫未減算）は稼働数に数えない。数えると同じ現物を
      // 在庫と稼働中で二重計上し、稼働率・稼働中ドーナツが過大表示になる（C27）。
      .filter((o) => !isClosedOrder(o.status) && String(o.status) !== "処理中" && String(o.status) !== "注文確認中")
      .reduce((sum, order) => sum + (order.items || []).reduce((itemSum: number, item: any) => {
        if (item.type !== "rent") return itemSum;
        return itemSum + Math.max(0, Number(item.quantity || 0) - Number(item.returnedQuantity || 0));
      }, 0), 0);
    const inventoryBase = totalStock + activeRentQty;
    const utilizationRate = inventoryBase > 0 ? Math.round((activeRentQty / inventoryBase) * 100) : 0;

    const safetyVehicles = products.filter((p) => isVehicleCategory(p.category)).reduce((s, p) => s + (p.stock || 0), 0);
    const safetySupplies = totalStock - safetyVehicles;

    return {
      total, rental, sales, avg, rentalPct, salesPct,
      totalStock,
      utilizationRate,
      safetyVehicles,
      safetySupplies,
      totalOrders: orders.length,
      rentCount: rentOrders.length,
      buyCount: buyOrders.length,
      revenueCount: revenueOrders.length,
    };
  }, [orders, products, effTotals]);

  // ══════════════════════════════════════
  // Trend chart data
  // ══════════════════════════════════════
  const trendData = useMemo(() => {
    const now = new Date();
    const points: { date: string; value: number }[] = [];
    const numPoints = trendRange === "daily" ? 30 : trendRange === "weekly" ? 12 : 6;
    const totalsByKey = new Map<string, number>();

    orders.forEach((order) => {
      if (String(order.status) === "キャンセル") return; // 売上トレンドはキャンセルを除外
      const d = parseOrderDate(order);
      if (!d) return;
      let key = "";
      if (trendRange === "monthly") {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else if (trendRange === "weekly") {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        key = formatDateKey(start);
      } else {
        key = formatDateKey(d);
      }
      totalsByKey.set(key, (totalsByKey.get(key) || 0) + eff(order));
    });

    for (let i = numPoints - 1; i >= 0; i--) {
      // 月別は「1日固定」で遡る。now の日を保持したまま setMonth すると 29〜31日実行時に月が
      // オーバーフローして重複/欠落する(M7)。
      const d = trendRange === "monthly"
        ? new Date(now.getFullYear(), now.getMonth() - i, 1)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() - (trendRange === "weekly" ? i * 7 : i));
      const key = trendRange === "monthly"
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : trendRange === "weekly"
          ? formatDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()))
          : formatDateKey(d);
      const label = trendRange === "monthly"
        ? `${d.getMonth() + 1}月`
        : `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
      points.push({ date: label, value: Math.round(totalsByKey.get(key) || 0) });
    }
    return points;
  }, [orders, trendRange, effTotals]);

  // ══════════════════════════════════════
  // Donut chart data
  // ══════════════════════════════════════
  const donutData = useMemo(() => {
    const activeRentQty = orders
      // 出庫前（処理中/注文確認中）は稼働数に数えない（在庫と二重計上して稼働中スライスが過大になる。C27）。
      .filter((o) => o.items?.some((i: any) => i.type === "rent") && !isClosedOrder(o.status)
        && String(o.status) !== "処理中" && String(o.status) !== "注文確認中")
      .reduce((sum, order) => sum + (order.items || []).reduce((itemSum: number, item: any) => {
        if (item.type !== "rent") return itemSum;
        return itemSum + Math.max(0, Number(item.quantity || 0) - Number(item.returnedQuantity || 0));
      }, 0), 0);
    const maintCount =
      vehicles.filter((v: any) => v.status === "整備中").length +
      maintenance.filter((m: any) => !["完了", "正常"].includes(String(m.status || ""))).length;
    const repairCount =
      repairs.filter((r: any) => !["完了", "対応済"].includes(String(r.status || ""))).length +
      fieldReports.filter((r: any) => !["対応済", "完了"].includes(String(r.status || ""))).length;
    const availableStock = products.reduce((sum: number, p: any) => sum + Math.max(0, Number(p.stock || 0)), 0);
    const total = activeRentQty + maintCount + repairCount + availableStock;
    const inUsePct = total > 0 ? Math.round((activeRentQty / total) * 100) : 0;
    const maintPct = total > 0 ? Math.round((maintCount / total) * 100) : 0;
    // 修理待ちは repairCount から直接算出する（以前は残差で算出していたため空き在庫を吸収して過大表示だった）。
    const repairPct = total > 0 ? Math.round((repairCount / total) * 100) : 0;
    // 空き在庫は独立スライスとして表示し、全セグメントが正しく合算するようにする。
    const availPct = total > 0 ? Math.max(0, 100 - inUsePct - maintPct - repairPct) : 0;
    return [
      { name: "稼働中", value: inUsePct, color: "#2BA8A2" },
      { name: "点検中", value: maintPct, color: "#FFD23F" },
      { name: "修理待ち", value: repairPct, color: "#EF6C4A" },
      { name: "空き在庫", value: availPct, color: "#CBD5E1" },
    ];
  }, [orders, products, vehicles, maintenance, repairs, fieldReports]);
  const donutTotalPct = donutData.reduce((sum, item) => sum + item.value, 0);

  // ══════════════════════════════════════
  // Recent transactions
  // ══════════════════════════════════════
  const allRecentOrders = useMemo(() => {
    return [...orders].sort(byOrderDateDesc);
  }, [orders]);
  const recentOrders = allRecentOrders.slice(0, 6);

  // ══════════════════════════════════════
  // 本日の予定 (Today's Schedule)
  // ══════════════════════════════════════
  const todaySchedule = useMemo(() => {
    const today = todayStr();

    // 配送：今日が deliveryDate、または現在「配送中」のもの。配送完了(配送済み/レンタル中)は除外。
    const DELIVERY_DONE = new Set(["配送済み", "レンタル中", "回収予定", "回収中", "一部返却", "返却済み", "返却済", "完了", "キャンセル"]);
    const allDeliveries = orders.filter((o) =>
      normalizeDateKey(o.deliveryDate) === today || o.status === "配送中"
    );
    const deliveriesDone   = allDeliveries.filter((o) => DELIVERY_DONE.has(o.status));
    const deliveriesPending = allDeliveries.filter((o) => !DELIVERY_DONE.has(o.status));

    // 回収：今日が rentalEndDate、または「回収予定/回収中」のもの。完了済みは除外。
    const RECOVERY_DONE = new Set(["返却済み", "返却済", "完了", "キャンセル"]);
    const allCollections = orders.filter((o) =>
      normalizeDateKey(o.rentalEndDate) === today || o.status === "回収予定" || o.status === "回収中"
    );
    const collectionsDone    = allCollections.filter((o) => RECOVERY_DONE.has(o.status));
    const collectionsPending = allCollections.filter((o) => !RECOVERY_DONE.has(o.status));

    const orderIssueReports = orders.filter(
      (o) => o.itemIssues && o.itemIssues.length > 0 && !isClosedOrder(o.status)
    );
    const pendingFieldReports = fieldReports.filter((r: any) => !["対応済", "完了"].includes(String(r.status || "")));
    return {
      deliveries: deliveriesPending,
      deliveriesDone,
      deliveriesTotal: allDeliveries.length,
      collections: collectionsPending,
      collectionsDone,
      collectionsTotal: allCollections.length,
      fieldReports: [...pendingFieldReports, ...orderIssueReports],
    };
  }, [orders, fieldReports]);

  // ══════════════════════════════════════
  // アラート (Alerts)
  // ══════════════════════════════════════
  const alerts = useMemo(() => {
    const list: { icon: React.ReactNode; title: string; desc: string; color: "red" | "orange" | "blue"; target: string }[] = [];
    
    // Overdue rentals（日付のみで比較。今日が返却日の注文を終日「延滞」と誤判定しないよう深夜0時基準にする）
    const _now = new Date();
    const t0 = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate()).getTime();
    // 未納品や回収済み(検品待ち)を「回収手配が必要」に混ぜない共通判定を使う(M8/M27)。
    const overdueRentals = orders.filter((o) => isOverdueRentalOrder(o));
    if (overdueRentals.length > 0) {
      list.push({
        icon: <Clock size={18} />,
        title: `延滞中のレンタル ${overdueRentals.length} 件`,
        desc: "回収手配が必要です",
        color: "red",
        target: "collection",
      });
    }

    // Unprocessed field reports
    const issueOrders = orders.filter(
      (o) => o.itemIssues && o.itemIssues.length > 0 && !isClosedOrder(o.status)
    );
    const unprocessedReports = [
      ...fieldReports.filter((r: any) => !["対応済", "完了"].includes(String(r.status || ""))),
      ...issueOrders,
    ];
    if (unprocessedReports.length > 0) {
      list.push({
        icon: <ShieldAlert size={18} />,
        title: `現場報告 未対応 ${unprocessedReports.length} 件`,
        desc: "破損・紛失の処理が必要",
        color: "red",
        target: "field_report",
      });
    }

    // Low stock items
    const lowStock = products.filter((p) => p.stock <= 3 && p.stock > 0);
    if (lowStock.length > 0) {
      list.push({
        icon: <Package size={18} />,
        title: `在庫不足 ${lowStock.length} 品目`,
        desc: lowStock.slice(0, 2).map((p) => p.name).join("、"),
        color: "orange",
        target: "warehouse",
      });
    }

    // Vehicle maintenance（保存済み残日数ではなく inspectionDate から毎回再計算。time経過で
    // 車検切れになった車両も拾えるよう、他のアラートと同じ深夜0時(t0)基準で算出する）。
    const liveInspDays = (d?: string) => d ? Math.round((new Date(String(d).replace(/\//g, "-") + "T00:00:00").getTime() - t0) / 86400000) : 999;
    const vehicleAlerts = vehicles.filter((v) => liveInspDays(v.inspectionDate) <= 30);
    if (vehicleAlerts.length > 0) {
      list.push({
        icon: <Truck size={18} />,
        title: `車検期限 ${vehicleAlerts.length} 台`,
        desc: "30日以内に車検が必要",
        color: "orange",
        target: "vehicles",
      });
    }

    const pendingMaintenance = maintenance.filter(
      (m: any) => !["完了", "正常"].includes(String(m.status || "")) && Number(m.days ?? 999) <= 7
    );
    if (pendingMaintenance.length > 0) {
      list.push({
        icon: <Wrench size={18} />,
        title: `メンテナンス予定 ${pendingMaintenance.length} 件`,
        desc: pendingMaintenance.slice(0, 2).map((m: any) => m.name || m.asset || m.id).join("、"),
        color: "blue",
        target: "maintenance",
      });
    }

    return list;
  }, [orders, products, vehicles, fieldReports, maintenance]);

  // ══════════════════════════════════════
  // 未回収一覧 (Unreturned Equipment)
  // ══════════════════════════════════════
  const allUnreturnedOrders = useMemo(() => {
    const now = new Date();
    // 残日数は日付（深夜0時）基準で計算。時刻成分や UTC 解釈による ±1 日のズレを防ぐ。
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return orders
      // 未納品・回収済み(検品待ち)は「未回収機材」ではない（回収に行けない/既に回収済み）(M27)。
      .filter((o) => isRecoverableRentalOrder(o))
      .map((o) => {
        const endDate = o.rentalEndDate ? new Date(o.rentalEndDate.replace(/\//g, "-") + "T00:00:00") : null;
        const daysRemaining = endDate ? Math.round((endDate.getTime() - t0) / 86400000) : null;
        return { ...o, daysRemaining, _effTotal: eff(o) };
      })
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));
  }, [orders, effTotals]);
  const unreturnedOrders = allUnreturnedOrders.slice(0, 5);

  // ══════════════════════════════════════
  // 売上ランキング (Top Customers)
  // ══════════════════════════════════════
  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    orders.forEach((o) => {
      if (String(o.status) === "キャンセル") return; // 売上ランキングはキャンセルを除外
      const key = o.companyName || o.personName || "不明";
      if (!map[key]) map[key] = { name: key, total: 0, count: 0 };
      map[key].total += eff(o);
      map[key].count += 1;
    });
    const list = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
    return list;
  }, [orders]);

  // ══════════════════════════════════════
  // 人気機材 (Popular Equipment)
  // ══════════════════════════════════════
  const popularEquipment = useMemo(() => {
    const map: Record<string, { name: string; count: number; category: string; image: string }> = {};
    orders.forEach((o) => {
      if (String(o.status) === "キャンセル") return; // 他の売上系集計と同じくキャンセル除外(M10)
      o.items?.forEach((item) => {
        if (item.type !== "rent") return;
        if (!map[item.id]) map[item.id] = { name: item.name, count: 0, category: item.category || "レンタル品", image: item.image };
        map[item.id].count += item.quantity;
      });
    });
    const list = Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);
    return list;
  }, [orders]);

  // ══════════════════════════════════════
  // 在庫不足 (Low Stock)
  // ══════════════════════════════════════
  const lowStockItems = useMemo(() => {
    return products
      .filter((p) => p.stock <= 5)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 6);
  }, [products]);

  // ══════════════════════════════════════
  // 月別比較 (Month vs Month)
  // ══════════════════════════════════════
  const monthComparison = useMemo(() => {
    const now = new Date();
    const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    const orderMonthKey = (o: any) => {
      const d = parseOrderDate(o);
      return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
    };
    // 売上比較もキャンセルを除外（実現売上のみ）。
    const notCancelled = orders.filter((o) => String(o.status) !== "キャンセル");
    const thisMonthOrders = notCancelled.filter((o) => orderMonthKey(o) === thisMonthStr);
    const lastMonthOrders = notCancelled.filter((o) => orderMonthKey(o) === lastMonthStr);

    const thisRevenue = thisMonthOrders.reduce((s, o) => s + eff(o), 0);
    const lastRevenue = lastMonthOrders.reduce((s, o) => s + eff(o), 0);
    const thisCount = thisMonthOrders.length;
    const lastCount = lastMonthOrders.length;
    const thisRental = thisMonthOrders.reduce((s, o) => s + splitOrderRevenue(o).rental, 0);
    const lastRental = lastMonthOrders.reduce((s, o) => s + splitOrderRevenue(o).rental, 0);
    const thisSales = thisMonthOrders.reduce((s, o) => s + splitOrderRevenue(o).sales, 0);
    const lastSales = lastMonthOrders.reduce((s, o) => s + splitOrderRevenue(o).sales, 0);
    const thisAvg = thisCount > 0 ? Math.round(thisRevenue / thisCount) : 0;
    const lastAvg = lastCount > 0 ? Math.round(lastRevenue / lastCount) : 0;

    const revChange = percentChange(thisRevenue, lastRevenue);
    const countChange = percentChange(thisCount, lastCount);

    return {
      thisRevenue, lastRevenue, thisCount, lastCount, revChange, countChange,
      rentalChange: percentChange(thisRental, lastRental),
      salesChange: percentChange(thisSales, lastSales),
      avgChange: percentChange(thisAvg, lastAvg),
      thisMonthLabel: `${now.getMonth() + 1}月`,
      lastMonthLabel: `${lastMonth.getMonth() + 1}月`,
    };
  }, [orders]);

  // ══════════════════════════════════════
  // 車両稼働 (Vehicle Status)
  // ══════════════════════════════════════
  const vehicleStatus = useMemo(() => {
    const inUse = vehicles.filter((v) => v.status === "使用中").length;
    const idle = vehicles.filter((v) => v.status === "空車").length;
    const maint = vehicles.filter((v) => v.status === "整備中").length;
    const total = vehicles.length;

    return {
      total,
      inUse,
      idle,
      maint,
      inUsePct: total > 0 ? Math.round((inUse / total) * 100) : 0,
    };
  }, [vehicles]);

  // 総売上高カードの直近7日スパークライン。日付ラベルと実額を保持し、
  // 棒の高さは「その日の売上 ÷ 直近7日の最大売上」で正規化する。
  const miniBarData = useMemo(() => {
    const recent = trendData.slice(-7);
    const max = Math.max(1, ...recent.map((p) => p.value));
    if (recent.length === 0) {
      return Array.from({ length: 7 }, () => ({ label: "", value: 0, pct: 0 }));
    }
    return recent.map((p) => ({
      label: p.date,
      value: p.value,
      pct: Math.round((p.value / max) * 100),
    }));
  }, [trendData]);

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════
  return (
    <div className="space-y-5">
      {/* ─── 当日アクションバー（業務開始時の最優先: 配送/回収の残・延滞・未対応報告を最上部に） ─── */}
      {(() => {
        const t0 = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
        const overdue = orders.filter((o) => isOverdueRentalOrder(o)).length; // 共通判定(M15)
        const items = [
          { label: "配送 残", n: todaySchedule.deliveries.length, tab: "orders", icon: "local_shipping", on: "bg-blue-50 border-blue-200 text-blue-700" },
          { label: "回収 残", n: todaySchedule.collections.length, tab: "orders", icon: "assignment_return", on: "bg-emerald-50 border-emerald-200 text-emerald-700" },
          { label: "延滞", n: overdue, tab: "collection", icon: "schedule", on: "bg-red-50 border-red-200 text-red-700" },
          { label: "未対応報告", n: todaySchedule.fieldReports.length, tab: "field_report", icon: "report", on: "bg-red-50 border-red-200 text-red-700" },
        ];
        if (items.every((i) => i.n === 0)) return null;
        return (
          <div className="flex flex-wrap gap-2.5">
            {items.map((it) => (
              <button key={it.label} onClick={() => go(it.tab)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-sm transition-all hover:shadow-md ${it.n > 0 ? it.on : "bg-white border-slate-200 text-slate-400"}`}>
                <span className="material-symbols-outlined text-[20px]">{it.icon}</span>
                <span className="text-sm font-bold">{it.label}</span>
                <span className="text-lg font-black font-mono">{it.n}</span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between rounded-lg border border-[#cfe6e3] bg-[#fffdf6] px-4 py-3 shadow-[0_4px_20px_rgba(43,168,162,0.08)]">
        <div>
          <p className="text-xs font-black text-[#1e8c86] tracking-[0.12em] uppercase">Today</p>
          <h2 className="text-lg font-black text-[#173b38] tracking-tight">
            {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}の現在の状況
          </h2>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs font-black text-[#46706c]">
          <span className="rounded-full bg-[#e8f6f5] px-3 py-1.5">注文 {kpis.totalOrders.toLocaleString()}件</span>
          <span className="rounded-full bg-[#fff8e7] px-3 py-1.5">在庫 {kpis.totalStock.toLocaleString()}点</span>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 総売上高 */}
        <div onClick={() => go("invoices")} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">総売上高</span>
            {pctBadge(monthComparison.revChange)}
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight mb-3">{fmtYen(kpis.total)}</h2>
          <div className="flex items-end gap-1.5 h-8">
            {miniBarData.map((p, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col justify-end h-full rounded-sm bg-blue-50"
                title={p.label ? `${p.label}: ${fmtYen(p.value)}` : ""}
              >
                <div
                  className="w-full rounded-sm bg-blue-500 transition-all"
                  style={{ height: `${p.value > 0 ? Math.max(p.pct, 8) : 0}%` }}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] font-medium text-slate-400 mt-1.5 text-right">{trendRange === "daily" ? "直近7日の売上" : trendRange === "weekly" ? "直近7週の売上" : "直近7ヶ月の売上"}</p>
        </div>

        {/* レンタル売上 */}
        <div onClick={() => go("orders")} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">レンタル売上</span>
            {pctBadge(monthComparison.rentalChange)}
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight mb-3">{fmtYen(kpis.rental)}</h2>
          <div className="flex items-center gap-3 text-xs font-bold text-slate-500 mb-2">
            <span>シェア: <span className="text-blue-600">{kpis.rentalPct}%</span></span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${kpis.rentalPct}%` }} />
          </div>
        </div>

        {/* 販売売上 */}
        <div onClick={() => go("sales")} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">販売売上</span>
            {pctBadge(monthComparison.salesChange)}
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight mb-3">{fmtYen(kpis.sales)}</h2>
          <div className="flex items-center gap-3 text-xs font-bold text-slate-500 mb-2">
            <span>シェア: <span className="text-orange-500">{kpis.salesPct}%</span></span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${kpis.salesPct}%` }} />
          </div>
        </div>

        {/* 平均取引額 */}
        <div onClick={() => go("orders")} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">平均取引額</span>
            {pctBadge(monthComparison.avgChange)}
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight mb-3">{fmtYen(kpis.avg)}</h2>
          <p className="text-xs text-slate-400 font-medium">
            全期間 {kpis.revenueCount.toLocaleString()} 件の実取引から算出
          </p>
        </div>

        {/* 在庫数 */}
        <div onClick={() => go("warehouse")} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">在庫数</span>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">稼働率 {kpis.utilizationRate}%</span>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">{kpis.totalStock.toLocaleString()}</h2>
            <span className="text-base font-bold text-slate-400">点</span>
          </div>
          <div className="flex items-center gap-2.5 text-[10px] font-bold">
            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md truncate">保安用品 {kpis.safetySupplies.toLocaleString()}</span>
            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded-md truncate">保安車両 {kpis.safetyVehicles.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ─── 本日の予定 + アラート ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 本日の予定 */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <CalendarClock size={20} className="text-blue-500" />
            <h3 className="font-bold text-slate-800 text-base">本日の予定</h3>
            <span className="text-xs text-slate-400 font-medium ml-1">
              {new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric" })}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 配送 */}
            <div onClick={() => go("orders")} className="bg-blue-50/60 rounded-xl p-4 border border-blue-100 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Truck size={16} className="text-blue-600" />
                </div>
                <span className="text-sm font-bold text-blue-700">配送</span>
                {todaySchedule.deliveriesTotal > 0 && (
                  <span className="ml-auto text-xs text-blue-500 font-medium bg-blue-100 px-1.5 py-0.5 rounded-full">
                    完了 {todaySchedule.deliveriesDone.length}/{todaySchedule.deliveriesTotal}
                  </span>
                )}
              </div>
              <div className="text-3xl font-extrabold text-slate-800 mb-1">
                {todaySchedule.deliveries.length}<span className="text-sm font-bold text-slate-400 ml-1">件残</span>
              </div>
              {todaySchedule.deliveriesTotal > 0 && (
                <div className="w-full h-1.5 bg-blue-100 rounded-full mb-2">
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: `${Math.round((todaySchedule.deliveriesDone.length / todaySchedule.deliveriesTotal) * 100)}%` }}
                  />
                </div>
              )}
              {todaySchedule.deliveries.slice(0, 2).map((o, i) => (
                <p key={i} className="text-xs text-slate-500 truncate mt-1">
                  • {o.companyName || o.siteName || o.personName}
                </p>
              ))}
              {todaySchedule.deliveries.length === 0 && (
                <p className="text-xs text-blue-500 mt-1 font-medium">
                  {todaySchedule.deliveriesTotal > 0 ? "✓ すべて完了" : "予定なし"}
                </p>
              )}
            </div>

            {/* 回収 */}
            <div onClick={() => go("collection")} className="bg-purple-50/60 rounded-xl p-4 border border-purple-100 cursor-pointer hover:border-purple-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Package size={16} className="text-purple-600" />
                </div>
                <span className="text-sm font-bold text-purple-700">回収</span>
                {todaySchedule.collectionsTotal > 0 && (
                  <span className="ml-auto text-xs text-purple-500 font-medium bg-purple-100 px-1.5 py-0.5 rounded-full">
                    完了 {todaySchedule.collectionsDone.length}/{todaySchedule.collectionsTotal}
                  </span>
                )}
              </div>
              <div className="text-3xl font-extrabold text-slate-800 mb-1">
                {todaySchedule.collections.length}<span className="text-sm font-bold text-slate-400 ml-1">件残</span>
              </div>
              {todaySchedule.collectionsTotal > 0 && (
                <div className="w-full h-1.5 bg-purple-100 rounded-full mb-2">
                  <div
                    className="h-full bg-purple-400 rounded-full transition-all"
                    style={{ width: `${Math.round((todaySchedule.collectionsDone.length / todaySchedule.collectionsTotal) * 100)}%` }}
                  />
                </div>
              )}
              {todaySchedule.collections.slice(0, 2).map((o, i) => (
                <p key={i} className="text-xs text-slate-500 truncate mt-1">
                  • {o.companyName || o.siteName || o.personName}
                </p>
              ))}
              {todaySchedule.collections.length === 0 && (
                <p className="text-xs text-purple-500 mt-1 font-medium">
                  {todaySchedule.collectionsTotal > 0 ? "✓ すべて完了" : "予定なし"}
                </p>
              )}
            </div>

            {/* 現場報告 */}
            <div onClick={() => go("field_report")} className="bg-amber-50/60 rounded-xl p-4 border border-amber-100 cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle size={16} className="text-amber-600" />
                </div>
                <span className="text-sm font-bold text-amber-700">報告待ち</span>
              </div>
              <div className="text-3xl font-extrabold text-slate-800 mb-1">
                {todaySchedule.fieldReports.length}<span className="text-sm font-bold text-slate-400 ml-1">件</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">破損・紛失レポート</p>
            </div>
          </div>
        </div>

        {/* アラート */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className="text-red-500" />
            <h3 className="font-bold text-slate-800 text-base">アラート</h3>
            <span className="ml-auto text-xs font-bold text-slate-400 bg-red-50 text-red-500 px-2 py-0.5 rounded-full">
              {alerts.length}件
            </span>
          </div>
          <div className="space-y-3">
            {alerts.length > 0 ? alerts.map((a, i) => (
              <div
                key={i}
                onClick={() => go(a.target)}
                className={`p-3.5 rounded-xl flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity border ${
                  a.color === "red"
                    ? "bg-red-50/80 border-red-100 text-red-600"
                    : a.color === "orange"
                      ? "bg-amber-50/80 border-amber-100 text-amber-600"
                      : "bg-blue-50/80 border-blue-100 text-blue-600"
                }`}
              >
                {a.icon}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 leading-tight">{a.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{a.desc}</p>
                </div>
                <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
              </div>
            )) : (
              <div className="py-8 text-center text-sm font-medium text-slate-400">現在のアラートはありません</div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Charts Row ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Area Chart */}
        <div className="xl:col-span-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h3 className="font-bold text-slate-800 text-base">売上推移</h3>
              <p className="text-xs text-slate-400 mt-1">過去30日間の収益パフォーマンス</p>
            </div>
            <div className="relative">
              <select
                value={trendRange}
                onChange={(e) => setTrendRange(e.target.value as "daily" | "weekly" | "monthly")}
                className="appearance-none pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="daily">日別</option>
                <option value="weekly">週別</option>
                <option value="monthly">月別</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2BA8A2" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2BA8A2" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#CFE6E3" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#7CA39F" }} dy={10} interval={trendRange === "daily" ? 5 : "preserveStartEnd"} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#7CA39F" }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 30px -4px rgb(0 0 0 / 0.12)", padding: "10px 14px", fontSize: "13px" }} formatter={(value: number) => [fmtYen(value), "売上"]} labelStyle={{ fontWeight: 700, marginBottom: 4 }} />
                <Area type="monotone" dataKey="value" stroke="#2BA8A2" strokeWidth={2.5} fill="url(#blueGradient)" dot={false} activeDot={{ r: 6, strokeWidth: 3, stroke: "#fff", fill: "#2BA8A2" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="font-bold text-slate-800 text-base">メンテナンス状況</h3>
          <p className="text-xs text-slate-400 mt-1">機材の稼働ステータス</p>
          <div className="flex justify-center my-2">
            <div className="relative w-52 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={62} outerRadius={88} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    {donutData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight">{donutTotalPct}<span className="text-base font-bold text-slate-400">%</span></span>
                <span className="text-xs text-slate-400 font-medium">稼働比率</span>
              </div>
            </div>
          </div>
          <div className="space-y-2.5 mt-3">
            {donutData.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-medium text-slate-600">{item.name}</span>
                </div>
                <span className="font-bold text-slate-800">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── 未回収 + 月別比較 ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* 未回収一覧 */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-6 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={20} className="text-red-500" />
              <h3 className="font-bold text-slate-800 text-base">未回収一覧</h3>
            </div>
            <button
              onClick={() => setViewAllModal("unreturned")}
              className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              すべて見る <ArrowRight size={14} />
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 text-slate-500">
                <th className="px-6 py-2.5 text-left font-bold text-xs">顧客</th>
                <th className="px-6 py-2.5 text-left font-bold text-xs">機材</th>
                <th className="px-6 py-2.5 text-center font-bold text-xs">終了日</th>
                <th className="px-6 py-2.5 text-center font-bold text-xs">状況</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {unreturnedOrders.length > 0 ? unreturnedOrders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3 font-bold text-slate-800 text-xs">{o.companyName || o.personName || "—"}</td>
                  <td className="px-6 py-3 text-slate-600 text-xs truncate max-w-[180px]">{o.items?.[0]?.name || "—"}</td>
                  <td className="px-6 py-3 text-center font-mono text-xs text-slate-500">{o.rentalEndDate || "—"}</td>
                  <td className="px-6 py-3 text-center">
                    {o.daysRemaining !== null && o.daysRemaining < 0 ? (
                      <span className="px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold">{Math.abs(o.daysRemaining)}日超過</span>
                    ) : o.daysRemaining !== null && o.daysRemaining <= 3 ? (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold">残{o.daysRemaining}日</span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">レンタル中</span>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm">未回収データなし</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 月別比較 */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={20} className="text-indigo-500" />
            <h3 className="font-bold text-slate-800 text-base">月別比較</h3>
          </div>

          <div className="space-y-5">
            {/* 売上比較 */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">売上高</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${monthComparison.revChange >= 0 ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"}`}>
                  {monthComparison.revChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {monthComparison.revChange >= 0 ? "+" : ""}{monthComparison.revChange.toFixed(1)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">{monthComparison.thisMonthLabel}（今月）</p>
                  <p className="text-lg font-extrabold text-slate-800">{fmtYen(monthComparison.thisRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">{monthComparison.lastMonthLabel}（先月）</p>
                  <p className="text-lg font-extrabold text-slate-400">{fmtYen(monthComparison.lastRevenue)}</p>
                </div>
              </div>
            </div>

            {/* 件数比較 */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">取引件数</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${monthComparison.countChange >= 0 ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"}`}>
                  {monthComparison.countChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {monthComparison.countChange >= 0 ? "+" : ""}{monthComparison.countChange.toFixed(1)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">{monthComparison.thisMonthLabel}（今月）</p>
                  <p className="text-lg font-extrabold text-slate-800">{monthComparison.thisCount}<span className="text-sm font-bold text-slate-400 ml-1">件</span></p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">{monthComparison.lastMonthLabel}（先月）</p>
                  <p className="text-lg font-extrabold text-slate-400">{monthComparison.lastCount}<span className="text-sm font-bold text-slate-400 ml-1">件</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 売上ランキング + 人気機材 + 車両稼働 ─── */}
      <div className="grid grid-cols-3 gap-6">
        {/* 売上ランキング */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Star size={20} className="text-amber-500" />
            <h3 className="font-bold text-slate-800 text-base">売上ランキング</h3>
            <button onClick={() => go("customers")} className="ml-auto text-slate-300 hover:text-blue-600 transition-colors cursor-pointer" title="顧客管理へ"><ArrowRight size={16} /></button>
          </div>
          <div className="space-y-3">
            {topCustomers.length > 0 ? topCustomers.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold ${
                  i === 0 ? "bg-amber-100 text-amber-700" :
                  i === 1 ? "bg-slate-200 text-slate-600" :
                  i === 2 ? "bg-orange-100 text-orange-600" :
                  "bg-slate-100 text-slate-400"
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.count}件</p>
                </div>
                <span className="text-sm font-bold text-slate-700 font-mono">{fmtYen(c.total)}</span>
              </div>
            )) : (
              <div className="py-10 text-center text-sm font-medium text-slate-400">売上データがありません</div>
            )}
          </div>
        </div>

        {/* 人気機材 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={20} className="text-emerald-500" />
            <h3 className="font-bold text-slate-800 text-base">人気機材</h3>
            <button onClick={() => go("products")} className="ml-auto text-slate-300 hover:text-blue-600 transition-colors cursor-pointer" title="商品管理へ"><ArrowRight size={16} /></button>
          </div>
          <div className="space-y-3">
            {popularEquipment.length > 0 ? popularEquipment.map((eq, i) => (
              <div key={i} className="flex items-center gap-3">
                <img
                  src={eq.image}
                  alt={eq.name}
                  className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-slate-50"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{eq.name}</p>
                  <p className="text-xs text-slate-400">{eq.category}</p>
                </div>
                <span className="text-sm font-bold text-blue-600 font-mono">{eq.count}回</span>
              </div>
            )) : (
              <div className="py-10 text-center text-sm font-medium text-slate-400">レンタル実績がありません</div>
            )}
          </div>
        </div>

        {/* 車両稼働 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Truck size={20} className="text-blue-500" />
            <h3 className="font-bold text-slate-800 text-base">車両稼働</h3>
            <button onClick={() => go("vehicles")} className="ml-auto text-slate-300 hover:text-blue-600 transition-colors cursor-pointer" title="車庫管理へ"><ArrowRight size={16} /></button>
          </div>

          <div className="flex items-center justify-center mb-5">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#D2E8E6" strokeWidth="12" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="#2BA8A2" strokeWidth="12"
                  strokeDasharray={`${vehicleStatus.inUsePct * 2.51} 251.2`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-slate-800">{vehicleStatus.total}</span>
                <span className="text-xs text-slate-400 font-medium">全車両</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="font-medium text-slate-600">使用中</span>
              </div>
              <span className="font-bold text-slate-800">{vehicleStatus.inUse} 台</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="font-medium text-slate-600">空車</span>
              </div>
              <span className="font-bold text-slate-800">{vehicleStatus.idle} 台</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="font-medium text-slate-600">整備中</span>
              </div>
              <span className="font-bold text-slate-800">{vehicleStatus.maint} 台</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 在庫不足 ─── */}
      {lowStockItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <ShieldAlert size={20} className="text-red-500" />
            <h3 className="font-bold text-slate-800 text-base">在庫不足</h3>
            <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full ml-1">
              {lowStockItems.length}品目
            </span>
            <button onClick={() => go("warehouse")} className="ml-auto text-slate-300 hover:text-blue-600 transition-colors cursor-pointer" title="倉庫管理へ"><ArrowRight size={16} /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {lowStockItems.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-red-50/40 rounded-xl p-3 border border-red-100">
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-white flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.category}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-lg font-extrabold ${p.stock === 0 ? "text-red-600" : "text-amber-600"}`}>
                    {p.stock}
                  </p>
                  <p className="text-xs text-slate-400">残り</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 最近の取引 ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-6 pb-4 flex items-start justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-base">最近の取引</h3>
            <p className="text-xs text-slate-400 mt-1">最新のレンタルおよび販売アクティビティ</p>
          </div>
          <button
            onClick={() => setViewAllModal("transactions")}
            className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
          >
            すべて見る <Eye size={14} />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-100 text-slate-500">
              <th className="px-6 py-3 text-left font-bold text-xs">日付</th>
              <th className="px-6 py-3 text-left font-bold text-xs">顧客名</th>
              <th className="px-6 py-3 text-left font-bold text-xs">機材名</th>
              <th className="px-6 py-3 text-center font-bold text-xs">取引タイプ</th>
              <th className="px-6 py-3 text-right font-bold text-xs">金額</th>
              <th className="px-6 py-3 text-center font-bold text-xs w-14"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {recentOrders.length > 0 ? recentOrders.map((o) => {
              const isRental = o.items?.some((i) => i.type === "rent");
              const firstItem = o.items?.[0];
              return (
                <tr
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 font-mono text-slate-600 text-xs">{o.date}</td>
                  <td className="px-6 py-4 font-bold text-slate-800">{o.companyName || o.personName || "—"}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {firstItem?.name || "—"}
                    {(o.items?.length || 0) > 1 && (<span className="text-xs text-slate-400 ml-1">他{(o.items?.length || 0) - 1}点</span>)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {isRental
                      ? <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">レンタル</span>
                      : <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">販売</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-800 font-mono">{fmtYen(eff(o))}</td>
                  <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedOrder(o)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">取引データがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={viewAllModal === "unreturned"}
        onClose={() => setViewAllModal(null)}
        title={`未回収一覧（全${allUnreturnedOrders.length}件）`}
        width={980}
        footer={<Btn variant="secondary" onClick={() => setViewAllModal(null)}>閉じる</Btn>}
      >
        <div className="max-h-[62vh] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 z-10">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left font-bold text-xs">注文番号</th>
                <th className="px-4 py-3 text-left font-bold text-xs">顧客</th>
                <th className="px-4 py-3 text-left font-bold text-xs">機材</th>
                <th className="px-4 py-3 text-left font-bold text-xs">現場</th>
                <th className="px-4 py-3 text-center font-bold text-xs">終了日</th>
                <th className="px-4 py-3 text-center font-bold text-xs">状況</th>
                <th className="px-4 py-3 text-right font-bold text-xs">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {allUnreturnedOrders.length > 0 ? allUnreturnedOrders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono font-bold text-blue-700">{o.orderNumber || o.id}</td>
                  <td className="px-4 py-3 font-bold text-slate-800">{o.companyName || o.personName || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate">
                    {o.items?.[0]?.name || "—"}
                    {(o.items?.length || 0) > 1 && <span className="text-xs text-slate-400 ml-1">他{(o.items?.length || 0) - 1}点</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">{o.siteName || o.deliveryLocation || "—"}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs text-slate-500">{o.rentalEndDate || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {o.daysRemaining !== null && o.daysRemaining < 0 ? (
                      <span className="px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold">{Math.abs(o.daysRemaining)}日超過</span>
                    ) : o.daysRemaining !== null && o.daysRemaining <= 3 ? (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold">残{o.daysRemaining}日</span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">{o.status || "レンタル中"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{fmtYen((o as any)._effTotal ?? eff(o))}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">未回収データなし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={viewAllModal === "transactions"}
        onClose={() => setViewAllModal(null)}
        title={`最近の取引（全${allRecentOrders.length}件）`}
        width={1040}
        footer={<Btn variant="secondary" onClick={() => setViewAllModal(null)}>閉じる</Btn>}
      >
        <div className="max-h-[62vh] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 z-10">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left font-bold text-xs">日付</th>
                <th className="px-4 py-3 text-left font-bold text-xs">注文番号</th>
                <th className="px-4 py-3 text-left font-bold text-xs">顧客名</th>
                <th className="px-4 py-3 text-left font-bold text-xs">機材名</th>
                <th className="px-4 py-3 text-center font-bold text-xs">取引タイプ</th>
                <th className="px-4 py-3 text-center font-bold text-xs">状態</th>
                <th className="px-4 py-3 text-right font-bold text-xs">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {allRecentOrders.length > 0 ? allRecentOrders.map((o) => {
                const isRental = o.items?.some((i) => i.type === "rent");
                const firstItem = o.items?.[0];
                return (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedOrder(o)}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{o.date || "—"}</td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-700">{o.orderNumber || o.id}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{o.companyName || o.personName || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[240px] truncate">
                      {firstItem?.name || "—"}
                      {(o.items?.length || 0) > 1 && <span className="text-xs text-slate-400 ml-1">他{(o.items?.length || 0) - 1}点</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isRental
                        ? <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">レンタル</span>
                        : <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">販売</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">{o.status || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{fmtYen(eff(o))}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">取引データがありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Order Detail Drawer */}
      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          // 受注確定(確認済み)で出庫、返却系クローズで入庫（AdminRental と同じ在庫台帳処理）。
          const raw = (OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id)) || selectedOrder;
          const flags = stockFlagsForStatusChange(raw, status); // 稼働系への直接変更も未出庫なら出庫（二重計上防止, K7）
          // クローズ時は発生済みの延滞課金（未永続の roll-forward 分）を確定してから閉じる(M2)。
          const billingClose = closeOrderBillingPatch(raw, status);
          liveOrders.patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}), ...flags, ...billingClose });
          triggerToast("注文ステータスを更新しました", "ok");
        }}
        onUpdateOrder={(id, updates) => {
          liveOrders.patchOrder(id, updates);
          setSelectedOrder(prev => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
        }}
      />
    </div>
  );
}
