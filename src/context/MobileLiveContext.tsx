import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import OrderBus from "../lib/orderBus";
import { patchOrder } from "../lib/firebase";

// ---------------------------------------------------------------------------
// Mock Data (matching project reference)
// ---------------------------------------------------------------------------

export const STAFF = {
  haisou:  { name: "ミン トゥアン", role: "配送ドライバー", team: "東京第一配送センター", id: "DRV-204" },
  kaishu:  { name: "ミン トゥアン", role: "回収ドライバー", team: "東京第一配送センター", id: "DRV-204" },
  souko:   { name: "佐藤 健一", role: "倉庫スタッフ", team: "東京中央倉庫", id: "WHS-118" },
};

export const DELIVERIES = [
  {
    id: "DLV-20614", window: "09:00–10:00", priority: "通常",
    company: "大成建設 株式会社", site: "品川駅前再開発 B工区",
    addr: "東京都港区港南2-15-3", dist: "4.2km", eta: "12分",
    phone: "03-5479-1200", contact: "現場監督 田中様",
    items: [
      { name: "レボリューションコーン赤白", qty: 40, icon: "cone" },
      { name: "コーンバー黒/黄", qty: 20, icon: "minus" },
      { name: "LED投光器 充電式", qty: 12, icon: "package" },
      { name: "セフティフラッシュ", qty: 6, icon: "flag" },
    ],
    note: "搬入口は南側ゲート。10時以降は車両進入不可のため厳守。",
    status: "未着手",
  },
  {
    id: "DLV-20617", window: "10:30–11:30", priority: "急ぎ",
    company: "清水建設 株式会社", site: "豊洲スマートシティ C街区",
    addr: "東京都江東区豊洲6-4-1", dist: "8.7km", eta: "21分",
    phone: "03-3402-8855", contact: "工事課 鈴木様",
    items: [
      { name: "ガードフェンス", qty: 24, icon: "shield" },
      { name: "ウェイト 10kg", qty: 30, icon: "weight" },
      { name: "LED保安灯", qty: 18, icon: "sun" },
    ],
    note: "搬入時に検収印が必要。受領書を忘れずに。",
    status: "未着手",
  },
  {
    id: "DLV-20620", window: "13:00–14:00", priority: "通常",
    company: "鹿島建設 株式会社", site: "新宿西口駅前広場改修",
    addr: "東京都新宿区西新宿1-1", dist: "11.3km", eta: "28分",
    phone: "03-6388-4100", contact: "安全管理 高橋様",
    items: [
      { name: "樹脂製バリケード", qty: 16, icon: "package" },
      { name: "矢印板", qty: 8, icon: "navigation" },
      { name: "注意看板", qty: 10, icon: "alert" },
    ],
    note: "",
    status: "未着手",
  },
];

export const RECOVERIES = [
  {
    id: "RTN-31188", window: "14:30–15:30",
    company: "戸田建設 株式会社", site: "渋谷桜丘口地区再開発",
    addr: "東京都渋谷区桜丘町1-2", dist: "6.5km", eta: "16分",
    phone: "03-3433-7800", contact: "現場監督 伊藤様",
    note: "雨天により一部製品に泥汚れあり。確認のうえ回収。",
    products: [
      { id: "P-1001", qr: "AS-CONE-1001", name: "レボリューションコーン赤白", expected: 40, icon: "cone" },
      { id: "P-1002", qr: "AS-BAR-2200",  name: "コーンバー黒/黄", expected: 20, icon: "minus" },
      { id: "P-1003", qr: "AS-TANK-3010", name: "ガードフェンス", expected: 12, icon: "shield" },
      { id: "P-1004", qr: "AS-SIGN-4055", name: "セフティフラッシュ", expected: 6, icon: "flag" },
      { id: "P-1005", qr: "AS-LED-5120",  name: "LED保安灯", expected: 8, icon: "sun" },
    ],
  },
  {
    id: "RTN-31192", window: "16:00–17:00",
    company: "前田建設工業 株式会社", site: "池袋東口商業ビル新築",
    addr: "東京都豊島区南池袋1-28", dist: "9.1km", eta: "23分",
    phone: "03-5949-2300", contact: "工事課 渡辺様",
    note: "",
    products: [
      { id: "P-2001", qr: "AS-FENCE-6001", name: "ガードフェンス", expected: 24, icon: "shield" },
      { id: "P-2002", qr: "AS-WEIGHT-700", name: "ウェイト 10kg", expected: 30, icon: "weight" },
      { id: "P-2003", qr: "AS-ARROW-8030", name: "矢印板", expected: 8, icon: "navigation" },
    ],
  },
];

// 車両（vehicles）・メンテナンス（maintenance）はモックを使わず、実データ（OrderBus / admin 管理）のみを使用する。

export const STOCK_MOVES = [
  { id: "IN-7781",  type: "入庫", item: "レボリューションコーン赤白", qty: 120, time: "08:12", ref: "RTN-31170 回収分", icon: "cone" },
  { id: "OUT-9920", type: "出庫", item: "ガードフェンス",   qty: 24,  time: "08:40", ref: "DLV-20617 配送分", icon: "shield" },
  { id: "IN-7783",  type: "入庫", item: "LED保安灯",        qty: 32,  time: "09:05", ref: "RTN-31175 回収分", icon: "sun" },
  { id: "OUT-9925", type: "出庫", item: "単管バリケード",   qty: 12,  time: "09:20", ref: "DLV-20614 配送分", icon: "package" },
];

export const WALKIN_RETURNS = [
  {
    id: "WIN-44021", time: "10:20 受付",
    company: "東急建設 株式会社", contact: "資材課 中村様",
    rentalNo: "RN-7781", note: "レンタル期間：5/2〜6/1。お客様が直接来庫。",
    products: [
      { id: "W-1", qr: "AS-CONE-1001", name: "レボリューションコーン赤白", expected: 30, icon: "cone" },
      { id: "W-2", qr: "AS-BAR-2200",  name: "コーンバー黒/黄", expected: 15, icon: "minus" },
      { id: "W-3", qr: "AS-FENCE-6001", name: "ガードフェンス", expected: 10, icon: "shield" },
      { id: "W-4", qr: "AS-LED-5120",  name: "LED保安灯", expected: 6, icon: "sun" },
    ],
  },
  {
    id: "WIN-44025", time: "11:05 受付",
    company: "西松建設 株式会社", contact: "工務 小林様",
    rentalNo: "RN-7795", note: "",
    products: [
      { id: "V-1", qr: "AS-SIGN-4055", name: "注意看板", expected: 8, icon: "flag" },
      { id: "V-2", qr: "AS-WEIGHT-700", name: "ウェイト 10kg", expected: 20, icon: "weight" },
      { id: "V-3", qr: "AS-ARROW-8030", name: "矢印板", expected: 5, icon: "navigation" },
    ],
  },
];

// Helper to count countdown days from 2026/06/02
export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const t = new Date(2026, 5, 2).getTime();
  const [y, m, d] = dateStr.split("/").map(Number);
  const expiry = new Date(y, m - 1, d).getTime();
  return Math.round((expiry - t) / 86400000);
}

// ---------------------------------------------------------------------------
// Context Implementation
// ---------------------------------------------------------------------------

interface MobileLiveContextProps {
  connected: boolean;
  liveDeliveries: any[];
  liveRecoveries: any[];
  completeDelivery: (id: string, signature?: string | null, photos?: any[]) => void;
  completeRecovery: (id: string, signature?: string | null, photos?: any[]) => void;
  vehicles: any[];
  recordVehicleShaken: (plate: string, updates: any) => void;
  products: any[];
  findProductByName: (name: string) => any;
  adjustStock: (firestoreId: string, delta: number) => void;
  setStock: (firestoreId: string, value: number) => void;
  maint: any[];
  walkin: any[];
  stockMoves: any[];
  recordMaintenance: (id: string, updates: any) => void;
  addStockMove: (type: string, details: { item: string; qty: number; ref?: string; icon?: string }) => void;
  pushFieldReports: (reports: any[]) => void;
}

const MobileLiveContext = createContext<MobileLiveContextProps | null>(null);

export function MobileLiveProvider({ children }: { children: React.ReactNode }) {
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [maint, setMaint] = useState<any[]>([]);
  const [walkin, setWalkin] = useState<any[]>([]);
  const [stockInRows, setStockIn] = useState<any[]>([]);
  const [stockOutRows, setStockOut] = useState<any[]>([]);

  // Subscriptions & Seeding
  useEffect(() => {
    // Orders subscription
    const unsubOrders = OrderBus.subscribe("orders", (ordersList) => {
      setRawOrders(ordersList);
      setConnected(true);
    });

    // Products subscription
    const unsubProducts = OrderBus.subscribe("products", (rows) => {
      if (rows.length) setProducts(rows);
    });

    // 車両は実データのみ（admin の車庫管理で登録されたもの）。モックは seed しない。
    const unsubVehicles = OrderBus.subscribe("vehicles", (rows) => {
      setVehicles(rows);
    });

    // メンテナンスは実データのみ（admin で登録されたもの）。モックは seed しない。
    const unsubMaint = OrderBus.subscribe("maintenance", (rows) => {
      setMaint(rows);
    });

    // 持込返却は実データのみ（顧客の一部返却で作成された walkinReturns）。モックは seed しない。
    // 追加・削除の両方を反映するため常に setWalkin する。
    const unsubWalkin = OrderBus.subscribe("walkinReturns", (rows) => {
      setWalkin(rows);
    });

    // Stock moves subscription
    const unsubStockIn = OrderBus.subscribe("stockIn", setStockIn);
    const unsubStockOut = OrderBus.subscribe("stockOut", setStockOut);

    return () => {
      unsubOrders();
      unsubProducts();
      unsubVehicles();
      unsubMaint();
      unsubWalkin();
      unsubStockIn();
      unsubStockOut();
    };
  }, []);

  // Derive Deliveries
  // 配送タスクは実データ（実際の注文）のみから生成する。モックは使用しない。
  const liveDeliveries = [
    ...rawOrders
      .filter(o => o.status && o.status !== "完了" && o.status !== "キャンセル" && (!o.staffStatus || o.staffStatus === "未割当" || o.staffStatus === "配送予定"))
      .map(o => ({
        id: o.orderNumber || o.id || o.firestoreId,
        firestoreId: o.firestoreId || o.id,
        window: o.deliveryDate ? o.deliveryDate.replace(/-/g, "/") : "未定",
        priority: "通常",
        company: o.companyName || ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || "ゲスト",
        site: o.siteName || "現場",
        addr: o.deliveryLocation || "住所未設定",
        dist: "—",
        eta: "—",
        phone: "",
        contact: ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || o.companyName || "",
        items: (o.items || []).map((i: any) => ({ name: i.name, qty: i.quantity || 1, icon: i.category === "カラーコーン" ? "cone" : "package", image: i.image })),
        note: o.note || o.memo || "",
        status: "未着手",
        rawOrder: o,
      }))
  ];

  // Derive Recoveries
  // 回収タスクは実データ（実際の注文）のみから生成する。モックは使用しない。
  const liveRecoveries = [
    ...rawOrders
      .filter(o => {
        if (!o.rentalEndDate) return false;
        if (o.staffStatus === "回収完了") return false;
        const end = new Date(o.rentalEndDate).getTime();
        const now = new Date().getTime();
        const daysLeft = Math.floor((end - now) / 86400000);
        return daysLeft <= 7 || o.staffStatus === "回収予定";
      })
      .map(o => ({
        id: (o.orderNumber || o.firestoreId || "").replace("ORD", "RTN"),
        firestoreId: o.firestoreId || o.id,
        window: o.rentalEndDate ? o.rentalEndDate.replace(/-/g, "/") : "未定",
        company: o.companyName || ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || "ゲスト",
        site: o.siteName || "現場",
        addr: o.deliveryLocation || "住所未設定",
        dist: "—",
        eta: "—",
        phone: "",
        contact: ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || o.companyName || "",
        note: "",
        products: (o.items || []).filter((i: any) => i.type === "rent").map((i: any, idx: number) => ({
          id: "P-" + idx, qr: "AS-" + (i.id || idx), name: i.name, expected: i.quantity || 1, icon: i.category === "カラーコーン" ? "cone" : "package", image: i.image
        })),
        rawOrder: o,
      }))
  ];

  const isVehicle = (p: any) => {
    if (!p) return false;
    const name = p.name || "";
    const cat = p.category || "";
    return cat.includes("車両") || cat.includes("トラック") || cat.includes("バン") || name.includes("エルフ") || name.includes("デュトロ") || name.includes("ハイエース") || name.includes("キャンター");
  };

  const completeDelivery = (id: string, signature?: string | null, photos?: any[]) => {
    const updates: any = { staffStatus: "配送完了", status: "配送済み" };
    if (signature) updates.signature = signature;
    if (photos && photos.length > 0) updates.deliveryPhotos = photos;
    OrderBus.patch("orders", id, updates);
    patchOrder(id, updates).catch(err => console.warn("Failed to sync to firebase:", err));

    // Decrement stock and add stock out move
    const ordersList = OrderBus.getAll<any>("orders");
    const targetOrder = ordersList.find(o => o.id === id || o.firestoreId === id);
    if (targetOrder && targetOrder.items) {
      targetOrder.items.forEach((item: any) => {
        const prod = products.find(p => p.name === item.name);
        const qty = item.quantity || 1;
        if (prod) {
          adjustStock(prod.id, -qty);
          addStockMove("出庫", {
            item: item.name,
            qty: qty,
            ref: `配送 ${targetOrder.orderNumber || targetOrder.id || ""}`,
            icon: isVehicle(prod) ? "car" : "package"
          });
        }
      });
    }
  };

  const completeRecovery = (id: string, signature?: string | null, photos?: any[]) => {
    const updates: any = { staffStatus: "回収完了", status: "完了" };
    if (signature) updates.collectionSignature = signature;
    if (photos && photos.length > 0) updates.collectionPhotos = photos;
    OrderBus.patch("orders", id, updates);
    patchOrder(id, updates).catch(err => console.warn("Failed to sync to firebase:", err));

    // Increment stock and add stock in move
    const ordersList = OrderBus.getAll<any>("orders");
    const targetOrder = ordersList.find(o => o.id === id || o.firestoreId === id);
    if (targetOrder && targetOrder.items) {
      targetOrder.items.forEach((item: any) => {
        if (item.type === "rent") {
          const prod = products.find(p => p.name === item.name);
          const qty = item.quantity || 1;
          if (prod) {
            adjustStock(prod.id, qty);
            addStockMove("入庫", {
              item: item.name,
              qty: qty,
              ref: `回収 ${targetOrder.orderNumber || targetOrder.id || ""}`,
              icon: isVehicle(prod) ? "car" : "package"
            });
          }
        }
      });
    }
  };

  const recordVehicleShaken = (plate: string, updates: any) => {
    const vehs = OrderBus.getAll<any>("vehicles");
    const v = vehs.find(x => x.plate === plate);
    if (v) OrderBus.patch("vehicles", v.id || v.plate, updates);
  };

  const findProductByName = (name: string) => {
    return products.find(p => p.name === name);
  };

  const adjustStock = (firestoreId: string, delta: number) => {
    const prods = OrderBus.getAll<any>("products");
    const p = prods.find(x => x.id === firestoreId || x.firestoreId === firestoreId);
    if (p) OrderBus.patch("products", p.id, { stock: (p.stock || 0) + delta });
  };

  const setStock = (firestoreId: string, value: number) => {
    const prods = OrderBus.getAll<any>("products");
    const p = prods.find(x => x.id === firestoreId || x.firestoreId === firestoreId);
    if (p) OrderBus.patch("products", p.id, { stock: value });
  };

  const recordMaintenance = (id: string, updates: any) => {
    OrderBus.patch("maintenance", id, updates);
  };

  const addStockMove = (type: string, { item, qty, ref, icon }: { item: string; qty: number; ref?: string; icon?: string }) => {
    const isIn = type === "入庫";
    const now = new Date();
    const date = `2026/06/03 ${now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
    const id = `${isIn ? "IN" : "OUT"}-${Math.floor(9000 + Math.random() * 999)}`;
    const staffName = STAFF.souko.name;
    const doc = { id, item, qty, date, type: "手動" + type, staff: staffName, seq: now.getTime(), icon: icon || "package" };
    if (isIn) {
      (doc as any).src = ref || "手動入庫";
      OrderBus.push("stockIn", doc);
    } else {
      (doc as any).dst = ref || "手動出庫";
      OrderBus.push("stockOut", doc);
    }
  };

  const pushFieldReports = (reports: any[]) => {
    reports.forEach(r => OrderBus.push("fieldReports", { ...r, status: "未対応" }));
  };

  const stockMoves = [
    ...stockInRows.map(r => ({ id: r.id, type: "入庫", item: r.item, qty: r.qty, time: (r.date || "").slice(-5), ref: r.src || r.type || "", icon: r.icon || "boxIn", seq: r.seq || 0 })),
    ...stockOutRows.map(r => ({ id: r.id, type: "出庫", item: r.item, qty: r.qty, time: (r.date || "").slice(-5), ref: r.dst || r.type || "", icon: r.icon || "boxOut", seq: r.seq || 0 })),
  ].sort((a, b) => (b.seq || 0) - (a.seq || 0));

  return (
    <MobileLiveContext.Provider value={{
      connected, liveDeliveries, liveRecoveries, completeDelivery, completeRecovery,
      vehicles, recordVehicleShaken, products, findProductByName, adjustStock, setStock,
      maint, walkin, stockMoves, recordMaintenance, addStockMove, pushFieldReports
    }}>
      {children}
    </MobileLiveContext.Provider>
  );
}

export function useMobileLive() {
  const context = useContext(MobileLiveContext);
  if (!context) {
    throw new Error("useMobileLive must be used within a MobileLiveProvider");
  }
  return context;
}

// Global hook for recovery / inventory flow damage reporting
export function pushFieldReportsLocal({ source, ref, reporter, customer, site, products }: any) {
  const withIssues = (products || []).filter((p: any) => p.report && p.report.length > 0);
  const ids: string[] = [];
  withIssues.forEach((p: any) => {
    const entries = p.report.map((e: any) => ({ reason: e.reason, qty: e.qty, photos: (e.photos || []).length, note: e.note || "" }));
    const id = "FR-" + String(Date.now()).slice(-6) + Math.floor(Math.random() * 10);
    ids.push(id);
    OrderBus.push("fieldReports", {
      id,
      source, ref, reporter, customer, site,
      asset: p.name, qr: p.qr || "", entries,
      status: "未対応", date: new Date().toLocaleString("ja-JP"),
    });
  });
  return Promise.resolve(ids);
}
