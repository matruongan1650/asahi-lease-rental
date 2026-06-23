import React, { useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useOrders } from "../context/OrderContext";
import { useCart } from "../context/CartContext";
import { alertDialog } from "../components/AppDialog";
import { getItemUnit } from "../utils/productUtils";
import { useIsDesktop } from "../hooks/useIsDesktop";
import CheckoutConfirmDesktop from "./desktop/CheckoutConfirmDesktop";

export default function CheckoutConfirm() {
  return useIsDesktop() ? <CheckoutConfirmDesktop /> : <CheckoutConfirmMobile />;
}

function CheckoutConfirmMobile() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addOrder } = useOrders();
  const { clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const orderData = location.state?.orderData;

  if (!orderData) {
    return <Navigate to="/cart" replace />;
  }

  const handleOrderConfirm = async () => {
    if (isSubmitting) return; // 連打による二重注文を防止
    setIsSubmitting(true);
    try {
      // Add the order
      const newOrder = await addOrder({
        items: orderData.items,
        total: orderData.total,
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        deliveryLocation: orderData.deliveryLocation,
        deliveryDate: orderData.deliveryDate,
        siteName: orderData.siteName,
        constructionNumber: orderData.constructionNumber,
        companyName: orderData.companyName,
        personName: orderData.personName,
        personLastName: orderData.personLastName,
        personFirstName: orderData.personFirstName,
        rentalStartDate: orderData.rentalStartDate,
        rentalEndDate: orderData.rentalEndDate,
        // 発注アカウント情報（admin / 帳票で参照）
        userId: orderData.userId,
        userEmail: orderData.userEmail,
        userPhone: orderData.userPhone,
        notes: orderData.notes,
      });

      // In many apps, placing an order clears the cart
      clearCart();

      navigate("/order-confirmation", { state: { order: newOrder }, replace: true });
    } catch (e) {
      // 失敗時はスピナーで固まらせず、エラーを知らせて再試行できるようにする。
      console.error("[checkout] 注文の確定に失敗しました", e);
      void alertDialog("注文の確定に失敗しました。通信状況をご確認のうえ、もう一度お試しください。");
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm p-4 pb-2 justify-between border-b border-slate-200 dark:border-slate-800/50">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate('/checkout')} className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">注文確認</h2>
      </header>

      <section className="mt-4 px-4 pb-32">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden mb-6 p-4">
          <h3 className="text-slate-900 dark:text-white text-base font-bold mb-4 border-b border-slate-100 dark:border-slate-700 pb-2">注文情報</h3>
          
          <dl className="grid grid-cols-[100px_1fr] gap-y-3 text-sm">
            <dt className="text-slate-500 font-medium">現場名</dt>
            <dd className="text-slate-900 dark:text-white font-medium">{orderData.siteName}</dd>
            
            <dt className="text-slate-500 font-medium">工事番号</dt>
            <dd className="text-slate-900 dark:text-white font-medium">{orderData.constructionNumber}</dd>

            <dt className="text-slate-500 font-medium">レンタル期間</dt>
            <dd className="text-slate-900 dark:text-white font-medium">
              {orderData.rentalStartDate} 〜 {orderData.rentalEndDate}
            </dd>

            <dt className="text-slate-500 font-medium">納品希望日</dt>
            <dd className="text-slate-900 dark:text-white font-medium">{orderData.deliveryDate}</dd>
            
            {orderData.deliveryLocation && (
              <>
                <dt className="text-slate-500 font-medium">配達先</dt>
                <dd className="text-slate-900 dark:text-white font-medium">{orderData.deliveryLocation}</dd>
              </>
            )}

            <dt className="text-slate-500 font-medium">担当者</dt>
            <dd className="text-slate-900 dark:text-white font-medium">
              {orderData.companyName && `${orderData.companyName} `}{orderData.personName}
            </dd>

            {orderData.notes && (
              <>
                <dt className="text-slate-500 font-medium">備考</dt>
                <dd className="text-slate-900 dark:text-white font-medium whitespace-pre-wrap">{orderData.notes}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden mb-6">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-slate-900 dark:text-white text-base font-bold">商品一覧</h3>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {orderData.items.map((item: any) => (
              <div key={`${item.id}-${item.type}`} className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="bg-white dark:bg-slate-800 rounded-lg h-12 w-12 shrink-0 bg-center bg-cover border border-slate-100 dark:border-slate-700" style={{ backgroundImage: `url("${item.image}")`}}></div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.name}</h4>
                  <p className="text-xs text-slate-500">
                    {item.type === 'rent' ? 'レンタル' : '販売'} × {item.quantity}{getItemUnit(item)}
                    {item.guaranteeFeeFlat && item.guaranteeFeeFlat > 0 ? <span className="block text-[10px] text-slate-400 mt-0.5">※初回保証料 ¥{Math.round(item.guaranteeFeeFlat).toLocaleString()} を別途加算</span> : null}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    ¥{((item.calculatedPrice ?? item.buyPrice ?? 0) * item.quantity).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 pb-8 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 pb-safe">
        <div className="w-full flex flex-col gap-3">
          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">お支払い合計</span>
            <span className="text-xl font-extrabold text-slate-900 dark:text-white">¥{orderData.total.toLocaleString()}</span>
          </div>
          <button 
            disabled={isSubmitting}
            onClick={handleOrderConfirm}
            className="f7-cta w-full"
          >
            {isSubmitting ? (
              <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
            )}
            {isSubmitting ? "処理中..." : "注文"}
          </button>
        </div>
      </div>
    </>
  );
}
