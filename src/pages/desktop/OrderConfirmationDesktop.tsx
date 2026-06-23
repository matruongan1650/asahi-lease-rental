import { Link, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useCart } from "../../context/CartContext";
import { isVehicleCategory } from "../../utils/productUtils";

/** PC 用 注文確認（お客様デスクトップサイト）。モバイル OrderConfirmation と同じ
 *  clearCart 効果・リダイレクトガード・料金フォールバック計算を再利用。 */
export default function OrderConfirmationDesktop() {
  const location = useLocation();
  const { clearCart } = useCart();

  const state = location.state || {};
  const order = state.order || {};
  const {
    orderNumber = "-",
    items = [],
    total = 0,
    subtotal = 0,
    tax = 0,
    deliveryLocation = "-",
    deliveryDate = "-",
    siteName = "-",
    constructionNumber = "-",
    companyName = "-",
    personName = "-",
  } = order;

  useEffect(() => {
    // 実際に注文を持って遷移してきた時だけカートを空にする
    // （リロードで state が消えた際にカートを誤って空にしないため）。
    if (state.order) clearCart();
  }, [clearCart, state.order]);

  // リロード／直接アクセスで注文情報が無い場合は、空（¥0・-）の確認画面を見せず注文履歴へ。
  if (!state.order) {
    return <Navigate to="/orders" replace />;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-4">
        <Link to="/" className="hover:text-primary">ホーム</Link>
        <span className="mx-1">/</span>注文確認
      </nav>

      {/* Success card */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
        <div className="flex items-center justify-center size-20 rounded-full bg-green-100">
          <span className="material-symbols-outlined text-green-600 text-[48px]">check_circle</span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mt-5">
          ご注文ありがとうございます
        </h1>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          注文が確定しました。<br />登録されたメールアドレスに確認メールを送信しました。
        </p>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 border border-slate-200 py-4 px-8 mt-6 w-full max-w-xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">注文番号</span>
          <span className="text-xl font-extrabold tracking-widest text-primary">{orderNumber}</span>
        </div>
      </div>

      {/* Order items */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm mt-6 overflow-hidden">
        <h2 className="px-6 py-4 text-base font-extrabold text-slate-900 border-b border-slate-100">注文内容</h2>
        <div className="divide-y divide-slate-100">
          {items.map((item: any) => {
            let price = item.calculatedPrice;
            if (price === undefined) {
              const hasVehicle = items.some((i: any) => isVehicleCategory(i.category) && i.type === "rent");
              let minChargeableDays = 1;
              if (!isVehicleCategory(item.category) && item.type === "rent") {
                minChargeableDays = hasVehicle ? 3 : 10;
              }
              const chargeableDays = Math.max(item.rentalDays || 1, minChargeableDays);
              // 単価未設定(0/undefined)でも NaN/クラッシュしないよう 0 にフォールバック。
              price = item.type === "rent" ? (item.rentPrice || 0) * chargeableDays : (item.buyPrice || 0);
            }

            return (
              <div key={`${item.id}-${item.type}`} className="flex flex-col">
                <div className="flex gap-4 p-6">
                  <div className="w-24 h-24 shrink-0 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                    <img alt={item.name} className="w-full h-full object-contain" src={item.image} />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0 justify-between">
                    <div>
                      <p className="font-bold text-base text-slate-900 line-clamp-2">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {item.type === "rent" ? `レンタル (${item.rentalDays}日間)` : "購入品"}
                      </p>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                      <p className="text-sm text-slate-500">数量: {item.quantity}</p>
                      <p className="font-extrabold text-lg text-slate-900">¥{((price || 0) * (item.quantity || 1)).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                {item?.monthlyBreakdown && item.monthlyBreakdown.length > 0 && (
                  <div className="px-6 pb-6 -mt-2">
                    <div className="px-4 py-3 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                      <p className="text-[11px] font-bold text-slate-500 mb-2">月別ご請求額（自動分割）</p>
                      <div className="flex flex-col gap-1.5">
                        {item.monthlyBreakdown.map((b: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="text-slate-600">
                              {b.monthStr}分 ({b.days}日間)
                              {b.discounted && (
                                <span className="ml-1 text-[#f59e0b] bg-[#f59e0b]/10 px-1.5 py-0.5 rounded text-[10px] font-bold">長期</span>
                              )}
                            </span>
                            <span className="font-bold text-slate-800">
                              ¥{(b.price * parseInt(item.quantity)).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="p-6 text-slate-500 text-sm">注文情報が見つかりません。</div>
          )}
        </div>

        {/* Totals */}
        <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 space-y-2.5">
          {(() => {
            // 保証料は明細の calculatedPrice に含めず subtotal に内包されるため、別行で明示する（×数量しない）。
            const g = (items || []).reduce((s: number, it: any) => s + Number(it.guaranteeFeeFlat || 0), 0);
            return g > 0 ? (
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">初回準備・保証料</span>
                <span className="font-bold text-slate-800">¥{g.toLocaleString()}</span>
              </div>
            ) : null;
          })()}
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">小計</span>
            <span className="font-bold text-slate-800">¥{subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">消費税 (10%)</span>
            <span className="font-bold text-slate-800">¥{tax.toLocaleString()}</span>
          </div>
          <div className="h-px bg-slate-200 my-1" />
          <div className="flex justify-between items-center">
            <span className="font-extrabold text-base text-slate-900">合計金額</span>
            <span className="font-extrabold text-2xl text-primary">¥{total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Customer / site info */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm mt-6 overflow-hidden">
        <h2 className="px-6 py-4 text-base font-extrabold text-slate-900 border-b border-slate-100">お客様情報・現場情報</h2>
        <dl className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-slate-500 font-medium">会社名</dt>
            <dd className="font-bold text-slate-900">{companyName}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-slate-500 font-medium">担当者名</dt>
            <dd className="font-bold text-slate-900">{personName}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-slate-500 font-medium">現場名</dt>
            <dd className="font-bold text-slate-900">{siteName}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-slate-500 font-medium">工事番号</dt>
            <dd className="font-bold text-slate-900">{constructionNumber}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-slate-500 font-medium">レンタル期間</dt>
            <dd className="font-bold text-slate-900">
              {order.rentalStartDate ? `${order.rentalStartDate} 〜 ${order.rentalEndDate || ""}` : "指定なし"}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-slate-500 font-medium">配送先住所</dt>
            <dd className="font-bold text-slate-900">{deliveryLocation}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-slate-500 font-medium">配送希望日</dt>
            <dd className="font-bold text-slate-900">{deliveryDate}</dd>
          </div>
        </dl>
      </div>

      {/* Notes */}
      <p className="text-xs text-slate-500 leading-relaxed text-center mt-6">
        ※ 注文内容はマイページの「注文履歴」からいつでも確認できます。<br />
        ※ 請求書は商品発送後に発行されます。
      </p>

      {/* In-flow CTA buttons (NOT fixed) */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <Link
          to="/"
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/20 hover:bg-blue-600 active:scale-[0.99] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">storefront</span>買い物を続ける
        </Link>
        <Link
          to="/orders"
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 px-6 py-3.5 text-base font-bold text-slate-900 hover:bg-slate-50 active:scale-[0.99] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">receipt_long</span>注文履歴を見る
        </Link>
      </div>
    </div>
  );
}
