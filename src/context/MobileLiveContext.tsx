import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import OrderBus from "../lib/orderBus";
import { getProductQrCode } from "../utils/productQr";

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

// 持込返却（持込対応）はモックを使わず、実データのみ（顧客が直接持ち込んだ返却で作成された
// walkinReturns）を使用する。以前のモック WALKIN_RETURNS 定数は削除済み。

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
  completeDelivery: (id: string, signature?: string | null, photos?: any[], extra?: any) => void;
  completeRecovery: (id: string, signature?: string | null, photos?: any[]) => void;
  vehicles: any[];
  recordVehicleShaken: (plate: string, updates: any) => void;
  products: any[];
  findProductByName: (name: string) => any;
  adjustStock: (firestoreId: string, delta: number) => void;
  setStock: (firestoreId: string, value: number) => void;
  maint: any[];
  walkin: any[];
  returnInspections: any[];
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
  const [returnInspections, setReturnInspections] = useState<any[]>([]);
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

    // 持込返却の検品記録（確認履歴）。
    const unsubReturnInsp = OrderBus.subscribe("returnInspections", (rows) => {
      setReturnInspections(rows);
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
      unsubReturnInsp();
      unsubStockIn();
      unsubStockOut();
    };
  }, []);

  // Derive Deliveries
  // 配送タスクは実データ（実際の注文）のみから生成する。モックは使用しない。
  // 返却済・検品待ち・一部返却・配送済みの注文は「これから配送する」対象ではないため除外する
  // （-R 返却分注文などが staffStatus 未設定のまま配送予定に出る「幽霊タスク」を防ぐ）。
  const DELIVERY_EXCLUDED_STATUS = ["完了", "キャンセル", "返却済", "返却済み", "一部返却", "検品待ち", "配送済み"];
  const liveDeliveries = [
    ...rawOrders
      .filter(o => o.status && !DELIVERY_EXCLUDED_STATUS.includes(o.status) && (!o.staffStatus || o.staffStatus === "未割当" || o.staffStatus === "配送予定"))
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
  ].sort((a, b) => {
    // 納品希望日が近い順（未定は最後）。急ぎの配送を上に表示。
    const ta = a.rawOrder?.deliveryDate ? Date.parse(a.rawOrder.deliveryDate) : NaN;
    const tb = b.rawOrder?.deliveryDate ? Date.parse(b.rawOrder.deliveryDate) : NaN;
    return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
  });

  // Derive Recoveries
  // 回収タスクは実データ（実際の注文）のみから生成する。モックは使用しない。
  // 返却済・検品待ち・完了などの注文や、未返却のレンタル品が残っていない注文は
  // 回収対象ではないため除外（-R 返却分注文が回収予定に出る「幽霊タスク」を防ぐ）。
  const RECOVERY_EXCLUDED_STATUS = ["完了", "キャンセル", "返却済", "返却済み", "検品待ち"];
  const liveRecoveries = [
    ...rawOrders
      .filter(o => {
        if (!o.rentalEndDate) return false;
        if (o.status && RECOVERY_EXCLUDED_STATUS.includes(o.status)) return false;
        if (o.staffStatus === "回収完了") return false;
        // 未返却のレンタル品が 1 つも無ければ回収するものが無い
        const hasUnreturnedRent = (o.items || []).some(
          (i: any) => i && i.type === "rent" && ((i.quantity || 0) - (i.returnedQuantity || 0)) > 0
        );
        if (!hasUnreturnedRent) return false;
        const end = new Date(o.rentalEndDate).getTime();
        const now = new Date().getTime();
        const daysLeft = Math.floor((end - now) / 86400000);
        return daysLeft <= 7 || o.staffStatus === "回収予定";
      })
      .map(o => ({
        id: (o.orderNumber || o.firestoreId || "").replace("ORD", "RTN"),
        firestoreId: o.firestoreId || o.id,
        window: o.rentalEndDate ? o.rentalEndDate.replace(/-/g, "/") : "未定",
        returnRequestType: o.returnRequestType,
        company: o.companyName || ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || "ゲスト",
        site: o.siteName || "現場",
        addr: o.deliveryLocation || "住所未設定",
        dist: "—",
        eta: "—",
        phone: "",
        contact: ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || o.companyName || "",
        note: "",
        products: (o.items || []).filter((i: any) => i.type === "rent").map((i: any, idx: number) => {
          const master = products.find((p: any) => p && (p.id === i.id || p.name === i.name));
          const id = i.id || master?.id || "P-" + idx;
          return {
            id,
            qr: master ? getProductQrCode(master) : getProductQrCode({ id } as any),
            qrPayload: master?.qrPayload,
            name: i.name,
            expected: (i.quantity || 1) - (i.returnedQuantity || 0),
            icon: i.category === "カラーコーン" ? "cone" : "package",
            image: i.image,
            category: i.category
          };
        }),
        rawOrder: o,
      }))
  ].sort((a, b) => {
    // 返却期限が近い順（未定は最後）。期限切れ・間近の回収を上に表示。
    const ta = a.rawOrder?.rentalEndDate ? Date.parse(a.rawOrder.rentalEndDate) : NaN;
    const tb = b.rawOrder?.rentalEndDate ? Date.parse(b.rawOrder.rentalEndDate) : NaN;
    return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
  });

  const isVehicle = (p: any) => {
    if (!p) return false;
    const name = p.name || "";
    const cat = p.category || "";
    return cat.includes("車両") || cat.includes("トラック") || cat.includes("バン") || name.includes("エルフ") || name.includes("デュトロ") || name.includes("ハイエース") || name.includes("キャンター");
  };

  const completeDelivery = (id: string, signature?: string | null, photos?: any[], extra?: any) => {
    const updates: any = { staffStatus: "配送完了", status: "配送済み" };
    // 受領サインは Order スキーマ上の deliverySignature と、既存表示が参照する signature の両方に保存
    if (signature) {
      updates.signature = signature;
      updates.deliverySignature = signature;
    }
    if (photos && photos.length > 0) updates.deliveryPhotos = photos;
    // 保安車両: 貸出時の走行距離・車両状態の記録（満タンで貸出）
    if (extra && extra.vehicleCheckout) updates.vehicleCheckout = extra.vehicleCheckout;
    OrderBus.patch("orders", id, updates);

    // Decrement stock and add stock out move
    const ordersList = OrderBus.getAll<any>("orders");
    const targetOrder = ordersList.find(o => o.id === id || o.firestoreId === id);
    if (targetOrder && targetOrder.items) {
      targetOrder.items.forEach((item: any) => {
        // 商品の特定は id を優先（管理側で商品名を変更しても在庫調整が外れないように）。
        // 名前一致は id 未設定の旧データ向けフォールバック。回収側（liveRecoveries）と同じ規則。
        const prod = products.find(p => p && (p.id === item.id || p.name === item.name));
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
    // 現場回収の完了 = 注文の終了ではない。
    // 持ち帰った品は倉庫で「最終検品（再検品）」を行ってから確定・請求書発行する。
    // そのため在庫計上もここでは行わず、最終検品完了時（completeReturn）に行う。
    const ordersList = OrderBus.getAll<any>("orders");
    const targetOrder = ordersList.find(o => o.id === id || o.firestoreId === id);

    const updates: any = { staffStatus: "回収完了", status: "検品待ち" };
    if (signature) updates.collectionSignature = signature;
    if (photos && photos.length > 0) updates.collectionPhotos = photos;
    OrderBus.patch("orders", id, updates);

    // 倉庫の最終検品キューへ登録（stage: "recheck"）
    if (targetOrder) {
      // 同じ注文の既存伝票があれば先に削除（二重登録＝幽霊伝票の防止）
      try {
        OrderBus.getAll<any>("walkinReturns")
          .filter(w => w && (w.orderId === targetOrder.id || (targetOrder.orderNumber && w.orderNumber === targetOrder.orderNumber)))
          .forEach(w => OrderBus.remove("walkinReturns", w.id));
      } catch { /* ignore */ }
      const now = new Date();
      OrderBus.push("walkinReturns", {
        id: "WIN-" + String(targetOrder.orderNumber || targetOrder.id).replace(/[^A-Za-z0-9]/g, "") + "-" + Math.floor(Math.random() * 900 + 100),
        orderId: targetOrder.id,
        orderNumber: targetOrder.orderNumber,
        firestoreId: targetOrder.firestoreId,
        company: targetOrder.companyName || "",
        contact: targetOrder.personName || "",
        rentalNo: targetOrder.orderNumber,
        time: now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + " 持帰り",
        note: "現場回収分の倉庫最終検品",
        source: "field_recovery",
        stage: "recheck",
        fieldSignature: signature || null,
        // 現場で撮影した写真（dataURL のみ抽出）— 倉庫の最終検品画面で参照できる
        photos: (photos || [])
          .map((p: any) => (typeof p === "string" ? p : (p && p.dataUrl) || null))
          .filter((u: any) => typeof u === "string" && u.startsWith("data:")),
        returningEverything: true,
        products: (targetOrder.items || [])
          .filter((i: any) => i.type === "rent")
          .map((i: any, idx: number) => {
            const master = products.find((p: any) => p && (p.id === i.id || p.name === i.name));
            const itemId = i.id || master?.id || "P-" + idx;
            return {
              id: itemId,
              qr: master ? getProductQrCode(master) : getProductQrCode({ id: itemId } as any),
              qrPayload: master?.qrPayload,
              name: i.name,
              expected: (i.quantity || 1) - (i.returnedQuantity || 0),
              icon: "package",
              image: i.image,
              category: i.category,
            };
          }),
      } as any);
    }
  };

  const recordVehicleShaken = (plate: string, updates: any) => {
    const vehs = OrderBus.getAll<any>("vehicles");
    const v = vehs.find(x => x.plate === plate);
    if (v) OrderBus.patch("vehicles", v.id || v.plate, updates);
  };

  const findProductByName = (name: string) => {
    return products.find(p => p && p.name === name);
  };

  const adjustStock = (firestoreId: string, delta: number) => {
    const prods = OrderBus.getAll<any>("products");
    const p = prods.find(x => x && (x.id === firestoreId || x.firestoreId === firestoreId));
    if (p) OrderBus.patch("products", p.id, { stock: (p.stock || 0) + delta });
  };

  const setStock = (firestoreId: string, value: number) => {
    const prods = OrderBus.getAll<any>("products");
    const p = prods.find(x => x && (x.id === firestoreId || x.firestoreId === firestoreId));
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
      maint, walkin, returnInspections, stockMoves, recordMaintenance, addStockMove, pushFieldReports
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
    const entries = p.report.map((e: any) => {
      // スタッフが撮影した実画像（dataURL）を抽出して admin の現場報告でも表示できるようにする。
      const photoUrls = (e.photos || [])
        .map((ph: any) => (typeof ph === "string" ? ph : (ph && ph.dataUrl) || null))
        .filter((u: any) => typeof u === "string" && u.startsWith("data:"));
      return {
        reason: e.reason,
        qty: e.qty,
        photos: (e.photos || []).length, // 互換: 件数
        photoUrls, // 実画像
        note: e.note || "",
      };
    });
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
