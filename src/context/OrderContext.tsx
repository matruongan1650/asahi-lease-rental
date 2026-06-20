import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { CartItem } from "./CartContext";
import OrderBus from "../lib/orderBus";

export interface Order {
  id: string;
  orderNumber: string;
  date: string;
  status: string;
  returnRequestType?: "full" | "partial";
  requestedReturn?: Record<string, number>;
  items: CartItem[];
  total: number;
  subtotal: number;
  tax: number;
  deliveryLocation: string;
  deliveryDate: string;
  siteName?: string;
  constructionNumber?: string;
  companyName?: string;
  personName?: string;
  personLastName?: string;
  personFirstName?: string;
  /** 発注したログインアカウント（admin で発注者を特定するため） */
  userId?: string;
  userEmail?: string;
  userPhone?: string;
  notes?: string;
  rentalStartDate?: string;
  rentalEndDate?: string;
  actualReturnDate?: string;
  deliveryConfirmedAt?: string;
  collectionConfirmedAt?: string;
  stockDeducted?: boolean;
  stockDeductedAt?: string;
  stockRestored?: boolean;
  compensationCharge?: { amount: number; note: string; lines: any[] };
  compensationDismissed?: boolean;
  firestoreId?: string;
  staffStatus?: string;
  staffNote?: string;
  assignedStaff?: string;
  deliveryPhotos?: any[];
  deliverySignature?: string;
  collectionPhotos?: any[];
  collectionSignature?: string;
  warehousePhotos?: any[];
  warehouseSignature?: string;
  itemIssues?: { itemId: string; itemName?: string; type: "missing" | "broken"; quantity: number; notes: string; photo?: any }[];
  invoiceBlocks?: any[];
  inspectedByWarehouse?: boolean;
}

interface OrderContextProps {
  orders: Order[];
  addOrder: (order: Omit<Order, "id" | "orderNumber" | "date" | "status">) => Promise<Order>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  addCustomOrder: (orderData: Omit<Order, "id">) => Promise<Order>;
}

const OrderContext = createContext<OrderContextProps | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem("order_history_v3");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    // localStorage への保存はベストエフォート。サイン・写真の base64 で容量超過すると
    // setItem が例外を投げ、未捕捉だと画面全体がクラッシュするため必ず握りつぶす。
    try {
      localStorage.setItem("order_history_v3", JSON.stringify(orders));
    } catch {
      // 容量超過時は重い base64（data: URL）を除いた軽量版で再試行。
      // サーバー(MySQL)が正本なので、画像は次回ポーリングで取り直せる。
      try {
        localStorage.setItem(
          "order_history_v3",
          JSON.stringify(orders, (_k, v) =>
            typeof v === "string" && v.length > 256 && v.startsWith("data:") ? undefined : v,
          ),
        );
      } catch {
        // それでも入らなければキャッシュは諦める（メモリ上の orders は保持され表示は継続）。
      }
    }
  }, [orders]);

  useEffect(() => {
    const unsubscribe = OrderBus.subscribe("orders", (serverOrders) => {
      setOrders((serverOrders as unknown as Order[]).filter(Boolean));
    });
    
    return () => unsubscribe();
  }, []);

  const addOrder = useCallback(async (orderData: Omit<Order, "id" | "orderNumber" | "date" | "status">) => {
    const newOrder: Order = {
      ...orderData,
      // 衝突しにくい一意ID（時刻+乱数）。短い乱数のみだとソフト削除済みレコードのIDと衝突して
      // ON DUPLICATE KEY で「復活」させてしまう恐れがあるため。
      id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      // 衝突しにくい注文番号。4桁乱数(1万通り/年)では数百件で重複し、派生する請求書番号(INV-R/S)まで
      // 衝突するため、ミリ秒タイムスタンプ下6桁で採番する（レコード id は別途一意な time+乱数）。
      orderNumber: `#ORD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      date: new Date().toLocaleDateString("ja-JP") + " • " + new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      status: "処理中",
    };
    
    setOrders(prev => {
      const exists = prev.find(o => o.id === newOrder.id);
      if (exists) return prev;
      return [newOrder, ...prev];
    });
    
    // Broadcast cross-tab to Admin/Staff
    OrderBus.push("orders", newOrder as any);
    
    return newOrder;
  }, []);

  const updateOrder = useCallback(async (id: string, updates: Partial<Order>) => {
    setOrders(prev => {
      const idx = prev.findIndex(o => o.id === id || o.firestoreId === id);
      if (idx === -1) return prev;
      
      const newOrders = [...prev];
      const order = newOrders[idx];
      const merged = { ...order, ...updates };
      newOrders[idx] = merged;
      
      const syncId = merged.firestoreId || merged.id || id;
      OrderBus.patch("orders", syncId, updates as unknown as Record<string, unknown>);
      
      return newOrders;
    });
  }, []);

  const addCustomOrder = useCallback(async (orderData: Omit<Order, "id">) => {
    const newOrder: Order = {
      ...orderData,
      // 衝突しにくい一意ID（時刻+乱数）。短い乱数のみだとソフト削除済みレコードのIDと衝突して
      // ON DUPLICATE KEY で「復活」させてしまう恐れがあるため。
      id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    
    setOrders(prev => [newOrder, ...prev]);

    // 返却分などのカスタム注文も OrderBus に反映する。
    // これがないと admin（OrderBus 参照）に返却済みの「-R」注文が表示されず、
    // レンタル請求書・回収履歴などで返却明細が見えなくなる。
    OrderBus.push("orders", newOrder as any);

    return newOrder;
  }, []);

  return (
    <OrderContext.Provider value={{ orders, addOrder, updateOrder, addCustomOrder }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error("useOrders must be used within an OrderProvider");
  }
  return context;
}
