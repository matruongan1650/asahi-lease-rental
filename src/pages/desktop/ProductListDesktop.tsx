import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useFeatured } from "../../context/FeaturedContext";
import { useProducts } from "../../context/ProductContext";
import { isVehicleCategory } from "../../utils/productUtils";
import { SALES_ENABLED } from "../../config/features";
import { LONG_TERM_THRESHOLD_DAYS } from "../../utils/billing";
import { triggerToast } from "../../components/AdminUI";

/** PC 用 商品一覧（お客様デスクトップサイト）。モバイルの ProductList と同じデータ・カート処理を再利用。 */
export default function ProductListDesktop() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get("category");
  const isFeaturedList = searchParams.get("featured") === "true";
  const searchParam = searchParams.get("search") || "";
  const groupParam = searchParams.get("group");

  const { addToCart } = useCart();
  const { isFeatured, toggleFeatured, featuredIds } = useFeatured();
  const { products } = useProducts();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [searchInput, setSearchInput] = useState(searchParam);

  const safeProducts = products || [];
  const categories = useMemo(
    () => Array.from(new Set(safeProducts.map((p) => p?.category).filter(Boolean))) as string[],
    [safeProducts],
  );

  const filteredProducts = useMemo(() => {
    if (isFeaturedList) return safeProducts.filter((p) => featuredIds.includes(p?.id));
    if (searchParam) return safeProducts.filter((p) => p?.name?.toLowerCase().includes(searchParam.toLowerCase()) || p?.category?.toLowerCase().includes(searchParam.toLowerCase()));
    if (categoryParam) return safeProducts.filter((p) => p?.category === categoryParam);
    if (groupParam === "supplies") return safeProducts.filter((p) => p && !isVehicleCategory(p.category));
    if (groupParam === "vehicles") return safeProducts.filter((p) => p && isVehicleCategory(p.category));
    return safeProducts;
  }, [safeProducts, isFeaturedList, featuredIds, searchParam, categoryParam, groupParam]);

  const title = searchParam ? `検索: ${searchParam}` : isFeaturedList ? "注目商品" : categoryParam || (groupParam === "supplies" ? "保安用品" : groupParam === "vehicles" ? "保安車両" : "すべての商品");

  const setQty = (id: string, amount: number) => {
    setQuantities((prev) => {
      const product = safeProducts.find((p) => p && p.id === id);
      const stock = product ? product.stock : 999;
      const next = Math.max(0, Math.min(stock, amount));
      const copy = { ...prev };
      if (next === 0) delete copy[id]; else copy[id] = next;
      return copy;
    });
  };
  const totalSelected = Object.values(quantities).reduce((a, b) => a + (Number(b) || 0), 0);

  const addOne = (id: string, qty = 1) => {
    const product = safeProducts.find((p) => p && p.id === id);
    if (!product) return;
    addToCart({
      id: product.id, name: product.name, image: product.image,
      rentPrice: product.rentPrice, rentPriceLongTerm: product.rentPriceLongTerm, buyPrice: product.buyPrice,
      quantity: qty, type: (!SALES_ENABLED || product.rentPrice) ? "rent" : "buy", rentalDays: 1,
      category: product.category, unit: product.unit,
    });
  };

  const addSelectedToCart = () => {
    let n = 0;
    for (const id in quantities) { if (quantities[id] > 0) { addOne(id, quantities[id]); n += quantities[id]; } }
    setQuantities({});
    if (n > 0) triggerToast(`${n}点をカートに追加しました`, "ok");
  };

  const submitSearch = () => {
    const q = searchInput.trim();
    setSearchParams(q ? { search: q } : {});
  };

  const setCategory = (cat: string | null) => {
    setSearchInput("");
    if (!cat) setSearchParams({}); else setSearchParams({ category: cat });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <nav className="text-xs font-bold text-slate-400 mb-1">
            <Link to="/" className="hover:text-primary">ホーム</Link> <span className="mx-1">/</span> 商品一覧
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{filteredProducts.length} 件の商品</p>
        </div>
        <div className="relative w-80 max-w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
            placeholder="商品を検索..."
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      <div className="flex gap-8 items-start">
        {/* Sidebar: categories */}
        <aside className="w-56 shrink-0 hidden lg:block sticky top-24">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">カテゴリー</div>
            <button onClick={() => setCategory(null)} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold mb-1 transition-colors ${!categoryParam && !groupParam && !searchParam && !isFeaturedList ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50"}`}>すべて</button>
            <button onClick={() => setSearchParams({ group: "supplies" })} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold mb-1 transition-colors ${groupParam === "supplies" ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50"}`}>保安用品</button>
            <button onClick={() => setSearchParams({ group: "vehicles" })} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold mb-2 transition-colors ${groupParam === "vehicles" ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50"}`}>保安車両</button>
            <div className="border-t border-slate-100 my-2" />
            <div className="max-h-[50vh] overflow-auto pr-1">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setCategory(cat)} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors truncate ${categoryParam === cat ? "bg-primary/10 text-primary font-bold" : "text-slate-600 hover:bg-slate-50"}`}>{cat}</button>
              ))}
            </div>
          </div>
        </aside>

        {/* Product grid */}
        <div className="flex-1 min-w-0">
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400 font-bold">該当する商品が見つかりません。</div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredProducts.map((product) => {
                const qty = quantities[product.id] || 0;
                const out = !product.stock || product.stock <= 0
                  // レンタル単価未設定は SALES_ENABLED=false ではカート投入不可（¥0 レンタル注文の防止）(C4)。
                  || (!SALES_ENABLED && !(Number(product.rentPrice) > 0));
                return (
                  <div key={product.id} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                    <Link to={`/product/${product.id}`} className="relative block aspect-[4/3] bg-slate-50 overflow-hidden">
                      <div className="absolute inset-0 bg-contain bg-center bg-no-repeat group-hover:scale-105 transition-transform duration-300" style={{ backgroundImage: `url("${product.image}")` }} />
                      {product.badge && <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-md text-[10px] font-bold border ${product.badgeColor || "bg-slate-100 text-slate-600 border-slate-200"}`}>{product.badge}</span>}
                      <button onClick={(e) => { e.preventDefault(); toggleFeatured(product.id); }} className="absolute top-3 right-3 p-1.5 bg-white/90 backdrop-blur rounded-full text-slate-400 hover:text-red-500 transition-colors">
                        <span className={`material-symbols-outlined text-[18px] ${isFeatured(product.id) ? "text-red-500 fill-1" : ""}`}>favorite</span>
                      </button>
                    </Link>
                    <div className="p-4 flex flex-col flex-1 gap-2">
                      <Link to={`/product/${product.id}`} className="text-sm font-bold text-slate-900 line-clamp-2 leading-tight hover:text-primary">{product.name}</Link>
                      <div className="mt-auto">
                        {product.rentPrice ? (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-extrabold text-primary">¥{product.rentPrice.toLocaleString()}</span>
                            <span className="text-xs text-slate-400 font-medium">/日</span>
                            {product.rentPriceLongTerm ? <span className="text-[11px] text-slate-400 ml-1">長期 ¥{product.rentPriceLongTerm.toLocaleString()}/日</span> : null}
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-300 line-through">レンタル不可</span>
                        )}
                        <p className="text-[11px] text-slate-400 mt-1">在庫: {product.stock ?? 0}{product.unit ? ` ${product.unit}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`flex items-center border border-slate-200 rounded-lg ${out ? "opacity-40" : "bg-slate-50"}`}>
                          <button disabled={out || qty <= 0} onClick={() => setQty(product.id, qty - 1)} className="px-2 py-1.5 text-slate-500 disabled:opacity-40"><span className="material-symbols-outlined text-[18px]">remove</span></button>
                          <input type="number" value={qty === 0 ? "" : qty} disabled={out} onChange={(e) => { const v = parseInt(e.target.value); setQty(product.id, isNaN(v) ? 0 : v); }} className="w-9 text-center text-sm font-bold bg-transparent outline-none hide-arrows" inputMode="numeric" />
                          <button disabled={out || qty >= (product.stock || 0)} onClick={() => setQty(product.id, qty + 1)} className="px-2 py-1.5 text-slate-500 disabled:opacity-40"><span className="material-symbols-outlined text-[18px]">add</span></button>
                        </div>
                        <button
                          disabled={out}
                          onClick={() => { if (qty > 0) { addOne(product.id, qty); setQty(product.id, 0); triggerToast(`${qty}点をカートに追加しました`, "ok"); } else { addOne(product.id, 1); triggerToast("カートに追加しました", "ok"); } }}
                          className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                        >
                          カートに追加
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating add-selected bar */}
      {totalSelected > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white border border-slate-200 rounded-2xl shadow-xl px-5 py-3 flex items-center gap-4">
          <span className="text-sm font-bold text-slate-700">選択中 {totalSelected} 点</span>
          <button onClick={addSelectedToCart} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-600 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>まとめてカートに追加
          </button>
          <button onClick={() => navigate("/cart")} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">カートを見る</button>
        </div>
      )}
    </div>
  );
}
