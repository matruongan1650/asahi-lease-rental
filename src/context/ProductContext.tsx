import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { PRODUCTS as INITIAL_PRODUCTS } from "../data/products";
import { Product } from "../types";
import OrderBus from "../lib/orderBus";

interface ProductContextType {
  products: Product[];
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem("app_products");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : INITIAL_PRODUCTS;
      } catch (e) {
        return INITIAL_PRODUCTS;
      }
    }
    return INITIAL_PRODUCTS;
  });

  // ローカルキャッシュ（オフライン表示用）。サーバーへは push しない。
  useEffect(() => {
    try {
      localStorage.setItem("app_products", JSON.stringify(products));
    } catch (e) {
      // 容量超過などで失敗してもアプリをクラッシュさせない。
      console.error("[ProductContext] 商品データの localStorage 保存に失敗しました（容量超過の可能性）。", e);
    }
  }, [products]);

  // サーバー（OrderBus "products"）が唯一の正。購読して state を反映するだけ。
  // ★ ここから OrderBus へ書き戻さない（INITIAL_PRODUCTS で既存カタログを上書きしたり、
  //   StrictMode の effect 二重実行で seed を再アップロードする事故を防ぐ）。
  useEffect(() => {
    const unsub = OrderBus.subscribe("products", (newProds) => {
      if (newProds && newProds.length > 0) {
        setProducts((prev) =>
          JSON.stringify(prev) !== JSON.stringify(newProds)
            ? (newProds as unknown as Product[])
            : prev,
        );
      }
    });
    return unsub;
  }, []);

  // 追加・編集・削除は「ユーザーの明示操作」のみ。state 更新 + OrderBus（→/api）へ個別反映。
  const addProduct = (product: Product) => {
    setProducts(prev => [product, ...prev]);
    OrderBus.push("products", product as any);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => (prev || []).filter(Boolean).map(p => p.id === id ? { ...p, ...updates } : p));
    OrderBus.patch("products", id, updates as any);
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => (prev || []).filter(Boolean).filter(p => p.id !== id));
    OrderBus.remove("products", id);
  };

  return (
    <ProductContext.Provider value={{ products, addProduct, updateProduct, deleteProduct }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (context === undefined) {
    throw new Error("useProducts must be used within a ProductProvider");
  }
  return context;
}
