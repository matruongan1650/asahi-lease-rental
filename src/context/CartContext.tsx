import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { calculateRentalPrice } from "../utils/billing";
import { useProducts } from "./ProductContext";
import { isVehicleCategory } from '../utils/productUtils';

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
          return {
            ...item,
            rentPrice: prod.rentPrice,
            rentPriceLongTerm: prod.rentPriceLongTerm,
            buyPrice: prod.buyPrice
          };
        }
        return item;
      }));
    }
  }, [products]);

  const addToCart = useCallback((newItem: CartItem) => {
    setItems((prevItems) => {
      const existingItemIndex = prevItems.findIndex(item => item.id === newItem.id && item.type === newItem.type);
      if (existingItemIndex >= 0) {
        const updatedItems = [...prevItems];
        updatedItems[existingItemIndex].quantity += newItem.quantity;
        return updatedItems;
      }
      return [...prevItems, newItem];
    });
  }, []);

  const updateQuantity = useCallback((id: string, delta: number) => {
    setItems((prevItems) => {
      return prevItems.map(item => {
        if (item.id === id) {
          const product = products.find(p => p && p.id === id);
          const stock = product ? product.stock : 999;
          const newQuantity = Math.max(1, Math.min(stock, item.quantity + delta));
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
          const newQuantity = amount === 0 ? 0 : Math.max(1, Math.min(stock, amount)); // allow 0 temporarily
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

  React.useEffect(() => {
    localStorage.setItem("cart_v3", JSON.stringify(items));
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
