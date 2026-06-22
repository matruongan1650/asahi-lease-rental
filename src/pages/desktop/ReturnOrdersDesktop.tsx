import { Link, useNavigate } from "react-router-dom";
import { useOrders } from "../../context/OrderContext";
import { useUser } from "../../context/UserContext";
import { isReturnEligible } from "../../utils/orderStatus";

/** PC 用 返却する注文の選択（お客様デスクトップサイト）。モバイル ReturnOrders と同じ抽出ロジックを再利用。 */
export default function ReturnOrdersDesktop() {
  const navigate = useNavigate();
  const { orders } = useOrders();
  const { currentUser } = useUser();

  // 本人の注文のうち、未返却のレンタル品が残っているものだけを表示
  // （注文履歴と同様、同じ会社でもアカウントごとに分離する）。
  const returnableOrders = orders.filter(order =>
    currentUser && order.userId === currentUser.id &&
    isReturnEligible(order.status) &&
    order.items.some(item => item.type === 'rent' && (item.returnedQuantity || 0) < item.quantity)
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">ホーム</Link> <span className="mx-1">/</span> 返却
      </nav>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-1">返却する注文を選択</h1>
      <p className="text-sm text-slate-500 mb-6">レンタル中・延滞中の注文から、返却手続きを行う注文を選んでください。</p>

      {returnableOrders.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-6 py-20 text-center">
          <span className="material-symbols-outlined text-[72px] text-slate-200">assignment_return</span>
          <h2 className="text-xl font-extrabold text-slate-800 mt-2">返却可能な注文はありません</h2>
          <p className="text-slate-500 mt-2">現在レンタル中・延滞中の注文はありません。</p>
          <Link to="/products" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-blue-600">
            <span className="material-symbols-outlined text-[20px]">storefront</span>商品一覧へ
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {returnableOrders.map(order => {
            const isOverdue = order.status === "遅延";
            const returnedStatus = isOverdue ? "延滞中" : "レンタル中";
            const statusColor = isOverdue
              ? "bg-red-100 text-red-700 border border-red-200"
              : "bg-blue-100 text-blue-700 border border-blue-200";

            const firstRentItem = order.items.find(i => i.type === 'rent');
            const totalRentItems = order.items.filter(i => i.type === 'rent').length;

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:border-primary hover:shadow-md transition-all flex flex-col"
                onClick={() => navigate(`/return/${order.id}`)}
              >
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div>
                    <span className="text-xs text-slate-500 font-bold">注文番号</span>
                    <p className="font-bold text-sm text-slate-900">{order.orderNumber}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${statusColor}`}>{returnedStatus}</span>
                </div>
                <div className="p-5 flex flex-col gap-4 flex-1">
                  <div className="flex items-center gap-4">
                    {firstRentItem && (
                      <div
                        className="h-16 w-16 rounded-lg bg-slate-100 bg-contain bg-center bg-no-repeat shrink-0 border border-slate-200"
                        style={{ backgroundImage: `url("${firstRentItem.image}")` }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 line-clamp-2">{firstRentItem?.name || 'レンタル品'}</p>
                      {totalRentItems > 1 && (
                        <p className="text-xs text-slate-500 mt-0.5">他 {totalRentItems - 1}商品</p>
                      )}
                    </div>
                  </div>
                  <p className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-600 font-bold" : "text-slate-500"}`}>
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    レンタル期間: {order.rentalStartDate} 〜 {order.rentalEndDate}
                  </p>
                  <button
                    className="w-full py-2.5 bg-primary/10 text-primary font-bold rounded-lg text-sm transition-colors hover:bg-primary hover:text-white mt-auto"
                    onClick={(e) => { e.stopPropagation(); navigate(`/return/${order.id}`); }}
                  >
                    この注文を返却する
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
