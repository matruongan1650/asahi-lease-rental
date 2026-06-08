import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useProducts } from "../context/ProductContext";

export default function Categories() {
  const location = useLocation();
  const { products } = useProducts();
  const [activeTab, setActiveTab] = useState<"supplies" | "vehicles">(() => {
    return new URLSearchParams(location.search).get("tab") === "vehicles" ? "vehicles" : "supplies";
  });
  
  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    if (tabParam === "vehicles" || tabParam === "supplies") {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
        <div className="flex items-end justify-between px-4 pt-6 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">商品カテゴリー</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">必要な機材や資材を探す</p>
          </div>
          <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
            <span className="material-symbols-outlined text-slate-700 dark:text-slate-200 group-active:scale-95 transition-transform">notifications</span>
            <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-background-light dark:border-background-dark"></span>
          </button>
        </div>
        
        {showNotifications && (
          <div className="absolute top-16 right-4 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-4 z-50 animate-in fade-in slide-in-from-top-2">
            <h3 className="font-bold text-slate-900 dark:text-white mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">お知らせ</h3>
            <div className="flex flex-col gap-3">
              <div className="text-sm">
                <p className="text-primary font-bold text-xs mb-1">新着</p>
                <p className="text-slate-700 dark:text-slate-300">新しい保安車両が入荷しました。</p>
              </div>
              <div className="text-sm">
                <p className="text-slate-400 font-bold text-xs mb-1">システム</p>
                <p className="text-slate-700 dark:text-slate-300">メンテナンス計画のお知らせ</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 pb-4" ref={searchContainerRef}>
          <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-shadow">
            <div className="pl-4 pr-2 text-slate-400 flex items-center justify-center">
              <span className="material-symbols-outlined">search</span>
            </div>
            <input 
              className="w-full bg-transparent border-none outline-none focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400 text-[16px] font-medium h-full" 
              placeholder="商品名、カテゴリで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              onFocus={() => setIsSearchFocused(true)}
            />
          </div>
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute left-4 right-4 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50">
              {(products || []).filter(p => p?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p?.category?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5).length > 0 ? (
                <div className="flex flex-col">
                  {(products || []).filter(p => p?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p?.category?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5).map(product => (
                    <Link 
                       key={product.id}
                       to={`/product/${product.id}`}
                       className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors"
                       onClick={() => setIsSearchFocused(false)}
                    >
                      <div className="h-10 w-10 shrink-0 bg-slate-100 dark:bg-slate-900 rounded-lg bg-cover bg-center" style={{backgroundImage: `url("${product.image}")`}}></div>
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
      
      <main className="flex flex-col w-full h-auto px-4 py-4 space-y-6">
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab("supplies")}
            className={`flex-1 py-2 px-4 rounded-lg shadow-sm text-sm font-bold transition-all text-center ${activeTab === "supplies" ? "bg-white dark:bg-slate-600 text-primary dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
          >
            保安用品
          </button>
          <button 
            onClick={() => setActiveTab("vehicles")}
            className={`flex-1 py-2 px-4 rounded-lg shadow-sm text-sm font-bold transition-all text-center ${activeTab === "vehicles" ? "bg-white dark:bg-slate-600 text-primary dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
          >
            保安車両
          </button>
        </div>

        {activeTab === "supplies" ? (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500">safety_check</span>
                保安用品一覧
              </h2>
              <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 px-2 py-1 rounded-full">35 カテゴリ</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CategoryItem icon="change_history" name="カラーコーン" />
              <CategoryItem icon="remove" name="コーンバー" />
              <CategoryItem icon="fence" name="バリケード" />
              <CategoryItem icon="traffic" name="工事灯" />
              <CategoryItem icon="arrow_forward" name="矢印板" />
              <CategoryItem icon="signpost" name="工事看板" />
              <CategoryItem icon="fitness_center" name="ウェイト" />
              <CategoryItem icon="health_and_safety" name="車両衝突緩衝材" />
              <CategoryItem icon="texture" name="歩行者用マット" />
              <CategoryItem icon="emergency" name="回転灯" />
            </div>
          </section>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500">local_shipping</span>
                保安車両一覧
              </h2>
              <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded-full">5 カテゴリ</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <VehicleCategoryItem name="軽トラック" bgImage="https://img1.kakaku.k-img.com/Images/prdnews/2021122%2F20211220190008_457_.jpg" />
              <VehicleCategoryItem name="軽バン" bgImage="https://www.carsensor.net/contents/article_images/_66941/every01.jpg" />
              <VehicleCategoryItem name="2tノーマル" bgImage="https://www.kaitoriou.net/page/wp-content/uploads/2021/10/aeee94831383a2fa7cc4b3acad0ece5d.png" />
              <VehicleCategoryItem name="2tロング" bgImage="https://www.trl-chiba.co.jp/images/car/t3-01-01.jpg" />
              <VehicleCategoryItem name="2t Wキャブノーマル" bgImage="https://www.imagiire.co.jp/files/topics/495_ext_05_0_L.png" />
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function CategoryItem({ icon, name }: { icon: string, name: string }) {
  return (
    <Link to={`/products?category=${name}`} className="flex items-center p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm hover:border-primary/50 transition-all active:scale-[0.98]">
      <span className="material-symbols-outlined text-slate-400 text-[20px] mr-2">{icon}</span>
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{name}</span>
    </Link>
  );
}

function VehicleCategoryItem({ name, bgImage }: { name: string, bgImage: string }) {
  return (
    <Link to={`/products?category=${name}`} className="group relative overflow-hidden rounded-xl bg-slate-900 aspect-[4/3] shadow-sm">
      <div className="absolute inset-0 bg-cover bg-center group-hover:scale-110 transition-transform duration-500" style={{ backgroundImage: `url("${bgImage}")`}}></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
      <div className="absolute bottom-0 left-0 p-3 w-full">
        <span className="text-white font-bold text-sm block">{name}</span>
      </div>
    </Link>
  );
}
