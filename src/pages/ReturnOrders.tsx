import { useNavigate } from "react-router-dom";
import { useOrders } from "../context/OrderContext";
import { useUser } from "../context/UserContext";
import { useIsDesktop } from "../hooks/useIsDesktop";
import ReturnOrdersDesktop from "./desktop/ReturnOrdersDesktop";

export default function ReturnOrders() {
  return useIsDesktop() ? <ReturnOrdersDesktop /> : <ReturnOrdersMobile />;
}

function ReturnOrdersMobile() {
  const navigate = useNavigate();
  const { orders } = useOrders();
  const { currentUser } = useUser();

  // 本人の注文のうち、未返却のレンタル品が残っているものだけを表示
  // （注文履歴と同様、同じ会社でもアカウントごとに分離する）。
  const returnableOrders = orders.filter(order =>
    currentUser && order.userId === currentUser.id &&
    order.items.some(item => item.type === 'rent' && (item.returnedQuantity || 0) < item.quantity)
  );

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-hidden bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white max-w-[480px] mx-auto">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-4 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/profile")} className="flex size-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h2 className="text-lg font-bold leading-tight flex-1 text-center pr-10">返却する注文を選択</h2>
      </header>

      <main className="flex flex-col gap-4 p-4">
        {returnableOrders.length === 0 ? (
          <p className="text-center text-slate-500 py-10">返却可能な注文はありません。</p>
        ) : (
          returnableOrders.map(order => {
            const returnedStatus = order.status === "遅延" ? "延滞中" : "レンタル中";
            const statusColor = order.status === "遅延" 
              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800" 
              : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
            
            const firstRentItem = order.items.find(i => i.type === 'rent');
            const totalRentItems = order.items.filter(i => i.type === 'rent').length;

            return (
              <div key={order.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer hover:border-primary transition-colors flex flex-col" onClick={() => navigate(`/return/${order.id}`)}>
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                  <div>
                    <span className="text-xs text-slate-500 font-bold">注文番号</span>
                    <p className="font-bold text-sm">{order.orderNumber}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${statusColor}`}>{returnedStatus}</span>
                </div>
                <div className="p-4 flex flex-col gap-3">
                   <div className="flex items-center gap-3">
                      {firstRentItem && (
                        <div className="h-12 w-12 rounded bg-slate-100 dark:bg-slate-700 bg-cover bg-center shrink-0 border border-slate-200 dark:border-slate-600" style={{backgroundImage: `url("${firstRentItem.image}")`}}></div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-bold line-clamp-1">{firstRentItem?.name || 'レンタル品'}</p>
                        {totalRentItems > 1 && (
                           <p className="text-xs text-slate-500">他 {totalRentItems - 1}商品</p>
                        )}
                      </div>
                   </div>
                   <p className={`text-xs flex items-center gap-1 ${order.status === "遅延" ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-500"}`}>
                     <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                     レンタル期間: {order.rentalStartDate} 〜 {order.rentalEndDate}
                   </p>
                   <button className="w-full py-2 bg-primary/10 text-primary font-bold rounded-lg text-sm transition-colors hover:bg-primary hover:text-white mt-1">
                     この注文を返却する
                   </button>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
