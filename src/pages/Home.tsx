import React, { useState, useRef, useEffect } from "react";
import { alertDialog } from "../components/AppDialog";
import { Link, useNavigate } from "react-router-dom";
import { useFeatured } from "../context/FeaturedContext";
import { useCart } from "../context/CartContext";
import { useUser } from "../context/UserContext";
import { useProducts } from "../context/ProductContext";
import { getSupplyCategories, getCategoryIcon } from "../utils/productUtils";
import CustomerNotificationBell from "../components/CustomerNotificationBell";

export default function Home() {
  const navigate = useNavigate();
  const { products } = useProducts();
  const { featuredIds, isFeatured, toggleFeatured } = useFeatured();
  const { addToCart } = useCart();
  const { profile } = useUser();
  // Safely use products
  const safeProducts = products || [];
  // 保安用品カテゴリーを商品から動的に取得し、2件ずつの列にまとめる
  const supplyCategories = getSupplyCategories(products);
  const supplyCategoryColumns: string[][] = [];
  for (let i = 0; i < supplyCategories.length; i += 2) {
    supplyCategoryColumns.push(supplyCategories.slice(i, i + 2));
  }
  const featuredProducts = safeProducts.filter(p => featuredIds.includes(p?.id));
  
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'supplies' | 'vehicles'>('supplies');
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
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

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  let totalItems = 0;
  for (const key in quantities) {
    if (typeof quantities[key] === 'number') {
      totalItems += quantities[key];
    }
  }

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
            rentalDays: 1, // Default 1 day
            category: product.category,
          });
        }
      }
    }
    setQuantities({});
    void alertDialog("カートに追加しました");
  };
  
  return (
    <>
      <div className="sticky top-0 z-50 bg-white/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 transition-colors duration-300">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer">
              <div 
                className="bg-center bg-no-repeat bg-cover rounded-full h-11 w-11 border-2 border-white dark:border-slate-700 shadow-sm" 
                style={{backgroundImage: `url("${profile.avatarUrl}")`}}
              ></div>
              <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-white dark:border-background-dark rounded-full"></div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">こんにちは,</span>
              <span className="text-base font-bold text-slate-900 dark:text-white leading-none">{profile.lastName} {profile.firstName}</span>
            </div>
          </div>
          <CustomerNotificationBell />
        </div>

        <div className="px-5 pb-4" ref={searchContainerRef}>
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/50 rounded-2xl overflow-hidden h-12 transition-all focus-within:ring-2 focus-within:ring-primary/30 focus-within:bg-white dark:focus-within:bg-slate-800 shadow-sm border border-transparent focus-within:border-primary/20">
            <div className="pl-4 pr-3 text-slate-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </div>
            <input 
              className="w-full bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400 text-[16px] font-medium h-full outline-none" 
              placeholder="商品名、カテゴリで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              onFocus={() => setIsSearchFocused(true)}
            />
            <button onClick={() => navigate("/categories")} className="pr-4 pl-2 text-slate-400 hover:text-primary transition-colors flex items-center justify-center h-full">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </button>
          </div>
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute left-5 right-5 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50">
              {safeProducts.filter(p => p?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p?.category?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5).length > 0 ? (
                <div className="flex flex-col">
                  {safeProducts.filter(p => p?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p?.category?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5).map(product => (
                    <Link 
                       key={product.id}
                       to={`/product/${product.id}`}
                       className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors"
                       onClick={() => setIsSearchFocused(false)}
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
                        navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
                        setIsSearchFocused(false);
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
      </div>
      
      <main className="flex flex-col w-full h-auto">
        <div className="px-5 mt-6">
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setActiveTab('supplies')}
              className={`relative overflow-hidden rounded-2xl ${activeTab === 'supplies' ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm'} group cursor-pointer h-32 transition-colors focus:outline-none text-left`}
            >
              {activeTab === 'supplies' && (
                <>
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                  <div className="absolute bottom-0 left-0 -ml-4 -mb-4 w-20 h-20 bg-black/10 rounded-full blur-xl"></div>
                </>
              )}
              {activeTab !== 'supplies' && (
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[80px] text-primary">health_and_safety</span>
                </div>
              )}
              <div className="relative z-10 h-full p-4 flex flex-col justify-between">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${activeTab === 'supplies' ? 'bg-white/20 backdrop-blur text-white' : 'bg-blue-100 dark:bg-blue-900/30 text-primary'}`}>
                  <span className="material-symbols-outlined">health_and_safety</span>
                </div>
                <div>
                  <h3 className={`text-lg font-bold leading-tight ${activeTab === 'supplies' ? 'text-white' : 'text-slate-800 dark:text-white'}`}>保安用品</h3>
                  <p className={`text-[10px] mt-0.5 ${activeTab === 'supplies' ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>安全第一の現場へ</p>
                </div>
              </div>
            </button>

            <button 
              onClick={() => setActiveTab('vehicles')}
              className={`relative overflow-hidden rounded-2xl ${activeTab === 'vehicles' ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm'} group cursor-pointer h-32 transition-colors focus:outline-none text-left`}
            >
               {activeTab === 'vehicles' && (
                <>
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                  <div className="absolute bottom-0 left-0 -ml-4 -mb-4 w-20 h-20 bg-black/10 rounded-full blur-xl"></div>
                </>
              )}
               {activeTab !== 'vehicles' && (
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-symbols-outlined text-[80px] text-primary">airport_shuttle</span>
                  </div>
               )}
              <div className="relative z-10 h-full p-4 flex flex-col justify-between">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${activeTab === 'vehicles' ? 'bg-white/20 backdrop-blur text-white' : 'bg-blue-100 dark:bg-blue-900/30 text-primary'}`}>
                  <span className="material-symbols-outlined">front_loader</span>
                </div>
                <div>
                  <h3 className={`text-lg font-bold leading-tight ${activeTab === 'vehicles' ? 'text-white' : 'text-slate-800 dark:text-white'}`}>保安車両</h3>
                  <p className={`text-[10px] mt-0.5 ${activeTab === 'vehicles' ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>現場用車両</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="px-5 flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full"></span>
              {activeTab === 'supplies' ? '保安用品アイテム' : '保安車両アイテム'}
            </h2>
            <Link to="/products" className="text-xs font-medium text-primary hover:text-primary/80">すべて見る</Link>
          </div>
          <div className="flex overflow-x-auto hide-scrollbar gap-2 px-5 pb-2">
            {activeTab === 'supplies' ? (
              supplyCategoryColumns.map((col, idx) => (
                <div key={idx} className="flex flex-col gap-2">
                  {col.map((cat) => (
                    <SmallCategoryItem key={cat} icon={getCategoryIcon(cat)} name={cat} />
                  ))}
                </div>
              ))
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <SmallCategoryItem icon="local_shipping" name="軽トラック" />
                  <SmallCategoryItem icon="airport_shuttle" name="軽バン" />
                </div>
                <div className="flex flex-col gap-2">
                  <SmallCategoryItem icon="directions_car" name="2tノーマル" />
                  <SmallCategoryItem icon="local_shipping" name="2tロング" />
                </div>
                <div className="flex flex-col gap-2">
                  <SmallCategoryItem icon="rv_hookup" name="2t Wキャブノーマル" />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 px-5 w-full">
          <div className="flex overflow-x-auto hide-scrollbar snap-x snap-mandatory gap-4 pb-2">
            <div className="snap-center shrink-0 w-full rounded-2xl overflow-hidden relative aspect-[2.2/1] bg-slate-900 group shadow-lg">
              <div className="absolute inset-0 bg-cover bg-center opacity-60 group-hover:scale-105 transition-transform duration-700 ease-out" style={{backgroundImage: 'url("https://ondo-k.co.jp/wp-content/uploads/2016/04/shouhin_point_01.jpg")'}}></div>
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent"></div>
              <div className="absolute inset-0 p-6 flex flex-col justify-center items-start text-white">
                <span className="bg-primary/90 text-[10px] font-bold px-2.5 py-1 rounded-md mb-2 tracking-wider">キャンペーン</span>
                <h3 className="text-xl font-black leading-tight mb-1">保安商品レンタル 20%OFF</h3>
                <p className="text-xs text-white/80 mb-4 max-w-[60%]">1ヶ月以上の長期レンタルがお得に。</p>
                <button className="bg-white text-slate-900 text-xs font-bold px-4 py-2 rounded-full shadow-lg active:scale-95 transition-transform flex items-center gap-1">
                  詳細を見る <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-8 bg-white dark:bg-slate-900/40 py-6 border-y border-slate-100 dark:border-slate-800/50 ${totalItems > 0 ? "pb-24" : ""}`}>
          <div className="px-5 flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">注目商品</h2>
            <Link to="/products?featured=true" className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-0.5">
              すべて見る <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </Link>
          </div>
          <div className="flex overflow-x-auto hide-scrollbar gap-4 px-5 pb-2">
            {featuredProducts.map(product => (
              <ProductCard 
                key={product.id}
                id={product.id}
                image={product.image}
                name={product.name}
                price={product.rentPrice?.toLocaleString() || '--'}
                salePrice={product.buyPrice?.toLocaleString() || '--'}
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
        </div>

      </main>

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

function SmallCategoryItem({ icon, name }: { icon: string, name: string }) {
  return (
    <Link to={`/products?category=${name}`} className="flex items-center shrink-0 w-36 px-2.5 py-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm hover:border-primary/50 transition-all active:scale-[0.98]">
      <span className="material-symbols-outlined text-slate-400 text-[18px] mr-2">{icon}</span>
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{name}</span>
    </Link>
  );
}

const ProductCard: React.FC<{id: string, name: string, price: string, salePrice: string, image: string, badge?: string, badgeColor?: string, stock: number, quantity: number, onQuantityChange: (delta: number) => void, onSetQuantity?: (val: number) => void, isFeatured: boolean, onToggleFeatured: () => void}> = ({ id, name, price, salePrice, image, badge, badgeColor, stock, quantity, onQuantityChange, onSetQuantity, isFeatured, onToggleFeatured }) => {
  // Strip out text- classes since some badges have "text-blue-700" but we want white text here, or just keep as is
  const displayBadgeColor = badgeColor?.includes('bg-') ? badgeColor.split(' ').find(c => c.startsWith('bg-')) : 'bg-primary';

  return (
    <div className="shrink-0 w-48 bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow flex flex-col group cursor-pointer">
      <Link to={`/product/${id}`} className="relative h-32 bg-slate-50 dark:bg-slate-900 overflow-hidden block">
        <div className="w-full h-full bg-contain bg-center bg-no-repeat group-hover:scale-105 transition-transform duration-500" style={{backgroundImage: `url("${image}")`}}>
        </div>
        {badge && <div className={`absolute top-2 left-2 ${displayBadgeColor}/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm`}>{badge}</div>}
        <button 
          className="absolute top-2 right-2 p-1.5 bg-white/80 dark:bg-black/40 backdrop-blur rounded-full text-slate-400 hover:text-red-500 transition-colors z-10" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFeatured();
          }}
        >
          <span className={`material-symbols-outlined text-[18px] transition-colors ${isFeatured ? "text-red-500 fill-1" : ""}`}>favorite</span>
        </button>
      </Link>
      <div className="p-3 flex flex-col flex-1">
        <Link to={`/product/${id}`}><h3 className="text-sm font-bold text-slate-800 dark:text-white line-clamp-2 mb-2 group-hover:text-primary transition-colors">{name}</h3></Link>
        <div className="mt-auto">
          <Link to={`/product/${id}`} className="block">
            <div className="flex items-baseline gap-1">
              <span className="text-primary text-base font-extrabold">¥{price}</span>
              <span className="text-slate-400 text-xs">/日</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">販売価格: ¥{salePrice}</p>
          </Link>
          <div className="mt-2 flex items-center justify-between">
            <div className={`flex items-center border border-slate-200 dark:border-slate-700 rounded-lg ${stock > 0 ? 'bg-slate-50 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800 opacity-50'}`}>
              <button disabled={stock === 0 || quantity <= 0} onClick={() => onQuantityChange(-1)} className="p-1 text-slate-500 disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">remove</span></button>
              <input 
                type="number" 
                value={quantity === 0 ? '' : quantity} 
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val) && onSetQuantity) onSetQuantity(0);
                  else if (onSetQuantity) onSetQuantity(val);
                }}
                disabled={stock === 0}
                className="px-0 w-8 text-[16px] font-bold text-center inline-block bg-transparent outline-none hide-arrows" 
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <button disabled={stock === 0 || quantity >= stock} onClick={() => onQuantityChange(1)} className="p-1 text-slate-500 disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">add</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
