import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useProducts } from "../../context/ProductContext";
import { getSupplyCategories, getCategoryIcon } from "../../utils/productUtils";
import CustomerNotificationBell from "../../components/CustomerNotificationBell";

/** PC 用 商品カテゴリー（お客様デスクトップサイト）。モバイル Categories と同じ検索・タブ・カテゴリ抽出ロジックを再利用。 */
export default function CategoriesDesktop() {
  const location = useLocation();
  const { products } = useProducts();
  const supplyCategories = getSupplyCategories(products);
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
    if (e.key === "Enter" && searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const searchResults = (products || [])
    .filter(
      (p) =>
        p?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p?.category?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .slice(0, 5);

  /** タブ切替時に ?tab= も同期させる（モバイルと同様、URL とタブ状態を一致させる）。 */
  const switchTab = (tab: "supplies" | "vehicles") => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    params.set("tab", tab);
    navigate({ search: params.toString() }, { replace: true });
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header row: breadcrumb + title + search + bell */}
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">ホーム</Link> <span className="mx-1">/</span> 商品カテゴリー
      </nav>

      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">商品カテゴリー</h1>
          <p className="text-sm text-slate-500 mt-1">必要な機材や資材を探す</p>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-96" ref={searchContainerRef}>
            <div className="flex items-center bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-shadow">
              <div className="pl-4 pr-2 text-slate-400 flex items-center justify-center">
                <span className="material-symbols-outlined">search</span>
              </div>
              <input
                className="w-full bg-transparent border-none outline-none focus:ring-0 text-slate-900 placeholder:text-slate-400 text-[15px] font-medium h-full pr-4"
                placeholder="商品名、カテゴリで検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
                onFocus={() => setIsSearchFocused(true)}
              />
            </div>
            {isSearchFocused && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50">
                {searchResults.length > 0 ? (
                  <div className="flex flex-col">
                    {searchResults.map((product) => (
                      <Link
                        key={product.id}
                        to={`/product/${product.id}`}
                        className="flex items-center gap-3 p-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors"
                        onClick={() => setIsSearchFocused(false)}
                      >
                        <div
                          className="h-10 w-10 shrink-0 bg-slate-100 rounded-lg bg-cover bg-center"
                          style={{ backgroundImage: `url("${product.image}")` }}
                        ></div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-bold text-slate-800 truncate">{product.name}</span>
                          <span className="text-[11px] text-slate-500">{product.category}</span>
                        </div>
                      </Link>
                    ))}
                    <button
                      onClick={() => {
                        navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
                        setIsSearchFocused(false);
                      }}
                      className="p-3 text-xs font-bold text-primary text-center hover:bg-slate-50 transition-colors"
                    >
                      すべての結果を表示
                    </button>
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-slate-500">一致する商品が見つかりません</div>
                )}
              </div>
            )}
          </div>

          <CustomerNotificationBell />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-200 p-1 rounded-xl w-full max-w-md mb-8">
        <button
          onClick={() => switchTab("supplies")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all text-center ${activeTab === "supplies" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          保安用品
        </button>
        <button
          onClick={() => switchTab("vehicles")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all text-center ${activeTab === "vehicles" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          保安車両
        </button>
      </div>

      {activeTab === "supplies" ? (
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-500">safety_check</span>
              保安用品一覧
            </h2>
            <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
              {supplyCategories.length} カテゴリ
            </span>
          </div>
          {supplyCategories.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {supplyCategories.map((cat) => (
                <CategoryItem key={cat} icon={getCategoryIcon(cat)} name={cat} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm py-16 text-center text-sm text-slate-500">
              カテゴリがありません
            </div>
          )}
        </section>
      ) : (
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500">local_shipping</span>
              保安車両一覧
            </h2>
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">5 カテゴリ</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <VehicleCategoryItem
              name="軽トラック"
              bgImage="https://img1.kakaku.k-img.com/Images/prdnews/2021122%2F20211220190008_457_.jpg"
            />
            <VehicleCategoryItem
              name="軽バン"
              bgImage="https://www.carsensor.net/contents/article_images/_66941/every01.jpg"
            />
            <VehicleCategoryItem
              name="2tノーマル"
              bgImage="https://www.kaitoriou.net/page/wp-content/uploads/2021/10/aeee94831383a2fa7cc4b3acad0ece5d.png"
            />
            <VehicleCategoryItem
              name="2tロング"
              bgImage="https://www.trl-chiba.co.jp/images/car/t3-01-01.jpg"
            />
            <VehicleCategoryItem
              name="2t Wキャブノーマル"
              bgImage="https://www.imagiire.co.jp/files/topics/495_ext_05_0_L.png"
            />
          </div>
        </section>
      )}
    </div>
  );
}

function CategoryItem({ icon, name }: { icon: string; name: string }) {
  return (
    <Link
      to={`/products?category=${name}`}
      className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-primary/50 hover:shadow-md transition-all"
    >
      <span className="material-symbols-outlined text-primary text-[26px] shrink-0">{icon}</span>
      <span className="text-sm font-bold text-slate-700">{name}</span>
    </Link>
  );
}

function VehicleCategoryItem({ name, bgImage }: { name: string; bgImage: string }) {
  return (
    <Link
      to={`/products?category=${name}`}
      className="group relative overflow-hidden rounded-2xl bg-slate-900 aspect-[4/3] shadow-sm border border-slate-200"
    >
      <div
        className="absolute inset-0 bg-cover bg-center group-hover:scale-110 transition-transform duration-500"
        style={{ backgroundImage: `url("${bgImage}")` }}
      ></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
      <div className="absolute bottom-0 left-0 p-4 w-full">
        <span className="text-white font-bold text-base block">{name}</span>
      </div>
    </Link>
  );
}
