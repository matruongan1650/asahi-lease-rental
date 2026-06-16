import { useNavigate, useParams, Link } from "react-router-dom";
import { alertDialog } from "../components/AppDialog";
import React, { useState, useEffect } from "react";
import { useCart } from "../context/CartContext";
import { useFeatured } from "../context/FeaturedContext";
import { useProducts } from "../context/ProductContext";

export default function ProductDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { products } = useProducts();
  const { addToCart } = useCart();
  const { isFeatured, toggleFeatured } = useFeatured();
  const [quantity, setQuantity] = useState<number | string>(1);
  const [actionType, setActionType] = useState<'rent' | 'buy'>('rent');

  const product = products.find(p => p && p.id === id) || products.filter(Boolean)[0];

  useEffect(() => {
    window.scrollTo(0, 0);
    setQuantity(1);
    setActionType(product.rentPrice ? 'rent' : 'buy');
  }, [id, product]);
  
  const relatedProducts = (products || []).filter(p => p?.category === product?.category && p?.id !== product?.id).slice(0, 5);
  // もし同じカテゴリの商品が少ない場合は、他の商品を追加する
  if (relatedProducts.length < 5) {
    const others = (products || []).filter(p => p && p.id !== product?.id && !relatedProducts.find(r => r && r.id === p.id)).slice(0, 5 - relatedProducts.length);
    relatedProducts.push(...others);
  }

  const handleAddToCart = () => {
    const finalQuantity = typeof quantity === 'number' && !isNaN(quantity) ? quantity : 1;
    addToCart({
      id: product.id,
      name: product.name,
      image: product.image,
      rentPrice: product.rentPrice,
      rentPriceLongTerm: product.rentPriceLongTerm,
      buyPrice: product.buyPrice,
      quantity: finalQuantity,
      type: actionType,
      rentalDays: 1, // default 1
      category: product.category,
    });
    navigate("/cart");
  };

  const handleQuantityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value === '') {
      setQuantity('');
      return;
    }
    let value = parseInt(e.target.value);
    if (!isNaN(value)) {
      setQuantity(Math.max(1, Math.min(product.stock, value)));
    }
  };

  const handleQuantityChange = (delta: number) => {
    setQuantity(prev => {
      const p = typeof prev === 'number' ? prev : 1;
      return Math.max(1, Math.min(product.stock, p + delta));
    });
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-50 flex items-center bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 border-b border-slate-200 dark:border-slate-800 justify-between">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/")} className="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-700 text-slate-900 dark:text-white transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center truncate px-2">
          製品詳細
        </h1>
        <button className="flex size-10 shrink-0 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-700 text-slate-900 dark:text-white transition-colors">
          <span className="material-symbols-outlined text-[24px]">share</span>
        </button>
      </div>

      <div className="flex flex-col w-full pb-32">
        <div className="relative w-full aspect-square bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <div className="absolute inset-0 bg-contain bg-center bg-no-repeat p-8" style={{ backgroundImage: `url("${product.image}")`}}></div>
          <div className="absolute bottom-4 w-full flex justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary shadow-sm"></div>
            <div className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700 shadow-sm"></div>
            <div className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700 shadow-sm"></div>
          </div>
        </div>

        <div className="flex flex-col p-4 bg-white dark:bg-slate-800 mb-2">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2 className="text-xl font-bold leading-snug">{product.name}</h2>
            <button 
              onClick={() => toggleFeatured(product.id)}
              className="shrink-0 group focus:outline-none"
            >
              <span className={`material-symbols-outlined transition-colors ${isFeatured(product.id) ? "text-red-500 fill-1" : "text-slate-400 group-hover:text-red-500"}`}>favorite</span>
            </button>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex text-amber-400">
              <span className="material-symbols-outlined text-[18px] fill-1">star</span>
              <span className="material-symbols-outlined text-[18px] fill-1">star</span>
              <span className="material-symbols-outlined text-[18px] fill-1">star</span>
              <span className="material-symbols-outlined text-[18px] fill-1">star</span>
              <span className="material-symbols-outlined text-[18px] fill-1 text-slate-200 dark:text-slate-600">star_half</span>
            </div>
            <span className="text-sm font-bold">4.5</span>
            <span className="text-sm text-slate-400">(128件)</span>
          </div>
          <div className="flex gap-3">
            {product.rentPrice !== undefined && (
              <div 
                onClick={() => setActionType('rent')}
                className={`flex-1 p-3 rounded-xl border cursor-pointer transition-colors ${actionType === 'rent' ? 'bg-blue-50 dark:bg-blue-900/20 border-primary shadow-[0_0_0_1px_rgba(var(--primary-color),1)]' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-700'}`}
              >
                <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${actionType === 'rent' ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>レンタル</div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold ${actionType === 'rent' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>¥{product.rentPrice.toLocaleString()}</span>
                    <span className="text-sm font-medium text-slate-500">/ 日</span>
                  </div>
                  {product.rentPriceLongTerm !== undefined && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-medium text-slate-500">長期(&gt;15日):</span>
                      <span className={`text-sm font-bold ${actionType === 'rent' ? 'text-primary/80' : 'text-slate-600 dark:text-slate-400'}`}>¥{product.rentPriceLongTerm.toLocaleString()}</span>
                      <span className="text-xs font-medium text-slate-500">/ 日</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {product.buyPrice !== undefined && (
              <div 
                onClick={() => setActionType('buy')}
                className={`flex-1 p-3 rounded-xl border cursor-pointer transition-colors ${actionType === 'buy' ? 'bg-blue-50 dark:bg-blue-900/20 border-primary shadow-[0_0_0_1px_rgba(var(--primary-color),1)]' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-700'}`}
              >
                <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${actionType === 'buy' ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>購入</div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-xl font-bold ${actionType === 'buy' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>¥{product.buyPrice.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 mb-2">
          <h3 className="text-base font-bold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-primary"></span>
            {['軽トラック', '軽バン', '2tノーマル', '2tロング', '2t Wキャブノーマル'].includes(product.category) ? '車両詳細' : '商品詳細'}
          </h3>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 mb-4 whitespace-pre-wrap">
            {product.description || (product.category === "カラーコーン" 
              ? "工事現場やイベント会場など、あらゆるシーンで活躍するスタンダードな軽量カラーコーンです。柔軟性のあるポリエチレン素材を使用しており、寒冷地でも割れにくく耐久性に優れています。積み重ねて収納できるため、保管スペースをとりません。"
              : "商品の詳細情報については、お問い合わせください。")}
          </p>
          <div className="rounded-lg border border-slate-100 dark:border-slate-700 overflow-hidden text-sm">
            {product.specs ? (
              Object.entries(product.specs).map(([key, value]) => (
                <div key={key} className="flex border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div className="w-1/3 bg-slate-50 dark:bg-slate-700/50 p-2.5 text-slate-500 dark:text-slate-400 font-medium">{key}</div>
                  <div className="w-2/3 p-2.5 bg-white dark:bg-slate-800">{value as string}</div>
                </div>
              ))
            ) : (
              <>
                <div className="flex border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div className="w-1/3 bg-slate-50 dark:bg-slate-700/50 p-2.5 text-slate-500 dark:text-slate-400 font-medium">サイズ</div>
                  <div className="w-2/3 p-2.5 bg-white dark:bg-slate-800">標準サイズ</div>
                </div>
                <div className="flex border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div className="w-1/3 bg-slate-50 dark:bg-slate-700/50 p-2.5 text-slate-500 dark:text-slate-400 font-medium">重量</div>
                  <div className="w-2/3 p-2.5 bg-white dark:bg-slate-800">標準</div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 mb-2">
          <div className="flex items-center justify-between mb-4">
            <span className="font-bold text-sm">数量</span>
            <div className="quantity-input-container flex items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-1 gap-4">
              <button 
                disabled={Number(quantity) <= 1}
                onClick={() => handleQuantityChange(-1)} 
                className="size-8 flex items-center justify-center bg-white dark:bg-slate-700 rounded shadow-sm text-slate-600 dark:text-white active:scale-95 transition-transform disabled:opacity-50 relative z-10"
              >
                <span className="material-symbols-outlined text-[18px]">remove</span>
              </button>
              <input 
                type="text"
                value={quantity}
                onChange={handleQuantityInputChange}
                onBlur={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val) || val < 1) setQuantity(1);
                }}
                className="font-bold w-12 text-[16px] bg-transparent text-center outline-none border-none hide-arrows py-6 -my-6 px-4 -mx-4 relative z-0 cursor-pointer focus:cursor-text"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <button 
                disabled={Number(quantity) >= product.stock}
                onClick={() => handleQuantityChange(1)} 
                className="size-8 flex items-center justify-center bg-white dark:bg-slate-700 rounded shadow-sm text-slate-600 dark:text-white active:scale-95 transition-transform disabled:opacity-50 relative z-10"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => {
                addToCart({
                  id: product.id,
                  name: product.name,
                  image: product.image,
                  rentPrice: product.rentPrice,
                  rentPriceLongTerm: product.rentPriceLongTerm,
                  buyPrice: product.buyPrice,
                  quantity: Number(quantity) || 1,
                  type: actionType,
                  rentalDays: 1, // default 1
                  category: product.category,
                });
                void alertDialog("カートに追加しました");
              }}
              className="flex-1 py-3.5 px-4 rounded-xl border-2 border-primary text-primary dark:text-blue-400 dark:border-blue-400 font-bold text-sm active:bg-primary/5 transition-colors"
            >
                カートに入れる
            </button>
            <button 
              onClick={handleAddToCart}
              className="flex-1 py-3.5 px-4 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform"
            >
                今すぐ{actionType === 'rent' ? 'レンタル' : '購入'}
            </button>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 mb-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-slate-200 dark:bg-slate-600"></span>
              レビュー (128)
            </h3>
            <button className="text-xs font-bold text-primary">すべて見る</button>
          </div>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="size-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">YM</div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold">山田 太郎</span>
                  <span className="text-[10px] text-slate-400">2023/11/02</span>
                </div>
                <div className="flex text-amber-400 my-1">
                  <span className="material-symbols-outlined text-[14px] fill-1">star</span>
                  <span className="material-symbols-outlined text-[14px] fill-1">star</span>
                  <span className="material-symbols-outlined text-[14px] fill-1">star</span>
                  <span className="material-symbols-outlined text-[14px] fill-1">star</span>
                  <span className="material-symbols-outlined text-[14px] fill-1">star</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  現場での使い勝手がとても良いです。軽くて持ち運びも楽でした。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-slate-200 dark:bg-slate-600"></span>
              関連商品
            </h3>
          </div>
          <div className="flex overflow-x-auto hide-scrollbar gap-3 -mx-4 px-4 pb-2">
            {relatedProducts.map((relatedP) => (
              <Link to={`/product/${relatedP.id}`} key={relatedP.id} className="w-36 shrink-0 flex flex-col gap-2 group">
                <div className="aspect-square rounded-lg bg-slate-50 dark:bg-slate-900 overflow-hidden relative border border-slate-100 dark:border-slate-700">
                  <div className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-500" style={{ backgroundImage: `url("${relatedP.image}")`}}></div>
                </div>
                <div className="flex flex-col">
                  <h4 className="text-xs font-bold line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors">{relatedP.name}</h4>
                  {relatedP.rentPrice ? (
                    <span className="text-xs font-bold text-primary">¥{relatedP.rentPrice.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">/日</span></span>
                  ) : (
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">¥{relatedP.buyPrice?.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">(購入)</span></span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
