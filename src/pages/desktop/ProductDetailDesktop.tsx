import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useFeatured } from "../../context/FeaturedContext";
import { useProducts } from "../../context/ProductContext";
import { SALES_ENABLED } from "../../config/features";
import { LONG_TERM_THRESHOLD_DAYS } from "../../utils/billing";
import { triggerToast } from "../../components/AdminUI";

/** PC 用 商品詳細（お客様デスクトップサイト）。モバイル ProductDetail と同じカート処理を再利用。 */
export default function ProductDetailDesktop() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { products } = useProducts();
  const { addToCart } = useCart();
  const { isFeatured, toggleFeatured } = useFeatured();
  const [quantity, setQuantity] = useState<number>(1);
  const [actionType, setActionType] = useState<"rent" | "buy">("rent");

  const product = products.find((p) => p && p.id === id) || products.filter(Boolean)[0];

  useEffect(() => {
    window.scrollTo(0, 0);
    setQuantity(1);
    setActionType(!SALES_ENABLED ? "rent" : (product?.rentPrice ? "rent" : "buy"));
  }, [id, product]);

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <p className="text-slate-500 font-bold">商品が見つかりませんでした。</p>
        <Link to="/products" className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-primary text-white font-bold">商品一覧へ</Link>
      </div>
    );
  }

  const out = actionType === "rent" && Number(product.stock || 0) <= 0;
  const related = (products || []).filter((p) => p?.category === product.category && p.id !== product.id).slice(0, 4);

  const buildItem = () => ({
    id: product.id, name: product.name, image: product.image,
    rentPrice: product.rentPrice, rentPriceLongTerm: product.rentPriceLongTerm, buyPrice: product.buyPrice,
    quantity: Math.max(1, Number(quantity) || 1), type: actionType, rentalDays: 1, category: product.category, unit: product.unit,
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-4">
        <Link to="/" className="hover:text-primary">ホーム</Link> <span className="mx-1">/</span>
        <Link to="/products" className="hover:text-primary">商品一覧</Link> <span className="mx-1">/</span>
        <span className="text-slate-600">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-10 items-start">
        {/* Image */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 aspect-square relative">
          <div className="absolute inset-8 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${product.image}")` }} />
          {product.badge && <span className={`absolute top-4 left-4 px-2.5 py-1 rounded-md text-xs font-bold border ${product.badgeColor || "bg-slate-100 text-slate-600 border-slate-200"}`}>{product.badge}</span>}
          <button onClick={() => toggleFeatured(product.id)} className="absolute top-4 right-4 p-2 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-colors">
            <span className={`material-symbols-outlined text-[20px] ${isFeatured(product.id) ? "text-red-500 fill-1" : "text-slate-400"}`}>favorite</span>
          </button>
        </div>

        {/* Info */}
        <div>
          <span className="text-xs font-bold text-primary">{product.category}</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mt-1">{product.name}</h1>

          <div className="flex gap-3 mt-5">
            {product.rentPrice !== undefined && (
              <button onClick={() => setActionType("rent")} className={`flex-1 text-left p-4 rounded-xl border-2 transition-colors ${actionType === "rent" ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <div className={`text-xs font-bold uppercase mb-1 ${actionType === "rent" ? "text-primary" : "text-slate-400"}`}>レンタル</div>
                <div className="flex items-baseline gap-1"><span className="text-2xl font-extrabold text-slate-900">¥{product.rentPrice.toLocaleString()}</span><span className="text-sm text-slate-400">/日</span></div>
                {product.rentPriceLongTerm !== undefined && <div className="text-xs text-slate-500 mt-0.5">長期({LONG_TERM_THRESHOLD_DAYS}日〜) ¥{product.rentPriceLongTerm.toLocaleString()}/日</div>}
              </button>
            )}
            {SALES_ENABLED && product.buyPrice !== undefined && (
              <button onClick={() => setActionType("buy")} className={`flex-1 text-left p-4 rounded-xl border-2 transition-colors ${actionType === "buy" ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <div className={`text-xs font-bold uppercase mb-1 ${actionType === "buy" ? "text-primary" : "text-slate-400"}`}>購入</div>
                <div className="text-2xl font-extrabold text-slate-900">¥{product.buyPrice.toLocaleString()}</div>
              </button>
            )}
          </div>

          <p className="text-sm text-slate-500 mt-4">在庫: <span className="font-bold text-slate-700">{product.stock ?? 0}{product.unit ? ` ${product.unit}` : ""}</span></p>

          {/* Quantity + actions */}
          <div className="mt-5 flex items-center gap-4">
            <span className="text-sm font-bold text-slate-700">数量</span>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg gap-1 p-1">
              <button disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-9 h-9 grid place-items-center rounded-md bg-white shadow-sm text-slate-600 disabled:opacity-40"><span className="material-symbols-outlined text-[18px]">remove</span></button>
              <input type="number" inputMode="numeric" value={quantity} onChange={(e) => { const v = parseInt(e.target.value); setQuantity(isNaN(v) ? 1 : Math.max(1, Math.min(product.stock || 9999, v))); }} className="w-14 text-center text-base font-bold bg-transparent outline-none hide-arrows" />
              <button disabled={quantity >= (product.stock || 0)} onClick={() => setQuantity((q) => Math.min(product.stock || 9999, q + 1))} className="w-9 h-9 grid place-items-center rounded-md bg-white shadow-sm text-slate-600 disabled:opacity-40"><span className="material-symbols-outlined text-[18px]">add</span></button>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button disabled={out} onClick={() => { addToCart(buildItem()); triggerToast("カートに追加しました", "ok"); }} className="flex-1 py-3.5 rounded-xl border-2 border-primary text-primary font-bold hover:bg-primary/5 disabled:opacity-40 transition-colors">カートに入れる</button>
            <button disabled={out} onClick={() => { addToCart(buildItem()); navigate("/cart"); }} className="flex-1 py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-600 disabled:opacity-40 transition-colors">{out ? "在庫なし" : `今すぐ${actionType === "rent" ? "レンタル" : "購入"}`}</button>
          </div>

          {/* Specs / description */}
          <div className="mt-8">
            <h3 className="text-base font-extrabold text-slate-900 mb-2">商品詳細</h3>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{product.description || "商品の詳細情報についてはお問い合わせください。"}</p>
            {product.specs && (
              <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden text-sm">
                {Object.entries(product.specs).map(([k, v]) => (
                  <div key={k} className="flex border-b border-slate-100 last:border-0">
                    <div className="w-1/3 bg-slate-50 p-3 text-slate-500 font-bold">{k}</div>
                    <div className="w-2/3 p-3 text-slate-800">{v as string}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-extrabold text-slate-900 mb-4">関連商品</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {related.map((p) => (
              <Link key={p.id} to={`/product/${p.id}`} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="aspect-[4/3] bg-slate-50 overflow-hidden"><div className="w-full h-full bg-contain bg-center bg-no-repeat group-hover:scale-105 transition-transform duration-300" style={{ backgroundImage: `url("${p.image}")` }} /></div>
                <div className="p-3">
                  <div className="text-sm font-bold text-slate-900 line-clamp-2 group-hover:text-primary">{p.name}</div>
                  {p.rentPrice ? <div className="text-primary font-extrabold mt-1">¥{p.rentPrice.toLocaleString()}<span className="text-xs text-slate-400 font-medium">/日</span></div> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
