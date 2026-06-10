import React, { FC } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart, CartItem as CartItemType } from "../context/CartContext";
import { useProducts } from "../context/ProductContext";
import { calculateRentalPrice } from "../utils/billing";
import { isVehicleCategory } from '../utils/productUtils';

export default function Cart() {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, setQuantityAmount, totalItems } = useCart();
  const { products } = useProducts();

  const handleUpdateQuantity = (id: string, delta: number) => {
    updateQuantity(id, delta);
  };

  const handleSetQuantity = (id: string, amount: number) => {
    setQuantityAmount(id, amount);
  };

  const handleRemoveItem = (id: string) => {
    removeItem(id);
  };

  let totalRentalPrice = 0;
  let totalBuyPrice = 0;
  let totalGuaranteeFee = 0;
  
  const hasVehicle = items.some(i => isVehicleCategory(i.category) && i.type === 'rent');

  items.forEach(item => {
    const fullProduct = products.find(p => p && p.id === item.id);
    let guaranteeFeeFlat = 0;
    if (item.type === 'rent' && fullProduct?.isGuarantee) {
      const qty = item.quantity;
      if (fullProduct.guaranteeType === 'flat') {
        guaranteeFeeFlat = (fullProduct.guaranteeRate || 0) * qty;
      } else if (fullProduct.guaranteeFees) {
        if (qty <= 50) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range1) || 0;
        else if (qty <= 100) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range2) || 0;
        else if (qty <= 150) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range3) || 0;
        else if (qty <= 200) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range4) || 0;
        else if (qty <= 250) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range5) || Number(fullProduct.guaranteeFees.range4) || 0;
        else guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range6) || Number(fullProduct.guaranteeFees.range5) || Number(fullProduct.guaranteeFees.range4) || 0;
      }
    }
    
    item.guaranteeFeeFlat = guaranteeFeeFlat;

    if (item.type === 'rent' && item.rentPrice) {
      // Cart has no dates yet
      const { totalPrice: itemTotal } = calculateRentalPrice(
        item.rentPrice,
        undefined, 
        undefined,
        hasVehicle,
        isVehicleCategory(item.category),
        item.rentPriceLongTerm
      );
      totalRentalPrice += itemTotal * item.quantity;
      totalGuaranteeFee += guaranteeFeeFlat;
    } else if (item.type === 'buy' && item.buyPrice) {
      totalBuyPrice += item.buyPrice * item.quantity;
    }
  });

  const subtotal = totalRentalPrice + totalBuyPrice + totalGuaranteeFee;
  const tax = Math.floor(subtotal * 0.1);
  const total = subtotal + tax;

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/90 px-4 py-3 backdrop-blur-md dark:bg-background-dark/90 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/")} className="group flex h-10 w-10 items-center justify-center rounded-full text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h1 className="flex-1 text-center text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          カート
        </h1>
        <div className="h-10 w-10"></div> 
      </header>

      <main className="flex flex-col gap-4 p-4 pb-32">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-700">shopping_cart</span>
            <p className="text-slate-500 font-medium">カートは空です</p>
            <Link to="/" className="text-primary font-bold">商品を見る</Link>
          </div>
        ) : (
          <>
            {/* 最小請求日数に関する注意書き */}
            <div className="rounded-xl bg-blue-50/50 p-4 border border-blue-100 text-xs text-blue-800 dark:bg-blue-950/20 dark:border-blue-900/50 dark:text-blue-300">
              <div className="flex gap-2">
                <span className="material-symbols-outlined text-[18px] text-blue-600 dark:text-blue-400 shrink-0">info</span>
                <div className="space-y-1">
                  <p className="font-bold">最小請求日数に関する注意</p>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {hasVehicle 
                      ? "※カートに車両が含まれているため、レンタル期間が3日未満の場合でも最低3日分のレンタル料が発生します。"
                      : "※レンタル期間が10日未満の場合でも最低10日分のレンタル料が発生します（車両が含まれる場合は最低3日分となります）。"
                    }
                  </p>
                </div>
              </div>
            </div>

            {items.map(item => (
              <CartItemView 
                key={`${item.id}-${item.type}`}
                item={item}
                onRemove={() => handleRemoveItem(item.id)}
                onUpdateQuantity={(delta) => handleUpdateQuantity(item.id, delta)}
                onSetQuantity={(amount) => handleSetQuantity(item.id, amount)}
              />
            ))}

            <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-800 dark:border dark:border-slate-700">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">レンタル料</span>
                  <span className="font-medium text-slate-900 dark:text-white">¥{totalRentalPrice.toLocaleString()}</span>
                </div>
                {totalGuaranteeFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">初回準備・保証料</span>
                    <span className="font-medium text-slate-900 dark:text-white">¥{totalGuaranteeFee.toLocaleString()}</span>
                  </div>
                )}
                {totalBuyPrice > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">購入金額</span>
                    <span className="font-medium text-slate-900 dark:text-white">¥{totalBuyPrice.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">税金 (10%)</span>
                  <span className="font-medium text-slate-900 dark:text-white">¥{tax.toLocaleString()}</span>
                </div>
                <div className="my-1 h-px w-full bg-slate-100 dark:bg-slate-700"></div>
                <div className="flex items-center justify-between text-base">
                  <span className="font-bold text-slate-900 dark:text-white">合計</span>
                  <span className="text-xl font-extrabold text-primary dark:text-primary">¥{total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {totalItems > 0 && (
        <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-10 w-full max-w-[480px] border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-background-dark/95 pb-safe">
          <div className="mx-auto max-w-lg">
            <Link to="/checkout" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-600 active:scale-[0.98]">
              <span>会計に進む</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

const CartItemView: FC<{ item: CartItemType, onRemove: () => void, onUpdateQuantity: (delta: number) => void, onSetQuantity?: (val: number) => void }> = ({ item, onRemove, onUpdateQuantity, onSetQuantity }) => {
  const isRental = item.type === 'rent';
  const typeText = isRental ? "レンタル" : "購入";
  const badgeClass = isRental
    ? "bg-blue-50 text-blue-700 ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-400/30"
    : "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-400/30";
    
  const price = isRental ? item.rentPrice : item.buyPrice;

  return (
    <div className="group relative flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-slate-800 dark:border dark:border-slate-700">
      <div className="flex gap-4">
        <div className="relative aspect-square h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900">
          <div className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${item.image}")`}}></div>
        </div>
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <span className={`mb-1 inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass}`}>{typeText}</span>
              <button onClick={onRemove} className="text-slate-400 hover:text-red-500 transition-colors dark:text-slate-500 dark:hover:text-red-400">
                <span className="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </div>
            <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-white line-clamp-2">{item.name}</h3>
          </div>
          <div className="flex items-end justify-between mt-2">
            <div className="flex flex-col">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">¥{price?.toLocaleString()} {isRental && <span className="text-xs font-normal text-slate-500 dark:text-slate-400">/日</span>}</p>
              {item.guaranteeFeeFlat !== undefined && item.guaranteeFeeFlat > 0 && (
                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-500 mt-1">保証料: +¥{item.guaranteeFeeFlat.toLocaleString()}</p>
              )}
            </div>
            <div className="flex items-center rounded-lg bg-slate-50 p-1 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 gap-1">
              <button onClick={() => onUpdateQuantity(-1)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:text-primary dark:bg-slate-700 dark:text-slate-200 transition-all">
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <input 
                className="w-10 bg-transparent text-center text-[16px] font-bold text-slate-900 focus:outline-none dark:text-white outline-none hide-arrows" 
                type="number" 
                inputMode="numeric"
                pattern="[0-9]*"
                value={item.quantity === 0 ? '' : item.quantity}
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val) && onSetQuantity) onSetQuantity(0);
                  else if (onSetQuantity) onSetQuantity(val);
                }}
                onBlur={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val) || val < 1) {
                    if (onSetQuantity) onSetQuantity(1);
                  }
                }}
              />
              <button onClick={() => onUpdateQuantity(1)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-white shadow-sm hover:bg-primary/90 transition-all">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
