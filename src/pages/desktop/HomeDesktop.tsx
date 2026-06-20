import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useProducts } from "../../context/ProductContext";
import { useFeatured } from "../../context/FeaturedContext";
import { useCart } from "../../context/CartContext";
import { isVehicleCategory } from "../../utils/productUtils";
import { SALES_ENABLED } from "../../config/features";
import { triggerToast } from "../../components/AdminUI";

/** PC 用 ホーム（お客様デスクトップサイト）。商品データは共通の useProducts を再利用。 */
export default function HomeDesktop() {
  const { products } = useProducts();
  const { featuredIds } = useFeatured();
  const { addToCart } = useCart();

  const safe = products || [];
  const featured = useMemo(() => safe.filter((p) => featuredIds.includes(p?.id)).slice(0, 8), [safe, featuredIds]);
  const popular = useMemo(() => (featured.length >= 4 ? featured : safe.filter((p) => p?.rentPrice).slice(0, 8)), [featured, safe]);
  const categories = useMemo(() => Array.from(new Set(safe.map((p) => p?.category).filter(Boolean))).slice(0, 8) as string[], [safe]);
  const suppliesCount = safe.filter((p) => p && !isVehicleCategory(p.category)).length;
  const vehiclesCount = safe.filter((p) => p && isVehicleCategory(p.category)).length;

  const quickAdd = (p: any) => {
    const type = (!SALES_ENABLED || p.rentPrice) ? "rent" : "buy";
    // レンタルは在庫切れ商品をカートに入れない（ProductList/ProductDetail と同じガード）。
    if (type === "rent" && Number(p.stock || 0) <= 0) {
      triggerToast("在庫がありません", "warn");
      return;
    }
    addToCart({ id: p.id, name: p.name, image: p.image, rentPrice: p.rentPrice, rentPriceLongTerm: p.rentPriceLongTerm, buyPrice: p.buyPrice, quantity: 1, type, rentalDays: 1, category: p.category, unit: p.unit });
    triggerToast("カートに追加しました", "ok");
  };

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#0f2a4a] via-[#11407a] to-primary text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-bold mb-4">保安用品・保安車両レンタル</span>
            <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight">現場の安全を、<br />必要なときに、必要なだけ。</h1>
            <p className="mt-4 text-white/80 text-base leading-relaxed max-w-md">カラーコーン・バリケード・保安車両まで。最短手配・長期割引でコストを最適化します。</p>
            <div className="mt-7 flex gap-3">
              <Link to="/products" className="px-6 py-3 rounded-xl bg-white text-primary font-bold hover:bg-slate-100 transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">storefront</span>商品をさがす
              </Link>
              <Link to="/orders" className="px-6 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-colors border border-white/20">注文履歴</Link>
            </div>
          </div>
          <div className="hidden lg:grid grid-cols-2 gap-4">
            <Link to="/products?group=supplies" className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 p-6 backdrop-blur transition-colors">
              <span className="material-symbols-outlined text-[32px]">traffic</span>
              <div className="mt-3 text-lg font-extrabold">保安用品</div>
              <div className="text-white/70 text-sm">{suppliesCount} 品目</div>
            </Link>
            <Link to="/products?group=vehicles" className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 p-6 backdrop-blur transition-colors">
              <span className="material-symbols-outlined text-[32px]">local_shipping</span>
              <div className="mt-3 text-lg font-extrabold">保安車両</div>
              <div className="text-white/70 text-sm">{vehiclesCount} 台</div>
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold text-slate-900">カテゴリーから探す</h2>
            <Link to="/products" className="text-sm font-bold text-primary hover:underline flex items-center gap-1">すべて見る<span className="material-symbols-outlined text-[18px]">chevron_right</span></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categories.map((cat) => (
              <Link key={cat} to={`/products?category=${encodeURIComponent(cat)}`} className="rounded-xl bg-white border border-slate-200 px-4 py-4 font-bold text-slate-700 hover:border-primary hover:text-primary hover:shadow-sm transition-all flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-slate-400">category</span>{cat}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured / popular */}
      <section className="max-w-7xl mx-auto px-6 pb-14">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold text-slate-900">{featured.length >= 4 ? "注目商品" : "おすすめ商品"}</h2>
          <Link to="/products?featured=true" className="text-sm font-bold text-primary hover:underline flex items-center gap-1">もっと見る<span className="material-symbols-outlined text-[18px]">chevron_right</span></Link>
        </div>
        {popular.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 font-bold">商品がありません。</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
            {popular.map((p) => (
              <div key={p.id} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <Link to={`/product/${p.id}`} className="block aspect-[4/3] bg-slate-50 overflow-hidden">
                  <div className="w-full h-full bg-contain bg-center bg-no-repeat group-hover:scale-105 transition-transform duration-300" style={{ backgroundImage: `url("${p.image}")` }} />
                </Link>
                <div className="p-4 flex flex-col flex-1 gap-2">
                  <Link to={`/product/${p.id}`} className="text-sm font-bold text-slate-900 line-clamp-2 leading-tight hover:text-primary">{p.name}</Link>
                  <div className="mt-auto flex items-center justify-between gap-1">
                    {p.rentPrice ? <span className="text-lg font-extrabold text-primary">¥{p.rentPrice.toLocaleString()}<span className="text-xs text-slate-400 font-medium">/日</span></span> : <span className="text-xs font-bold text-slate-300">レンタル不可</span>}
                    {!!p.rentPrice && Number(p.stock || 0) <= 0 && <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded">在庫なし</span>}
                  </div>
                  <button onClick={() => quickAdd(p)} disabled={(!p.rentPrice && !SALES_ENABLED) || (!!p.rentPrice && Number(p.stock || 0) <= 0)} className="mt-1 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-primary/10 disabled:hover:text-primary">カートに追加</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
