import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useProducts } from "./ProductContext";
import { safeSetJSON } from "../utils/safeStorage";

interface FeaturedContextType {
  featuredIds: string[];
  toggleFeatured: (id: string) => void;
  isFeatured: (id: string) => boolean;
}

const FeaturedContext = createContext<FeaturedContextType>({
  featuredIds: [],
  toggleFeatured: () => {},
  isFeatured: () => false,
});

export const FeaturedProvider = ({ children }: { children: ReactNode }) => {
  const { products } = useProducts();
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("featured_products_v1");
    if (saved) {
      try {
        setFeaturedIds(JSON.parse(saved));
        setIsLoaded(true);
        return;
      } catch (e) {
        console.error("Failed to parse featured products", e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded && featuredIds.length === 0 && !localStorage.getItem("featured_products_v1") && (products || []).length > 0) {
      const defaults = (products || []).filter(p => p?.featured).map(p => p?.id);
      setFeaturedIds(defaults);
      safeSetJSON("featured_products_v1", defaults);
    }
  }, [isLoaded, products, featuredIds]);

  const toggleFeatured = (id: string) => {
    setFeaturedIds((prev) => {
      let next;
      if (prev.includes(id)) {
        next = prev.filter((fid) => fid !== id);
      } else {
        next = [...prev, id];
      }
      safeSetJSON("featured_products_v1", next);
      return next;
    });
  };

  const isFeatured = (id: string) => featuredIds.includes(id);

  return (
    <FeaturedContext.Provider value={{ featuredIds, toggleFeatured, isFeatured }}>
      {children}
    </FeaturedContext.Provider>
  );
};

export const useFeatured = () => useContext(FeaturedContext);
