import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from "react";
import { calculateRentalPrice } from "../utils/billing";
import { useProducts } from "./ProductContext";
import { useUser } from "./UserContext";
import { isVehicleCategory } from '../utils/productUtils';
import { safeSetJSON } from "../utils/safeStorage";
import { alertDialog } from "../components/AppDialog";

export interface CartItem {
  id: string;
  name: string;
  image: string;
  rentPrice?: number;
  rentPriceLongTerm?: number;
  buyPrice?: number;
  quantity: number;
  returnedQuantity?: number;
  rentalDays?: number;
  billedDays?: number;
  type: 'rent' | 'buy';
  category?: string;
  unit?: string;
  actualReturnDate?: string;
  calculatedPrice?: number;
  monthlyBreakdown?: any[];
  guaranteeFeeFlat?: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  updateQuantity: (id: string, delta: number) => void;
  setQuantityAmount: (id: string, amount: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { products } = useProducts();
  const { currentUser } = useUser();
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("cart_v3");
      if (saved) {
        const parsed = JSON.parse(saved);
        // We will hydrate latest prices using the products from props/context shortly.
        return parsed.map((item: any) => ({
          ...item,
          type: item.type === 'レンタル' ? 'rent' : item.type === '販売' ? 'buy' : item.type,
        }));
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Hydrate latest prices when products change
  useEffect(() => {
    if (products.length > 0 && items.length > 0) {
      setItems(prevItems => prevItems.map(item => {
        const prod = products.find(p => p && p.id === item.id);
        if (prod) {
          // 価格に加えて数量も最新在庫へ再クランプする。カートは localStorage で数日単位に持ち越される
          // ため、投入時クランプだけでは他注文の受注確定で減った在庫を超えたまま会計に進めてしまう(C1)。
          const st = Number(prod.stock);
          return {
            ...item,
            rentPrice: prod.rentPrice,
            rentPriceLongTerm: prod.rentPriceLongTerm,
            buyPrice: prod.buyPrice,
            quantity: Number.isFinite(st) ? Math.min(item.quantity, Math.max(0, st)) : item.quantity,
          };
        }
        return item;
      }));
    }
  }, [products]);

  const addToCart = useCallback((newItem: CartItem) => {
    // レンタル単価未設定の商品は SALES_ENABLED=false ではレンタル固定のため ¥0 注文になってしまう。
    // 全カタログ画面共通の最終防衛としてここで拒否する(C4)。
    if (newItem.type === 'rent' && !(Number(newItem.rentPrice) > 0)) {
      void alertDialog("この商品は現在レンタルのお取り扱いがありません。");
      return;
    }
    setItems((prevItems) => {
      // マージ後の合計が在庫を超えないよう上限クランプする（updateQuantity/setQuantityAmount と同じ防御）。
      // 在庫5の商品を5個入れた状態でさらに5個追加 → 10 にならず在庫5に丸める（在庫超過注文の作成防止）。
      const stock = products.find(p => p && p.id === newItem.id)?.stock ?? 999;
      if (Number(stock) <= 0) return prevItems; // 在庫0は追加しない（0数量行の混入防止）(C1)
      const existingItemIndex = prevItems.findIndex(item => item.id === newItem.id && item.type === newItem.type);
      if (existingItemIndex >= 0) {
        // 直接 mutate せず新しいオブジェクトに置き換える（前の state を壊さない／
        // StrictMode の二重呼び出しで数量が二重加算されるのを防ぐ）。
        return prevItems.map((item, i) =>
          i === existingItemIndex ? { ...item, quantity: Math.min(stock, item.quantity + newItem.quantity) } : item
        );
      }
      return [...prevItems, { ...newItem, quantity: Math.min(stock, newItem.quantity) }];
    });
  }, [products]);

  const updateQuantity = useCallback((id: string, delta: number) => {
    setItems((prevItems) => {
      return prevItems.map(item => {
        if (item.id === id) {
          const product = products.find(p => p && p.id === id);
          const stock = product ? product.stock : 999;
          // 在庫0のときは 0 まで下げられるようにする（Math.max(1,…) だと在庫0でも数量1に固定され
          // 減らすことも消すこともできない）(C1)。
          const newQuantity = Number(stock) <= 0 ? 0 : Math.max(1, Math.min(stock, item.quantity + delta));
          return { ...item, quantity: newQuantity };
        }
        return item;
      });
    });
  }, [products]);

  const setQuantityAmount = useCallback((id: string, amount: number) => {
    setItems((prevItems) => {
      return prevItems.map(item => {
        if (item.id === id) {
          const product = products.find(p => p && p.id === id);
          const stock = product ? product.stock : 999;
          const newQuantity = (amount === 0 || Number(stock) <= 0) ? 0 : Math.max(1, Math.min(stock, amount)); // allow 0 temporarily / 在庫0は0へ(C1)
          return { ...item, quantity: newQuantity };
        }
        return item;
      });
    });
  }, [products]);

  const removeItem = useCallback((id: string) => {
    setItems((prevItems) => prevItems.filter(item => item.id !== id));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  // アカウントが切り替わったら（ログイン/ログアウト/別アカウントへ切替）カートを空にする。
  // 共有端末でカートが別の同僚アカウントに引き継がれ、誤った userId で発注される事故を防ぐ。
  // 初回マウント（リロード）では消さない（自分のカートを保持）。
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = currentUser?.id ?? null;
    const prev = prevUserIdRef.current;
    prevUserIdRef.current = id;
    if (prev === undefined) return;        // 初回マウント（リロード）は記録のみ
    if (prev === null && id !== null) return; // null→実ユーザー（ユーザーキャッシュ遅延ハイドレーション）は切替ではない
    if (prev !== id) {
      // アカウント切替/ログアウト時のみカートを破棄（共有端末での誤発注防止）。
      setItems([]);
      try { localStorage.removeItem("cart_v3"); } catch { /* ignore */ }
    }
  }, [currentUser?.id]);

  React.useEffect(() => {
    safeSetJSON("cart_v3", items);
  }, [items]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  
  const totalPrice = items.reduce((sum, item) => {
    if (item.type === 'rent' && item.rentPrice) {
      const hasVehicle = items.some(i => isVehicleCategory(i.category) && i.type === 'rent');
      const { totalPrice: itemTotal } = calculateRentalPrice(
        item.rentPrice,
        undefined, // no dates in cart
        undefined,
        hasVehicle,
        isVehicleCategory(item.category),
        item.rentPriceLongTerm
      );
      return sum + (itemTotal * item.quantity);
    }
    if (item.type === 'buy' && item.buyPrice) {
      return sum + (item.buyPrice * item.quantity);
    }
    return sum;
  }, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, updateQuantity, setQuantityAmount, removeItem, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
