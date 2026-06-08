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
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_PRODUCTS;
      }
    }
    return INITIAL_PRODUCTS;
  });

  useEffect(() => {
    localStorage.setItem("app_products", JSON.stringify(products));
    const obProds = OrderBus.getAll<any>("products");
    if (JSON.stringify(obProds) !== JSON.stringify(products)) {
      OrderBus.setAll("products", products as any);
    }
  }, [products]);

  useEffect(() => {
    const unsub = OrderBus.subscribe("products", (newProds) => {
      if (newProds && newProds.length > 0) {
        setProducts((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(newProds)) {
            return newProds as unknown as Product[];
          }
          return prev;
        });
      }
    });
    return unsub;
  }, []);

  const addProduct = (product: Product) => {
    setProducts(prev => [product, ...prev]);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
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
