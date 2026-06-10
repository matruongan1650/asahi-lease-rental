import React, { useState, FC, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useFeatured } from "../context/FeaturedContext";
import { useProducts } from "../context/ProductContext";

export default function ProductList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get("category");
  const isFeaturedList = searchParams.get("featured") === "true";
  const searchParam = searchParams.get("search");
  const { addToCart } = useCart();
  const { isFeatured, toggleFeatured, featuredIds } = useFeatured();
  const { products } = useProducts();
  
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParam || "");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isSearchActive && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchActive]);

  const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchInput.trim())}`);
      setIsSearchActive(false);
    }
  };

  const handleQuantityChange = (id: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[id] || 0;
      const product = products.find(p => p && p.id === id);
      const stock = product ? product.stock : 999;
      const next = Math.max(0, Math.min(stock, current + delta));
      if (next === 0) {
        const newQs = { ...prev };
        delete newQs[id];
        return newQs;
      }
      return { ...prev, [id]: next };
    });
  };

  const handleSetQuantity = (id: string, amount: number) => {
    setQuantities(prev => {
      const product = products.find(p => p && p.id === id);
      const stock = product ? product.stock : 999;
      const next = Math.max(0, Math.min(stock, amount));
      if (next === 0) {
        const newQs = { ...prev };
        delete newQs[id];
        return newQs;
      }
      return { ...prev, [id]: next };
    });
  };

  let totalItems = 0;
  for (const key in quantities) {
    if (typeof quantities[key] === 'number') {
      totalItems += quantities[key];
    }
  }

  // Decide which list to render
  const title = searchParam 
    ? `検索: ${searchParam}` 
    : isFeaturedList 
      ? "注目商品" 
      : (categoryParam || "すべての商品");
  
  const safeProducts = products || [];
  const filteredProducts = isFeaturedList
    ? safeProducts.filter(p => featuredIds.includes(p?.id))
    : searchParam
      ? safeProducts.filter(p => p?.name?.toLowerCase().includes(searchParam.toLowerCase()) || p?.category?.toLowerCase().includes(searchParam.toLowerCase()))
      : categoryParam 
        ? safeProducts.filter(p => p?.category === categoryParam)
        : safeProducts;

  const handleAddToCart = () => {
    for (const id in quantities) {
      if (quantities[id] > 0) {
        const product = products.find(p => p && p.id === id);
        if (product) {
          addToCart({
            id: product.id,
            name: product.name,
            image: product.image,
            rentPrice: product.rentPrice,
            rentPriceLongTerm: product.rentPriceLongTerm,
            buyPrice: product.buyPrice,
            quantity: quantities[id],
            type: product.rentPrice ? 'rent' : 'buy', // Default to rent if available
            rentalDays: 1, // Default 1 day maybe?
            category: product.category,
          });
        }
      }
    }
    setQuantities({});
    alert("カートに追加しました");
  };

  return (
    <>
      <div className="sticky top-0 z-50 flex items-center bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 border-b border-slate-200 dark:border-slate-800 justify-between h-16">
        <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")} className="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-700 text-slate-900 dark:text-white transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        {isSearchActive ? (
          <div className="flex-1 px-2 relative" ref={searchContainerRef}>
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => {
                  setSearchInput(e.target.value);
                  setIsSearchFocused(true);
              }}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={handleSearchSubmit}
              placeholder="商品を検索..."
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg focus:ring-2 focus:ring-primary/20 text-slate-900 dark:text-white placeholder:text-slate-400 text-[16px] h-10 px-4 outline-none"
            />
            {isSearchFocused && searchInput.trim().length > 0 && (
                <div className="absolute left-2 right-2 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50">
                  {safeProducts.filter(p => p?.name?.toLowerCase().includes(searchInput.toLowerCase()) || p?.category?.toLowerCase().includes(searchInput.toLowerCase())).slice(0, 5).length > 0 ? (
                    <div className="flex flex-col">
                      {safeProducts.filter(p => p?.name?.toLowerCase().includes(searchInput.toLowerCase()) || p?.category?.toLowerCase().includes(searchInput.toLowerCase())).slice(0, 5).map(product => (
                        <Link 
                           key={product.id}
                           to={`/product/${product.id}`}
                           className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors"
                           onClick={() => {
                               setIsSearchFocused(false);
                               setIsSearchActive(false);
                           }}
                        >
                          <div className="h-10 w-10 shrink-0 bg-slate-100 dark:bg-slate-900 rounded-lg bg-contain bg-center bg-no-repeat" style={{backgroundImage: `url("${product.image}")`}}></div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-bold text-slate-800 dark:text-white truncate">{product.name}</span>
                            <span className="text-[10px] text-slate-500">{product.category}</span>
                          </div>
                        </Link>
                      ))}
                      <button 
                        onClick={() => {
                            navigate(`/products?search=${encodeURIComponent(searchInput.trim())}`);
                            setIsSearchFocused(false);
                            setIsSearchActive(false);
                        }}
                        className="p-3 text-xs font-bold text-primary text-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        すべての結果を表示
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-500">
                      一致する商品が見つかりません
                    </div>
                  )}
                </div>
            )}
          </div>
        ) : (
          <h1 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center truncate px-2">
            {title}
          </h1>
        )}
        <button onClick={() => setIsSearchActive(!isSearchActive)} className="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-700 text-slate-900 dark:text-white transition-colors">
          <span className="material-symbols-outlined text-[24px]">{isSearchActive ? 'close' : 'search'}</span>
        </button>
      </div>

      <div className={`grid grid-cols-2 gap-3 p-4 ${totalItems > 0 ? 'pb-24' : ''}`}>
        {filteredProducts.map(product => (
          <ProductListItem 
            key={product.id}
            id={product.id}
            name={product.name}
            image={product.image}
            rentPrice={product.rentPrice}
            rentPriceLongTerm={product.rentPriceLongTerm}
            buyPrice={product.buyPrice}
            badge={product.badge}
            badgeColor={product.badgeColor}
            stock={product.stock}
            quantity={quantities[product.id] || 0}
            onQuantityChange={(delta) => handleQuantityChange(product.id, delta)}
            onSetQuantity={(val) => handleSetQuantity(product.id, val)}
            isFeatured={isFeatured(product.id)}
            onToggleFeatured={() => toggleFeatured(product.id)}
          />
        ))}
      </div>

      {totalItems > 0 && (
        <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white dark:bg-background-dark border-t border-slate-100 dark:border-slate-800 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-[60] pb-safe">
          <div className="flex gap-3 max-w-md mx-auto">
            <button onClick={handleAddToCart} className="flex-1 py-3.5 px-4 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/30 flex justify-center items-center gap-2 active:scale-[0.98] transition-transform">
              カートに追加する <span className="bg-white text-primary text-xs w-5 h-5 rounded-full flex items-center justify-center">{totalItems}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const ProductListItem: FC<{ id: string, name: string, image: string, rentPrice?: number, rentPriceLongTerm?: number, buyPrice?: number, badge?: string, badgeColor?: string, stock: number, quantity: number, onQuantityChange: (delta: number) => void, onSetQuantity: (val: number) => void, isFeatured: boolean, onToggleFeatured: () => void }> = ({ id, name, image, rentPrice, rentPriceLongTerm, buyPrice, badge, badgeColor, stock, quantity, onQuantityChange, onSetQuantity, isFeatured, onToggleFeatured }) => {
  return (
    <div className="group flex flex-col bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700/50">
      <div className="relative w-full aspect-square bg-slate-50 dark:bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-contain bg-center bg-no-repeat group-hover:scale-105 transition-transform duration-300" style={{ backgroundImage: `url("${image}")`}}></div>
        {badge && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <span className={`px-2 py-0.5 rounded-md ${badgeColor} text-[10px] font-bold border uppercase tracking-wide`}>{badge}</span>
          </div>
        )}
        <button 
          className="absolute top-2 right-2 p-1.5 bg-white/80 dark:bg-black/40 backdrop-blur rounded-full text-slate-400 hover:text-red-500 transition-colors z-10" 
          onClick={(e) => {
            e.preventDefault();
            onToggleFeatured();
          }}
        >
          <span className={`material-symbols-outlined text-[18px] transition-colors ${isFeatured ? "text-red-500 fill-1" : ""}`}>favorite</span>
        </button>
      </div>
      <div className="p-3 flex flex-col flex-1 gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight">{name}</h3>
        <div className="mt-auto flex flex-col">
          {rentPrice ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">レンタル:</span>
                <span className="text-base font-bold text-primary">¥{rentPrice.toLocaleString()}<span className="text-xs font-normal text-slate-400">/日</span></span>
              </div>
              {rentPriceLongTerm && (
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">長期(&gt;15日):</span>
                  <span className="text-sm font-bold text-primary">¥{rentPriceLongTerm.toLocaleString()}<span className="text-xs font-normal text-slate-400">/日</span></span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-baseline gap-1 opacity-40">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">レンタル:</span>
              <span className="text-xs font-bold line-through">--</span>
            </div>
          )}
          
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">購入:</span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">¥{buyPrice?.toLocaleString()}</span>
          </div>
        </div>
        <div className="mt-1 flex flex-col gap-2">
          {stock > 0 ? (
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">在庫数: {stock}</p>
          ) : (
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">在庫なし (販売のみ)</p>
          )}
          <div className="flex items-center gap-1">
            <div className={`flex items-center border border-slate-200 dark:border-slate-700 rounded-lg ${stock > 0 ? 'bg-slate-50 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800 opacity-50'}`}>
              <button disabled={stock === 0 || quantity <= 0} onClick={() => onQuantityChange(-1)} className="p-1 text-slate-500 disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">remove</span></button>
              <input 
                type="number" 
                value={quantity === 0 ? '' : quantity} 
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val)) onSetQuantity(0);
                  else onSetQuantity(val);
                }}
                disabled={stock === 0}
                className="px-0 w-8 text-[16px] font-bold text-center inline-block bg-transparent outline-none hide-arrows" 
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <button disabled={stock === 0 || quantity >= stock} onClick={() => onQuantityChange(1)} className="p-1 text-slate-500 disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">add</span></button>
            </div>
            <Link to={`/product/${id}`} className="flex-1 text-center py-2 rounded-lg bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-300 text-[10px] font-bold transition-colors">詳細</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

