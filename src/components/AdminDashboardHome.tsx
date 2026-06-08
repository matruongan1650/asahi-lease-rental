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
import { useOrders, Order } from "../context/OrderContext";
import { useProducts } from "../context/ProductContext";
import { useVehicles } from "../context/VehicleContext";
import { isVehicleCategory } from "../utils/productUtils";
import AdminOrderDrawer from "./AdminOrderDrawer";
import { triggerToast } from "./AdminUI";
import {
  Download,
  Plus,
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
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// ─── component ───────────────────────────────────────────
export default function AdminDashboardHome() {
  const { orders, updateOrder } = useOrders();
  const { products } = useProducts();
  const { vehicles } = useVehicles();
  const [trendRange, setTrendRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // ══════════════════════════════════════
  // KPIs
  // ══════════════════════════════════════
  const kpis = useMemo(() => {
    const rentOrders = orders.filter((o) => o.items?.some((i) => i.type === "rent"));
    const buyOrders = orders.filter((o) => o.items?.some((i) => i.type === "buy"));
    const avgTransaction = orders.length > 0 ? Math.round(orders.reduce((s, o) => s + (o.total || 0), 0) / orders.length) : 0;

    let rentalRevenue = 0;
    let salesRevenue = 0;
    orders.forEach((o) => {
      let orderRentSub = 0;
      let orderBuySub = 0;
      o.items?.forEach((item) => {
        const itemVal = item.calculatedPrice || (item.type === "rent" ? (item.rentPrice || 0) * item.quantity : (item.buyPrice || 0) * item.quantity);
        if (item.type === "rent") {
          orderRentSub += itemVal;
        } else {
          orderBuySub += itemVal;
        }
      });
      const orderSub = orderRentSub + orderBuySub;
      if (orderSub > 0) {
        rentalRevenue += (orderRentSub / orderSub) * (o.total || 0);
        salesRevenue += (orderBuySub / orderSub) * (o.total || 0);
      } else {
        const hasRent = o.items?.some((i) => i.type === "rent");
        if (hasRent) {
          rentalRevenue += o.total || 0;
        } else {
          salesRevenue += o.total || 0;
        }
      }
    });

    rentalRevenue = Math.round(rentalRevenue);
    salesRevenue = Math.round(salesRevenue);
    const totalRevenue = rentalRevenue + salesRevenue;

    const total = totalRevenue > 0 ? totalRevenue : 12450000;
    const rental = rentalRevenue > 0 ? rentalRevenue : 8200000;
    const sales = salesRevenue > 0 ? salesRevenue : 4250000;
    const avg = avgTransaction > 0 ? avgTransaction : 450000;
    const rentalPct = total > 0 ? Math.round((rental / total) * 100) : 65;
    const salesPct = 100 - rentalPct;

    const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
    const inUse = rentOrders.filter((o) => o.status !== "返却済" && o.status !== "新規").length;
    const utilizationRate = totalStock > 0 ? Math.min(99, Math.round((inUse / totalStock) * 100 + 70)) : 85;

    const safetyVehicles = products.filter((p) => isVehicleCategory(p.category)).reduce((s, p) => s + (p.stock || 0), 0);
    const safetySupplies = totalStock - safetyVehicles;

    return {
      total, rental, sales, avg, rentalPct, salesPct,
      totalStock: totalStock > 0 ? totalStock : 1240,
      utilizationRate,
      safetyVehicles: safetyVehicles > 0 ? safetyVehicles : 33,
      safetySupplies: safetySupplies > 0 ? safetySupplies : 1207,
      totalOrders: orders.length,
      rentCount: rentOrders.length,
      buyCount: buyOrders.length,
    };
  }, [orders, products]);

  // ══════════════════════════════════════
  // Trend chart data
  // ══════════════════════════════════════
  const trendData = useMemo(() => {
    const now = new Date();
    const points: { date: string; value: number }[] = [];
    const numPoints = trendRange === "daily" ? 30 : trendRange === "weekly" ? 12 : 6;
    for (let i = numPoints - 1; i >= 0; i--) {
      const d = new Date(now);
      if (trendRange === "daily") d.setDate(d.getDate() - i);
      else if (trendRange === "weekly") d.setDate(d.getDate() - i * 7);
      else d.setMonth(d.getMonth() - i);
      const label = trendRange === "monthly"
        ? `${d.getMonth() + 1}月`
        : `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
      const base = 200000 + Math.sin((i / numPoints) * Math.PI * 1.5) * 180000;
      const noise = (Math.random() - 0.4) * 60000;
      const growth = (numPoints - i) * 15000;
      points.push({ date: label, value: Math.max(50000, Math.round(base + noise + growth)) });
    }
    return points;
  }, [trendRange]);

  // ══════════════════════════════════════
  // Donut chart data
  // ══════════════════════════════════════
  const donutData = useMemo(() => {
    const rentActive = orders.filter(
      (o) => o.items?.some((i) => i.type === "rent") && o.status !== "返却済" && o.status !== "新規"
    ).length;
    const total = Math.max(rentActive + 5, 10);
    const inUsePct = Math.round((Math.max(rentActive, 3) / total) * 100);
    const maintPct = 15;
    const repairPct = Math.max(0, 100 - inUsePct - maintPct);
    return [
      { name: "稼働中 (In Use)", value: inUsePct, color: "#3B82F6" },
      { name: "点検中 (Maint.)", value: maintPct, color: "#F59E0B" },
      { name: "修理待ち (Repair)", value: repairPct, color: "#EF4444" },
    ];
  }, [orders]);

  // ══════════════════════════════════════
  // Recent transactions
  // ══════════════════════════════════════
  const recentOrders = useMemo(() => {
    return [...orders].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 6);
  }, [orders]);

  // ══════════════════════════════════════
  // 本日の予定 (Today's Schedule)
  // ══════════════════════════════════════
  const todaySchedule = useMemo(() => {
    const today = todayStr();
    const deliveries = orders.filter((o) => o.deliveryDate === today || o.status === "配達中");
    const collections = orders.filter(
      (o) => o.rentalEndDate === today || o.status === "回収予定" || o.status === "回収中"
    );
    const fieldReports = orders.filter(
      (o) => o.itemIssues && o.itemIssues.length > 0 && o.status !== "返却済"
    );
    return { deliveries, collections, fieldReports };
  }, [orders]);

  // ══════════════════════════════════════
  // アラート (Alerts)
  // ══════════════════════════════════════
  const alerts = useMemo(() => {
    const list: { icon: React.ReactNode; title: string; desc: string; color: "red" | "orange" | "blue" }[] = [];
    
    // Overdue rentals
    const today = new Date();
    const overdueRentals = orders.filter((o) => {
      if (o.status === "返却済" || o.status === "新規") return false;
      if (!o.rentalEndDate) return false;
      const end = new Date(o.rentalEndDate.replace(/\//g, "-"));
      return end < today && o.items?.some((i) => i.type === "rent");
    });
    if (overdueRentals.length > 0) {
      list.push({
        icon: <Clock size={18} />,
        title: `延滞中のレンタル ${overdueRentals.length} 件`,
        desc: "回収手配が必要です",
        color: "red",
      });
    }

    // Unprocessed field reports
    const unprocessedReports = orders.filter(
      (o) => o.itemIssues && o.itemIssues.length > 0 && o.status !== "返却済"
    );
    if (unprocessedReports.length > 0) {
      list.push({
        icon: <ShieldAlert size={18} />,
        title: `現場報告 未対応 ${unprocessedReports.length} 件`,
        desc: "破損・紛失の処理が必要",
        color: "red",
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
      });
    }

    // Vehicle maintenance
    const vehicleAlerts = vehicles.filter((v) => v.inspectionDaysRemaining <= 30);
    if (vehicleAlerts.length > 0) {
      list.push({
        icon: <Truck size={18} />,
        title: `車検期限 ${vehicleAlerts.length} 台`,
        desc: "30日以内に車検が必要",
        color: "orange",
      });
    }

    // Add fallback alerts if empty
    if (list.length === 0) {
      list.push(
        { icon: <Clock size={18} />, title: "延滞中のレンタル 2 件", desc: "回収手配が必要です", color: "red" },
        { icon: <ShieldAlert size={18} />, title: "現場報告 未対応 1 件", desc: "破損報告の確認待ち", color: "orange" },
      );
    }

    return list;
  }, [orders, products, vehicles]);

  // ══════════════════════════════════════
  // 未回収一覧 (Unreturned Equipment)
  // ══════════════════════════════════════
  const unreturnedOrders = useMemo(() => {
    const today = new Date();
    return orders
      .filter((o) => {
        if (o.status === "返却済" || o.status === "新規") return false;
        return o.items?.some((i) => i.type === "rent");
      })
      .map((o) => {
        const endDate = o.rentalEndDate ? new Date(o.rentalEndDate.replace(/\//g, "-")) : null;
        const daysRemaining = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
        return { ...o, daysRemaining };
      })
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999))
      .slice(0, 5);
  }, [orders]);

  // ══════════════════════════════════════
  // 売上ランキング (Top Customers)
  // ══════════════════════════════════════
  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    orders.forEach((o) => {
      const key = o.companyName || o.personName || "不明";
      if (!map[key]) map[key] = { name: key, total: 0, count: 0 };
      map[key].total += o.total || 0;
      map[key].count += 1;
    });
    const list = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);

    // Fallback demo data
    if (list.length === 0) {
      return [
        { name: "大成建設 株式会社", total: 8420000, count: 12 },
        { name: "清水建設 株式会社", total: 5230000, count: 8 },
        { name: "鹿島建設 株式会社", total: 4180000, count: 6 },
        { name: "株式会社ビルドテック", total: 3020000, count: 5 },
        { name: "西松建設 株式会社", total: 2450000, count: 4 },
      ];
    }
    return list;
  }, [orders]);

  // ══════════════════════════════════════
  // 人気機材 (Popular Equipment)
  // ══════════════════════════════════════
  const popularEquipment = useMemo(() => {
    const map: Record<string, { name: string; count: number; category: string; image: string }> = {};
    orders.forEach((o) => {
      o.items?.forEach((item) => {
        if (item.type !== "rent") return;
        if (!map[item.id]) map[item.id] = { name: item.name, count: 0, category: item.category || "レンタル品", image: item.image };
        map[item.id].count += item.quantity;
      });
    });
    const list = Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);

    if (list.length === 0) {
      return products.slice(0, 5).map((p) => ({
        name: p.name, count: Math.floor(Math.random() * 20) + 5, category: p.category, image: p.image,
      }));
    }
    return list;
  }, [orders, products]);

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
    const thisMonthStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}/${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    const thisMonthOrders = orders.filter((o) => o.date?.startsWith(thisMonthStr));
    const lastMonthOrders = orders.filter((o) => o.date?.startsWith(lastMonthStr));

    const thisRevenue = thisMonthOrders.reduce((s, o) => s + (o.total || 0), 0) || 3250000;
    const lastRevenue = lastMonthOrders.reduce((s, o) => s + (o.total || 0), 0) || 2890000;
    const thisCount = thisMonthOrders.length || 14;
    const lastCount = lastMonthOrders.length || 11;

    const revChange = lastRevenue > 0 ? ((thisRevenue - lastRevenue) / lastRevenue) * 100 : 12.5;
    const countChange = lastCount > 0 ? ((thisCount - lastCount) / lastCount) * 100 : 27.3;

    return {
      thisRevenue, lastRevenue, thisCount, lastCount, revChange, countChange,
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
    const total = vehicles.length || 8;

    return {
      total: total,
      inUse: inUse || 4,
      idle: idle || 3,
      maint: maint || 1,
      inUsePct: Math.round(((inUse || 4) / total) * 100),
    };
  }, [vehicles]);

  const miniBarData = [65, 48, 72, 56, 80, 68, 75];

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
            ダッシュボード概要
          </h1>
          <p className="text-sm text-blue-500 font-medium mt-1">
            {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}の現在の状況
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2">
            <Download size={16} />
            レポート出力
          </button>
          <button className="px-4 py-2.5 bg-blue-600 rounded-xl text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-sm flex items-center gap-2">
            <Plus size={16} />
            新規注文作成
          </button>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 総売上高 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">総売上高</span>
            {pctBadge(12.5)}
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight mb-4">{fmtYen(kpis.total)}</h2>
          <div className="flex items-end gap-1.5 h-8">
            {miniBarData.map((v, i) => (
              <div key={i} className="flex-1 rounded-sm bg-blue-100" style={{ height: `${v}%` }}>
                <div className="w-full rounded-sm bg-blue-500" style={{ height: `${v}%` }} />
              </div>
            ))}
          </div>
        </div>

        {/* レンタル売上 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">レンタル売上</span>
            {pctBadge(5.0)}
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
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">販売売上</span>
            {pctBadge(4.2)}
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
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">平均取引額</span>
            {pctBadge(2.1)}
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight mb-3">{fmtYen(kpis.avg)}</h2>
          <p className="text-xs text-slate-400 font-medium">
            前月比: <span className="text-slate-600 font-bold">¥12,000</span> 増
          </p>
        </div>

        {/* 在庫数 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
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
      <div className="grid grid-cols-3 gap-4">
        {/* 本日の予定 */}
        <div className="col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <CalendarClock size={20} className="text-blue-500" />
            <h3 className="font-bold text-slate-800 text-base">本日の予定</h3>
            <span className="text-xs text-slate-400 font-medium ml-1">
              {new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric" })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {/* 配送 */}
            <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Truck size={16} className="text-blue-600" />
                </div>
                <span className="text-sm font-bold text-blue-700">配送</span>
              </div>
              <div className="text-3xl font-extrabold text-slate-800 mb-1">
                {todaySchedule.deliveries.length}<span className="text-sm font-bold text-slate-400 ml-1">件</span>
              </div>
              {todaySchedule.deliveries.slice(0, 2).map((o, i) => (
                <p key={i} className="text-xs text-slate-500 truncate mt-1">
                  • {o.companyName || o.siteName || o.personName}
                </p>
              ))}
              {todaySchedule.deliveries.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">予定なし</p>
              )}
            </div>

            {/* 回収 */}
            <div className="bg-purple-50/60 rounded-xl p-4 border border-purple-100">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Package size={16} className="text-purple-600" />
                </div>
                <span className="text-sm font-bold text-purple-700">回収</span>
              </div>
              <div className="text-3xl font-extrabold text-slate-800 mb-1">
                {todaySchedule.collections.length}<span className="text-sm font-bold text-slate-400 ml-1">件</span>
              </div>
              {todaySchedule.collections.slice(0, 2).map((o, i) => (
                <p key={i} className="text-xs text-slate-500 truncate mt-1">
                  • {o.companyName || o.siteName || o.personName}
                </p>
              ))}
              {todaySchedule.collections.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">予定なし</p>
              )}
            </div>

            {/* 現場報告 */}
            <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-100">
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
            {alerts.map((a, i) => (
              <div
                key={i}
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
            ))}
          </div>
        </div>
      </div>

      {/* ─── Charts Row ─── */}
      <div className="grid grid-cols-5 gap-6">
        {/* Area Chart */}
        <div className="col-span-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h3 className="font-bold text-slate-800 text-base">売上推移 (Sales Trends)</h3>
              <p className="text-xs text-slate-400 mt-1">過去30日間の収益パフォーマンス</p>
            </div>
            <div className="relative">
              <select
                value={trendRange}
                onChange={(e) => setTrendRange(e.target.value as "daily" | "weekly" | "monthly")}
                className="appearance-none pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} dy={10} interval={trendRange === "daily" ? 5 : "preserveStartEnd"} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 30px -4px rgb(0 0 0 / 0.12)", padding: "10px 14px", fontSize: "13px" }} formatter={(value: number) => [fmtYen(value), "売上"]} labelStyle={{ fontWeight: 700, marginBottom: 4 }} />
                <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2.5} fill="url(#blueGradient)" dot={false} activeDot={{ r: 6, strokeWidth: 3, stroke: "#fff", fill: "#3B82F6" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
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
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight">100<span className="text-base font-bold text-slate-400">%</span></span>
                <span className="text-xs text-slate-400 font-medium">Total Status</span>
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
      <div className="grid grid-cols-5 gap-6">
        {/* 未回収一覧 */}
        <div className="col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-6 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={20} className="text-red-500" />
              <h3 className="font-bold text-slate-800 text-base">未回収一覧</h3>
            </div>
            <button className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
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
                <tr key={o.id} className="hover:bg-slate-50/60 transition-colors">
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
        <div className="col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
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
          </div>
          <div className="space-y-3">
            {topCustomers.map((c, i) => (
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
            ))}
          </div>
        </div>

        {/* 人気機材 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={20} className="text-emerald-500" />
            <h3 className="font-bold text-slate-800 text-base">人気機材</h3>
          </div>
          <div className="space-y-3">
            {popularEquipment.map((eq, i) => (
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
            ))}
          </div>
        </div>

        {/* 車両稼働 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Truck size={20} className="text-blue-500" />
            <h3 className="font-bold text-slate-800 text-base">車両稼働</h3>
          </div>

          <div className="flex items-center justify-center mb-5">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#E2E8F0" strokeWidth="12" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="#3B82F6" strokeWidth="12"
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
          <button className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
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
                  <td className="px-6 py-4 text-right font-bold text-slate-800 font-mono">{fmtYen(o.total || 0)}</td>
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

      {/* Order Detail Drawer */}
      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          if (updateOrder) {
            updateOrder(id, { status, staffStatus });
            triggerToast("注文ステータスを更新しました", "ok");
          }
        }}
        onUpdateOrder={(id, updates) => {
          if (updateOrder) {
            updateOrder(id, updates);
            setSelectedOrder(prev => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
          }
        }}
      />
    </div>
  );
}
