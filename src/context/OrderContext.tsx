import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { CartItem } from "./CartContext";
import { pushOrder, patchOrder, subscribeOrders } from "../lib/firebase";
import OrderBus from "../lib/orderBus";

export interface Order {
  id: string;
  orderNumber: string;
  date: string;
  status: string;
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
  firestoreId?: string;
  staffStatus?: string;
  staffNote?: string;
  assignedStaff?: string;
  deliveryPhoto?: string;
  deliverySignature?: string;
  collectionPhoto?: string;
  collectionSignature?: string;
  warehousePhoto?: string;
  warehouseSignature?: string;
  itemIssues?: { itemId: string; type: "missing" | "broken"; quantity: number; notes: string; photo?: string }[];
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
    localStorage.setItem("order_history_v3", JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    const unsubscribe = subscribeOrders(async (firebaseOrders) => {
      if (firebaseOrders.length === 0 && !localStorage.getItem("asahi.seeded_b2b_orders")) {
        localStorage.setItem("asahi.seeded_b2b_orders", "true");
        console.log("[OrderProvider] Seeding default B2B orders to empty Firebase...");
        try {
          const { B2B_MOCK_ORDERS } = await import("../data/adminMockData");
          for (const ord of B2B_MOCK_ORDERS) {
            await pushOrder(ord as any);
          }
        } catch (err) {
          console.error("Failed to seed B2B orders to Firebase:", err);
        }
        return;
      }

      setOrders(currentOrders => {
        const newOrders = [...currentOrders];
        let hasChanges = false;
        
        for (const data of firebaseOrders) {
          const fbo = data as unknown as Order;
          const existingIdx = newOrders.findIndex(o => o.firestoreId === fbo.firestoreId || o.id === fbo.id);
          
          if (existingIdx !== -1) {
            // Check if there are meaningful differences to avoid infinite re-renders or unnecessary state updates
            if (JSON.stringify(newOrders[existingIdx]) !== JSON.stringify({ ...newOrders[existingIdx], ...fbo })) {
              newOrders[existingIdx] = { ...newOrders[existingIdx], ...fbo };
              hasChanges = true;
            }
          } else {
            newOrders.push(fbo);
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          // Keep newer orders first
          return newOrders.sort((a, b) => {
            return 0;
          });
        }
        return currentOrders;
      });
    });
    
    return () => unsubscribe();
  }, []);

  const addOrder = useCallback(async (orderData: Omit<Order, "id" | "orderNumber" | "date" | "status">) => {
    const newOrder: Order = {
      ...orderData,
      id: Math.random().toString(36).substr(2, 9),
      orderNumber: `#ORD-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`,
      date: new Date().toLocaleDateString("ja-JP") + " • " + new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      status: "処理中",
    };
    
    try {
      console.log("[Firebase] pushing order... data:", newOrder);
      const firestoreId = await pushOrder(newOrder as unknown as Record<string, unknown>);
      newOrder.firestoreId = firestoreId;
      console.log("[Firebase] order pushed successfully, id:", firestoreId);
    } catch (error) {
      console.error("[Firebase] addOrder error:", error);
    }
    
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
      const idx = prev.findIndex(o => o.id === id);
      if (idx === -1) return prev;
      
      const newOrders = [...prev];
      const order = newOrders[idx];
      const merged = { ...order, ...updates };
      newOrders[idx] = merged;
      
      if (merged.firestoreId) {
        patchOrder(merged.firestoreId, updates as unknown as Record<string, unknown>).catch(err => {
          console.warn("Failed to patch order in Firebase:", err);
        });
      }
      
      return newOrders;
    });
  }, []);

  const addCustomOrder = useCallback(async (orderData: Omit<Order, "id">) => {
    const newOrder: Order = {
      ...orderData,
      id: Math.random().toString(36).substr(2, 9),
    };
    
    try {
      console.log("[Firebase] pushing custom order... data:", newOrder);
      const firestoreId = await pushOrder(newOrder as unknown as Record<string, unknown>);
      newOrder.firestoreId = firestoreId;
      console.log("[Firebase] custom order pushed successfully, id:", firestoreId);
    } catch (error) {
      console.error("[Firebase] addOrder error:", error);
    }
    
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
