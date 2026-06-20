import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import OrderBus, { type BusRecord, type AdminDerivedData, deriveAdminData } from "../lib/orderBus";
import { COLLECTIONS_MOCK_DATA } from "../data/adminMockData";

interface AdminDataContextProps {
  raw: any[];
  derived: AdminDerivedData | null;
  connected: boolean;
  patchOrder: (id: string, updates: Record<string, any>) => void;
  cols: Record<string, any[]>;
  seedAll: () => Promise<any[]>;
  getCol: (name: string) => { rows: any[]; live: boolean };
}

const AdminDataContext = createContext<AdminDataContextProps | null>(null);

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<any[]>([]);
  const [derived, setDerived] = useState<AdminDerivedData | null>(null);
  const [connected, setConnected] = useState(false);
  const [cols, setCols] = useState<Record<string, any[]>>({});

  const COLLECTIONS = [
    "products",
    "assets",
    "warehouse",
    "stocktake",
    "stockIn",
    "stockOut",
    "repairs",
    "purchaseOrders",
    "maintenance",
    "customers",
    "suppliers",
    "vendors",
    "fieldReports",
    "vehicles",
    "walkinReturns",
    "returnInspections",
    "roles",
    "systemSettings"
  ];

  // 1. Subscribe to orders via the shared XServer/API-backed OrderBus.
  // Staff APK writes delivery/recovery results to /api/store, so admin reads
  // the same XServer source.
  useEffect(() => {
    const unsubscribe = OrderBus.subscribe("orders", (rows) => {
      setRaw(rows);
      setConnected(true);
    });
    return unsubscribe;
  }, []);

  // 2. Subscribe to all extra collections via OrderBus
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    COLLECTIONS.forEach((name) => {
      const unsub = OrderBus.subscribe(name as any, (rows) => {
        setCols((prev) => ({ ...prev, [name]: rows }));
      });
      unsubs.push(unsub);
    });
    return () => unsubs.forEach((u) => u && u());
  }, []);

  // 3. Compute derived admin data whenever raw orders change
  useEffect(() => {
    if (connected) {
      setDerived(deriveAdminData(raw as BusRecord[]));
    }
  }, [raw, connected]);

  const hasCheckedSeeding = useRef(false);

  // 4. Auto-seeding is disabled: orders come only from real XServer data.
  useEffect(() => {
    // 削除：自動でモック注文データをDBに追加しないようにする。
  }, [connected]);

  const patchOrder = (id: string, updates: Record<string, any>) => {
    OrderBus.patch("orders", id, updates);
  };

  // Seed all collections from mock dataset (idempotent)
  const seedAll = async () => {
    const results: any[] = [];
    for (const [name, mockData] of Object.entries(COLLECTIONS_MOCK_DATA)) {
      if (Array.isArray(mockData)) {
        const count = OrderBus.seedIfEmpty(name as any, mockData);
        results.push({ name, seeded: count, skipped: count === 0 });
      }
    }

    // モック注文の seed は廃止（注文は実際の発注からのみ作成される）。
    results.push({ name: "orders", seeded: 0, skipped: true });

    return results;
  };

  const getCol = (name: string) => {
    const live = cols[name];
    if (live !== undefined) {
      return { rows: live, live: true };
    }
    // モックへのフォールバックは廃止 — 実データが無ければ空表示にする。
    return { rows: [], live: false };
  };

  return (
    <AdminDataContext.Provider
      value={{
        raw,
        derived,
        connected,
        patchOrder,
        cols,
        seedAll,
        getCol,
      }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) {
    throw new Error("useAdminData must be used within an AdminDataProvider");
  }
  return ctx;
}

export function useAdminCollection(name: string) {
  const ctx = useAdminData();
  return ctx.getCol(name);
}

// Hook to merge live orders/rentals/sales into dashboard props
export function useAdminOrders() {
  const ctx = useAdminData();
  const d = ctx.derived;

  if (!d) {
    return {
      live: false,
      orders: [] as any[],
      rentals: [] as any[],
      sales: [] as any[],
      recentTx: [] as any[],
      kpis: {
        totalSales: 0,
        rentalSales: 0,
        productSales: 0,
        totalSalesDelta: 0,
        rentalSalesDelta: 0,
        productSalesDelta: 0,
      },
      patchOrder: ctx.patchOrder,
    };
  }

  const mapStatus = (s: string) => {
    if (!s) return "処理中";
    if (["注文確認中"].includes(s)) return "進行中";
    if (["配送済み", "完了", "returned"].includes(s)) return "完了";
    if (["キャンセル"].includes(s)) return "キャンセル";
    return s;
  };

  return {
    live: true,
    orders: d.orders,
    rentals: d.rentals.map((o) => ({
      id: o.orderNumber,
      firestoreId: o.firestoreId || o.id,
      customer: o.customer,
      site: o.site,
      date: o.date,
      start: o.rentalStart?.replace(/-/g, "/") || "—",
      end: o.rentalEnd?.replace(/-/g, "/") || "—",
      items: (o.items || []).length,
      amount: o.total,
      // 稼働中・返却・検品系のステータスは注文ステータスを優先表示（配送完了などの staffStatus で上書きしない）。
      // ※「レンタル中」を保持しないと回収手配(AdminRecovery)に出てこなくなる。
      status: ["レンタル中", "進行中", "延滞", "返却済", "返却済み", "一部返却", "検品待ち", "完了", "キャンセル"].includes(o.status as string)
        ? (o.status as string)
        : mapStatus(o.staffStatus || o.status),
      returnRequestType: o.returnRequestType,
      invoice: "INV-R-" + (o.orderNumber || "").replace(/\D/g, "").slice(-6),
    })),
    sales: d.sales.map((o) => ({
      id: o.orderNumber,
      firestoreId: o.firestoreId || o.id,
      customer: o.customer,
      site: o.site,
      date: typeof o.date === "string" ? o.date.split("•")[0]?.trim() : "—",
      items: (o.items || []).length,
      amount: o.total,
      status: mapStatus(o.status),
      invoice: "INV-S-" + (o.orderNumber || "").replace(/\D/g, "").slice(-6),
    })),
    recentTx: d.recentTx,
    kpis: {
      totalSales: d.totalSales || 0,
      rentalSales: d.rentalSales || 0,
      productSales: d.productSales || 0,
      totalSalesDelta: 0,
      rentalSalesDelta: 0,
      productSalesDelta: 0,
    },
    patchOrder: ctx.patchOrder,
  };
}
