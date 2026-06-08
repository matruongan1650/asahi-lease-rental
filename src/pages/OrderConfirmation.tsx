import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useCart } from "../context/CartContext";
import { isVehicleCategory } from '../utils/productUtils';

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart } = useCart();
  
  const state = location.state || {};
  const order = state.order || {};
  const { orderNumber = "-", items = [], total = 0, subtotal = 0, tax = 0, deliveryLocation = "-", deliveryDate = "-", siteName = "-", constructionNumber = "-", companyName = "-", personName = "-" } = order;

  useEffect(() => {
    // Clear the cart when entering confirmation page
    clearCart();
  }, [clearCart]);

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden pb-24">
      <div className="sticky top-0 z-10 flex items-center bg-surface-light dark:bg-surface-dark px-4 py-3 shadow-sm transition-colors duration-200">
        <button onClick={() => navigate("/")} className="flex size-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined text-text-main-light dark:text-text-main-dark">close</span>
        </button>
        <h2 className="flex-1 text-center text-lg font-bold leading-tight tracking-[-0.015em] pr-10">
          注文確認
        </h2>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 bg-surface-light dark:bg-surface-dark px-6 py-8 mb-4 shadow-sm transition-colors duration-200">
        <div className="relative flex items-center justify-center size-20 rounded-full bg-green-100 dark:bg-green-900/30">
          <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-[48px]">check_circle</span>
        </div>
        <div className="flex max-w-[480px] flex-col items-center gap-2">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-center">
            ご注文ありがとうございます
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm text-center">
            注文が確定しました。<br/>登録されたメールアドレスに確認メールを送信しました。
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg bg-background-light dark:bg-background-dark py-3 px-6 w-full max-w-[320px]">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">注文番号</span>
          <span className="text-lg font-bold tracking-widest text-primary">{orderNumber}</span>
        </div>
      </div>

      <div className="mb-4 bg-surface-light dark:bg-surface-dark shadow-sm transition-colors duration-200">
        <h3 className="px-4 py-4 text-base font-bold leading-tight border-b border-border-light dark:border-border-dark">
          注文内容
        </h3>
        <div className="flex flex-col divide-y divide-border-light dark:divide-border-dark">
          {items.map((item: any) => {
            let price = item.calculatedPrice;
            if (price === undefined) {
              const hasVehicle = items.some((i: any) => isVehicleCategory(i.category) && i.type === 'rent');
              let minChargeableDays = 1;
              if (!isVehicleCategory(item.category) && item.type === 'rent') {
                minChargeableDays = hasVehicle ? 3 : 10;
              }
              const chargeableDays = Math.max(item.rentalDays || 1, minChargeableDays);
              price = item.type === 'rent' ? (item.rentPrice * chargeableDays) : item.buyPrice;
            }
            
            return (
              <div key={`${item.id}-${item.type}`} className="flex flex-col border-b border-border-light dark:border-border-dark last:border-0">
                <div className="flex gap-4 p-4">
                  <div className="bg-center bg-no-repeat bg-cover rounded-lg w-20 h-20 shrink-0 bg-slate-200 dark:bg-slate-700 relative overflow-hidden group">
                    <img alt={item.name} className="w-full h-full object-contain" src={item.image}/>
                  </div>
                  <div className="flex flex-col flex-1 justify-between py-1">
                    <div>
                      <p className="font-bold text-sm line-clamp-2">{item.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.type === 'rent' ? `レンタル (${item.rentalDays}日間)` : '購入品'}</p>
                    </div>
                    <div className="flex items-end justify-between">
                      <p className="text-sm text-slate-500 dark:text-slate-400">数量: {item.quantity}</p>
                      <p className="font-bold text-base">¥{price.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                {item?.monthlyBreakdown && item.monthlyBreakdown.length > 0 && (
                  <div className="px-4 pb-4 pt-1 mx-4 mb-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/80">
                    <p className="text-[10px] font-bold text-slate-500 mb-1 pt-2">月別ご請求額（自動分割）</p>
                    <div className="flex flex-col gap-1">
                      {item.monthlyBreakdown.map((b: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-xs">
                          <span className="text-slate-600 dark:text-slate-400">
                            {b.monthStr}分 ({b.days}日間)
                            {b.discounted && <span className="ml-1 text-[#f59e0b] bg-[#f59e0b]/10 px-1 py-0.5 rounded text-[9px]">長期</span>}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-300">¥{(b.price * parseInt(item.quantity)).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
      })}
      
      {items.length === 0 && (
        <div className="p-4 text-slate-500 text-sm">注文情報が見つかりません。</div>
      )}
    </div>

    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-border-light dark:border-border-dark space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-500 dark:text-slate-400">小計</span>
        <span className="font-medium">¥{subtotal.toLocaleString()}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-500 dark:text-slate-400">消費税 (10%)</span>
        <span className="font-medium">¥{tax.toLocaleString()}</span>
      </div>
      <div className="flex justify-between items-center pt-2 border-t border-dashed border-border-light dark:border-border-dark mt-2">
        <span className="font-bold text-base">合計金額</span>
        <span className="font-bold text-xl text-primary">¥{total.toLocaleString()}</span>
      </div>
    </div>
      </div>

      <div className="bg-surface-light dark:bg-surface-dark shadow-sm transition-colors duration-200">
        <h3 className="px-4 py-4 text-base font-bold leading-tight border-b border-border-light dark:border-border-dark">
          お客様情報・現場情報
        </h3>
        <div className="p-4 grid grid-cols-[30%_1fr] gap-x-4 gap-y-6 text-sm">
          <div className="contents">
            <p className="text-slate-500 dark:text-slate-400 font-medium">会社名</p>
            <p className="font-medium">{companyName}</p>
          </div>
          <div className="contents">
            <p className="text-slate-500 dark:text-slate-400 font-medium">担当者名</p>
            <p className="font-medium">{personName}</p>
          </div>
          <div className="contents">
            <p className="text-slate-500 dark:text-slate-400 font-medium">現場名</p>
            <p className="font-medium">{siteName}</p>
          </div>
          <div className="contents">
            <p className="text-slate-500 dark:text-slate-400 font-medium">工事番号</p>
            <p className="font-medium">{constructionNumber}</p>
          </div>
          <div className="contents">
            <p className="text-slate-500 dark:text-slate-400 font-medium">レンタル期間</p>
            <p className="font-medium">{order.rentalStartDate ? `${order.rentalStartDate} 〜 ${order.rentalEndDate || ''}` : "指定なし"}</p>
          </div>
          <div className="contents">
            <p className="text-slate-500 dark:text-slate-400 font-medium">配送先住所</p>
            <p className="font-medium">{deliveryLocation}</p>
          </div>
          <div className="contents">
            <p className="text-slate-500 dark:text-slate-400 font-medium">配送希望日</p>
            <p className="font-medium">{deliveryDate}</p>
          </div>
        </div>
      </div>

      <div className="p-6 text-center pb-32">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          ※ 注文内容はマイページの「注文履歴」からいつでも確認できます。<br/>
          ※ 請求書は商品発送後に発行されます。
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark px-4 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe">
        <div className="flex flex-col gap-3 w-full max-w-md mx-auto">
          <Link to="/" className="flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-base font-bold text-white shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all">
            買い物を続ける
          </Link>
          <Link to="/orders" className="flex w-full items-center justify-center rounded-lg bg-transparent border border-border-light dark:border-border-dark px-4 py-3 text-base font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] transition-all">
            注文履歴を見る
          </Link>
        </div>
      </div>
    </div>
  );
}
