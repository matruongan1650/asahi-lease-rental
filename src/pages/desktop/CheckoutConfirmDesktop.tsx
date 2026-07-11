import React, { useState } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useOrders } from "../../context/OrderContext";
import { useCart } from "../../context/CartContext";
import { useProducts } from "../../context/ProductContext";
import { alertDialog } from "../../components/AppDialog";
import { getItemUnit } from "../../utils/productUtils";

/** PC 用 注文確認（お客様デスクトップサイト）。モバイル CheckoutConfirm と同じ注文確定処理を再利用。 */
export default function CheckoutConfirmDesktop() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addOrder } = useOrders();
  const { clearCart } = useCart();
  const { products } = useProducts();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orderData = location.state?.orderData;

  if (!orderData) {
    return <Navigate to="/cart" replace />;
  }

  const handleOrderConfirm = async () => {
    if (isSubmitting) return; // 連打による二重注文を防止
    setIsSubmitting(true);
    // 注文確定直前に最新在庫と再照合する（カート投入時クランプだけでは 3s ポーリング/長期保持で
    // 在庫超過のまま確定できてしまう）(C1)。超過・取扱終了があれば中断して確認を促す。
    if ((products || []).length > 0) {
      const problems: string[] = [];
      (orderData.items || []).forEach((it: any) => {
        if (!it || it.type !== 'rent') return;
        const prod = (products || []).find((p: any) => p && p.id === it.id);
        if (!prod) { problems.push(`${it.name}：現在お取り扱いがありません`); return; }
        const st = Number(prod.stock);
        if (Number.isFinite(st) && Number(it.quantity) > Math.max(0, st)) {
          problems.push(`${it.name}：在庫 ${Math.max(0, st)} に対して数量 ${it.quantity}`);
        }
      });
      if (problems.length > 0) {
        void alertDialog("在庫状況が変わったため注文を確定できません。数量をご調整ください。\n" + problems.join("\n"));
        setIsSubmitting(false);
        return;
      }
    }
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
    <div className="max-w-5xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">ホーム</Link>
        <span className="mx-1">/</span>
        <Link to="/cart" className="hover:text-primary">カート</Link>
        <span className="mx-1">/</span>
        <Link to="/checkout" className="hover:text-primary">会計</Link>
        <span className="mx-1">/</span>
        注文確認
      </nav>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-6">注文確認</h1>

      <div className="flex gap-8 items-start flex-col lg:flex-row">
        {/* Left: order / site info */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">description</span>
              <h2 className="text-base font-extrabold text-slate-900">注文情報</h2>
            </div>
            <dl className="grid grid-cols-[140px_1fr] gap-y-4 text-sm px-6 py-5">
              <dt className="text-slate-500 font-medium">現場名</dt>
              <dd className="text-slate-900 font-medium">{orderData.siteName}</dd>

              <dt className="text-slate-500 font-medium">工事番号</dt>
              <dd className="text-slate-900 font-medium">{orderData.constructionNumber}</dd>

              <dt className="text-slate-500 font-medium">レンタル期間</dt>
              <dd className="text-slate-900 font-medium">
                {orderData.rentalStartDate} 〜 {orderData.rentalEndDate}
              </dd>

              <dt className="text-slate-500 font-medium">納品希望日</dt>
              <dd className="text-slate-900 font-medium">{orderData.deliveryDate}</dd>

              {orderData.deliveryLocation && (
                <>
                  <dt className="text-slate-500 font-medium">配達先</dt>
                  <dd className="text-slate-900 font-medium">{orderData.deliveryLocation}</dd>
                </>
              )}

              <dt className="text-slate-500 font-medium">担当者</dt>
              <dd className="text-slate-900 font-medium">
                {orderData.companyName && `${orderData.companyName} `}{orderData.personName}
              </dd>

              {orderData.notes && (
                <>
                  <dt className="text-slate-500 font-medium">備考</dt>
                  <dd className="text-slate-900 font-medium whitespace-pre-wrap">{orderData.notes}</dd>
                </>
              )}
            </dl>
          </div>
        </div>

        {/* Right: items + total + place order */}
        <aside className="w-full lg:w-96 shrink-0 lg:sticky lg:top-6 space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">inventory_2</span>
              <h2 className="text-base font-extrabold text-slate-900">商品一覧</h2>
            </div>
            <div className="flex flex-col gap-2 p-3 max-h-[420px] overflow-y-auto">
              {orderData.items.map((item: any) => (
                <div key={`${item.id}-${item.type}`} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="bg-white rounded-lg h-12 w-12 shrink-0 bg-center bg-contain bg-no-repeat border border-slate-100" style={{ backgroundImage: `url("${item.image}")` }}></div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{item.name}</h4>
                    <p className="text-xs text-slate-500">
                      {item.type === 'rent' ? 'レンタル' : '販売'} × {item.quantity}{getItemUnit(item)}
                      {item.guaranteeFeeFlat && item.guaranteeFeeFlat > 0 ? <span className="block text-[10px] text-slate-400 mt-0.5">※初回保証料 ¥{Math.round(item.guaranteeFeeFlat).toLocaleString()} を別途加算</span> : null}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900">
                      ¥{((item.calculatedPrice ?? item.buyPrice ?? 0) * item.quantity).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-5">
              <span className="text-sm font-medium text-slate-500">お支払い合計</span>
              <span className="text-2xl font-extrabold text-primary">¥{orderData.total.toLocaleString()}</span>
            </div>
            <button
              disabled={isSubmitting}
              onClick={handleOrderConfirm}
              className="w-full py-3.5 rounded-xl bg-primary text-white font-bold hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {isSubmitting ? (
                <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
              )}
              {isSubmitting ? "処理中..." : "注文"}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">「注文」を押すと内容を確定し、注文完了画面へ進みます。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
