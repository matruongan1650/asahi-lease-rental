import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useProducts } from "../../context/ProductContext";
import { calculateRentalPrice, getTaxRate } from "../../utils/billing";
import { isVehicleCategory } from "../../utils/productUtils";

/** PC 用 カート（お客様デスクトップサイト）。モバイル Cart と同じ料金計算・カート処理を再利用。 */
export default function CartDesktop() {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, setQuantityAmount, totalItems } = useCart();
  const { products } = useProducts();

  let totalRentalPrice = 0;
  let totalBuyPrice = 0;
  let totalGuaranteeFee = 0;
  const hasVehicle = items.some((i) => isVehicleCategory(i.category) && i.type === "rent");

  items.forEach((item) => {
    const fullProduct = products.find((p) => p && p.id === item.id);
    let guaranteeFeeFlat = 0;
    if (item.type === "rent" && fullProduct?.isGuarantee) {
      const qty = item.quantity;
      if (fullProduct.guaranteeType === "flat") {
        guaranteeFeeFlat = (fullProduct.guaranteeRate || 0) * qty;
      } else if (fullProduct.guaranteeFees) {
        const g = fullProduct.guaranteeFees;
        if (qty <= 50) guaranteeFeeFlat = Number(g.range1) || 0;
        else if (qty <= 100) guaranteeFeeFlat = Number(g.range2) || 0;
        else if (qty <= 150) guaranteeFeeFlat = Number(g.range3) || 0;
        else if (qty <= 200) guaranteeFeeFlat = Number(g.range4) || 0;
        else if (qty <= 250) guaranteeFeeFlat = Number(g.range5) || Number(g.range4) || 0;
        else guaranteeFeeFlat = Number(g.range6) || Number(g.range5) || Number(g.range4) || 0;
      }
    }
    item.guaranteeFeeFlat = guaranteeFeeFlat;
    if (item.type === "rent" && item.rentPrice) {
      const { totalPrice } = calculateRentalPrice(item.rentPrice, undefined, undefined, hasVehicle, isVehicleCategory(item.category), item.rentPriceLongTerm);
      totalRentalPrice += totalPrice * item.quantity;
      totalGuaranteeFee += guaranteeFeeFlat;
    } else if (item.type === "buy" && item.buyPrice) {
      totalBuyPrice += item.buyPrice * item.quantity;
    }
  });

  const subtotal = totalRentalPrice + totalBuyPrice + totalGuaranteeFee;
  const tax = Math.floor(subtotal * getTaxRate()); // 管理設定の税率（軽減税率8%等）を反映。他画面と一致させる。
  const total = subtotal + tax;

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <span className="material-symbols-outlined text-[72px] text-slate-200">shopping_cart</span>
        <h1 className="text-2xl font-extrabold text-slate-800 mt-2">カートは空です</h1>
        <p className="text-slate-500 mt-2">商品一覧から保安用品・車両を追加してください。</p>
        <Link to="/products" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-blue-600">
          <span className="material-symbols-outlined text-[20px]">storefront</span>商品一覧へ
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-1"><Link to="/" className="hover:text-primary">ホーム</Link> <span className="mx-1">/</span> カート</nav>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-6">カート <span className="text-base font-bold text-slate-400">（{totalItems}点）</span></h1>

      <div className="flex gap-8 items-start flex-col lg:flex-row">
        {/* Items */}
        <div className="flex-1 min-w-0 w-full space-y-3">
          <div className="rounded-xl bg-blue-50/60 p-4 border border-blue-100 text-xs text-blue-800 flex gap-2">
            <span className="material-symbols-outlined text-[18px] text-blue-600 shrink-0">info</span>
            <p className="leading-relaxed">
              {hasVehicle
                ? "※車両を含むため、レンタル期間が3日未満でも最低3日分の料金が発生します。"
                : "※レンタル期間が10日未満でも最低10日分の料金が発生します（車両を含む場合は最低3日分）。"}
            </p>
          </div>

          {items.map((item) => {
            const isRental = item.type === "rent";
            const price = isRental ? item.rentPrice : item.buyPrice;
            return (
              <div key={`${item.id}-${item.type}`} className="flex gap-4 rounded-2xl bg-white p-4 border border-slate-200 shadow-sm">
                <div className="w-28 h-28 shrink-0 rounded-xl bg-slate-50 bg-contain bg-center bg-no-repeat border border-slate-100" style={{ backgroundImage: `url("${item.image}")` }} />
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${isRental ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{isRental ? "レンタル" : "購入"}</span>
                      <h3 className="text-base font-bold text-slate-900 mt-1 line-clamp-2">{item.name}</h3>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-rose-500 transition-colors"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                  </div>
                  <div className="mt-auto flex items-end justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-700">¥{price?.toLocaleString()}{isRental && <span className="text-xs font-normal text-slate-400">/日</span>}</p>
                      {item.guaranteeFeeFlat ? <p className="text-[11px] font-bold text-amber-600 mt-0.5">保証料: +¥{item.guaranteeFeeFlat.toLocaleString()}</p> : null}
                    </div>
                    <div className="flex items-center rounded-lg bg-slate-50 border border-slate-200 gap-1 p-1">
                      <button disabled={item.quantity <= 1} onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 grid place-items-center rounded-md bg-white shadow-sm text-slate-600 disabled:opacity-40"><span className="material-symbols-outlined text-[16px]">remove</span></button>
                      <input type="number" inputMode="numeric" value={item.quantity === 0 ? "" : item.quantity}
                        onChange={(e) => { const v = parseInt(e.target.value); setQuantityAmount(item.id, isNaN(v) ? 0 : v); }}
                        onBlur={(e) => { const v = parseInt(e.target.value); if (isNaN(v) || v < 1) setQuantityAmount(item.id, 1); }}
                        className="w-11 text-center text-sm font-bold bg-transparent outline-none hide-arrows" />
                      <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 grid place-items-center rounded-md bg-primary text-white shadow-sm"><span className="material-symbols-outlined text-[16px]">add</span></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <Link to="/products" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline mt-2">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>買い物を続ける
          </Link>
        </div>

        {/* Summary */}
        <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-24">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-extrabold text-slate-900 mb-4">ご注文内容</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">レンタル料</span><span className="font-bold text-slate-800">¥{totalRentalPrice.toLocaleString()}</span></div>
              {totalGuaranteeFee > 0 && <div className="flex justify-between"><span className="text-slate-500">初回準備・保証料</span><span className="font-bold text-slate-800">¥{totalGuaranteeFee.toLocaleString()}</span></div>}
              {totalBuyPrice > 0 && <div className="flex justify-between"><span className="text-slate-500">購入金額</span><span className="font-bold text-slate-800">¥{totalBuyPrice.toLocaleString()}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">消費税 ({Math.round(getTaxRate() * 100)}%)</span><span className="font-bold text-slate-800">¥{tax.toLocaleString()}</span></div>
              <div className="h-px bg-slate-100 my-1" />
              <div className="flex items-center justify-between"><span className="font-extrabold text-slate-900">合計</span><span className="text-2xl font-extrabold text-primary">¥{total.toLocaleString()}</span></div>
            </div>
            <button onClick={() => navigate("/checkout")} className="w-full mt-5 py-3.5 rounded-xl bg-primary text-white font-bold hover:bg-blue-600 flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
              会計に進む <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">レンタル期間・納品先は次の画面で指定します。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
