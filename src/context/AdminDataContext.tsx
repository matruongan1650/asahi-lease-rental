import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import OrderBus, { type BusRecord, type AdminDerivedData, deriveAdminData } from "../lib/orderBus";
import { COLLECTIONS_MOCK_DATA, B2B_MOCK_ORDERS, KPIS } from "../data/adminMockData";
import { pushOrder as pushFirebaseOrder, patchOrder as patchFirebaseOrder, subscribeOrders } from "../lib/firebase";

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
    "maintenance",
    "customers",
    "suppliers",
    "vendors",
    "fieldReports",
    "vehicles"
  ];

  // 1. Subscribe to orders via Firebase
  useEffect(() => {
    const unsubscribe = subscribeOrders((firebaseOrders) => {
      setRaw(firebaseOrders);
      setConnected(true);
      // Keep OrderBus in sync
      OrderBus.setAll("orders", firebaseOrders as any);
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
    if (raw.length > 0) {
      setDerived(deriveAdminData(raw as BusRecord[]));
    }
  }, [raw]);

  const hasCheckedSeeding = useRef(false);

  // 4. Auto-seed missing B2B orders on startup (single run, chunked to avoid browser lockup)
  useEffect(() => {
    if (connected && !hasCheckedSeeding.current) {
      hasCheckedSeeding.current = true;
      
      const existingNumbers = raw.map(o => o.orderNumber);
      const missingOrders = B2B_MOCK_ORDERS.filter(o => !existingNumbers.includes(o.orderNumber));
      
      if (missingOrders.length > 0) {
        console.log(`[AdminDataProvider] Auto-seeding ${missingOrders.length} missing B2B orders...`);
        const seedOrders = async () => {
          const chunkSize = 5;
          for (let i = 0; i < missingOrders.length; i += chunkSize) {
            const chunk = missingOrders.slice(i, i + chunkSize);
            await Promise.all(
              chunk.map(ord => 
                pushFirebaseOrder(ord as any).catch(err => 
                  console.error("Auto-seeding error:", ord.orderNumber, err)
                )
              )
            );
          }
          console.log("[AdminDataProvider] Auto-seeding completed.");
        };
        seedOrders();
      }
    }
  }, [connected]);

  const patchOrder = (id: string, updates: Record<string, any>) => {
    OrderBus.patch("orders", id, updates);
    const ordersList = OrderBus.getAll<any>("orders");
    const targetOrder = ordersList.find(o => o.id === id || o.firestoreId === id);
    if (targetOrder && targetOrder.firestoreId) {
      patchFirebaseOrder(targetOrder.firestoreId, updates).catch(err => {
        console.warn("Failed to patch order in Firebase from admin:", err);
      });
    }
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

    // Also seed B2B orders to Firebase if they don't exist in current raw list
    try {
      const existingNumbers = raw.map(o => o.orderNumber);
      const ordersToSeed = B2B_MOCK_ORDERS.filter(o => !existingNumbers.includes(o.orderNumber));
      if (ordersToSeed.length > 0) {
        console.log(`[AdminDataContext] Seeding ${ordersToSeed.length} B2B orders to Firebase...`);
        for (const ord of ordersToSeed) {
          await pushFirebaseOrder(ord as any);
        }
        results.push({ name: "orders", seeded: ordersToSeed.length, skipped: false });
      } else {
        results.push({ name: "orders", seeded: 0, skipped: true });
      }
    } catch (err) {
      console.error("[AdminDataContext] Error seeding B2B orders:", err);
      results.push({ name: "orders", seeded: 0, skipped: false, error: String(err) });
    }

    return results;
  };

  const getCol = (name: string) => {
    const live = cols[name];
    if (live && live.length > 0) {
      return { rows: live, live: true };
    }
    return { rows: COLLECTIONS_MOCK_DATA[name] || [], live: false };
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
      orders: [],
      rentals: COLLECTIONS_MOCK_DATA.rentals || [],
      sales: COLLECTIONS_MOCK_DATA.sales || [],
      recentTx: COLLECTIONS_MOCK_DATA.recentTx || [],
      kpis: {
        totalSales: KPIS.totalSales,
        rentalSales: KPIS.rentalSales,
        productSales: KPIS.productSales,
        totalSalesDelta: KPIS.totalSalesDelta,
        rentalSalesDelta: KPIS.rentalSalesDelta,
        productSalesDelta: KPIS.productSalesDelta,
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
      status: mapStatus(o.staffStatus || o.status),
      invoice: "INV-R-" + (o.orderNumber || "").replace(/\D/g, "").slice(-4),
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
      invoice: "INV-S-" + (o.orderNumber || "").replace(/\D/g, "").slice(-4),
    })),
    recentTx: d.recentTx,
    kpis: {
      totalSales: d.totalSales || KPIS.totalSales,
      rentalSales: d.rentalSales || KPIS.rentalSales,
      productSales: d.productSales || KPIS.productSales,
      totalSalesDelta: KPIS.totalSalesDelta,
      rentalSalesDelta: KPIS.rentalSalesDelta,
      productSalesDelta: KPIS.productSalesDelta,
    },
    patchOrder: ctx.patchOrder,
  };
}
