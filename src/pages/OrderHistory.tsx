import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useOrders, Order } from "../context/OrderContext";
import { useUser } from "../context/UserContext";
import { formatStatusWithReturnRequest } from "../utils/returnLabels";
import { isFullyReturned } from "../utils/orderStatus";

export default function OrderHistory() {
  const { orders } = useOrders();
  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<"処理中" | "履歴">("処理中");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOrders = useMemo(() => {
    // 注文履歴はアカウントごとに分離（同じ会社の別ユーザーの注文は表示しない）。
    let filtered = orders.filter(
      (o) => currentUser && o.userId === currentUser.id,
    );

    if (activeTab === "処理中") {
      filtered = filtered.filter(o => !isFullyReturned(o.status));
    } else {
      filtered = filtered.filter(o => isFullyReturned(o.status) || o.status === "一部返却");
    }

    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.orderNumber.toLowerCase().includes(lower) ||
        o.items.some(i => i.name.toLowerCase().includes(lower))
      );
    }

    return filtered;
  }, [orders, currentUser, activeTab, searchQuery]);

  const getOrderDisplayProps = (order: Order) => {
    switch (order.status) {
      case "キャンセル":
        return { color: "red", icon: "cancel", detail: "キャンセルされました", progress: 0 };
      case "準備中":
        return { color: "amber", icon: "inventory_2", detail: "商品の準備を進めています", progress: 50 };
      case "配送中":
      case "配送済み":
        return { color: "blue", icon: "local_shipping", detail: "商品を配送しています", progress: 75 };
      case "レンタル中":
        return { color: "blue", icon: "play_circle", detail: "現在レンタル中です", progress: 75 };
      case "回収予定":
      case "回収中":
        return { color: "amber", icon: "local_shipping", detail: "返却の回収を手配しています", progress: 75 };
      case "検品待ち":
        return { color: "amber", icon: "fact_check", detail: "倉庫での検品をお待ちください", progress: 75 };
      case "一部返却":
        return { color: "purple", icon: "halfway", detail: "一部のアイテムが返却されました", progress: 75 };
      case "返却済":
      case "返却済み":
      case "完了":
        return { color: "blue", icon: "check_circle", detail: "返却が完了し、最終金額が確定しました", progress: 100 };
      case "ご注文":
      case "処理中":
      case "確認済み":
      default:
        return { color: "amber", icon: "pending", detail: "ご注文を確認しています", progress: 25 };
    }
  };

  return (
    <>
      <div className="sticky top-0 z-20 bg-white dark:bg-[#1A2633] border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center px-4 justify-between h-16">
          <button onClick={() => window.history.length > 2 ? window.history.back() : window.location.href = '/'} className="flex size-10 shrink-0 items-center justify-center cursor-pointer text-[#111418] dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <h2 className="text-[#111418] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">注文履歴</h2>
          <div className="absolute right-4 flex w-10 items-center justify-end">
            <button className="flex cursor-pointer items-center justify-center overflow-hidden rounded-full size-10 bg-transparent text-[#111418] dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <span className="material-symbols-outlined text-2xl">filter_list</span>
            </button>
          </div>
        </div>
        <div className="px-4 pb-2">
          <div className="flex p-1.5 bg-gray-100 dark:bg-gray-800/50 rounded-xl">
            <button 
              onClick={() => setActiveTab("処理中")} 
              className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === '処理中' ? 'bg-white dark:bg-[#2A3B4D] shadow-sm text-primary ring-1 ring-black/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              処理中
            </button>
            <button 
              onClick={() => setActiveTab("履歴")} 
              className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === '履歴' ? 'bg-white dark:bg-[#2A3B4D] shadow-sm text-primary ring-1 ring-black/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              履歴
            </button>
          </div>
        </div>
        <div className="px-4 py-3 bg-white dark:bg-[#1A2633]">
          <div className="relative flex items-center w-full h-12 rounded-xl focus-within:ring-2 focus-within:ring-primary/50 overflow-hidden bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 transition-all">
            <div className="grid place-items-center h-full w-12 text-gray-400">
              <span className="material-symbols-outlined text-xl">search</span>
            </div>
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="peer h-full w-full outline-none text-base text-gray-700 dark:text-gray-200 bg-transparent pr-4 placeholder-gray-400 font-medium" 
              placeholder="注文番号、機械名で検索..." 
              type="text"
            />
          </div>
        </div>
      </div>

      {activeTab === "処理中" && (
        <div className="px-4 pt-4">
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg p-3 flex items-center gap-2 font-medium border border-amber-100 dark:border-amber-800/50">
            <span className="material-symbols-outlined text-[16px]">info</span>
            ご返却日延長の場合は延長料金がかかります
          </p>
        </div>
      )}

      <div className="flex-1 p-4 space-y-5 pb-24">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            注文履歴がありません。
          </div>
        ) : (
          filteredOrders.map((order: Order) => {
            const firstItem = order.items[0];
            const displayProps = getOrderDisplayProps(order);
            return (
              <OrderCard 
                key={order.id}
                id={order.id}
                orderNumber={order.orderNumber}
                date={order.date}
                status={formatStatusWithReturnRequest(order.status, order.returnRequestType)}
                statusColor={displayProps.color}
                statusIcon={displayProps.icon}
                productName={firstItem ? firstItem.name : "不明な商品"}
                provider={order.items.length > 1 ? `他 ${order.items.length - 1} 点` : "提供: 株式会社ビルドテック"}
                detail={displayProps.detail}
                price={order.total.toLocaleString()}
                image={firstItem ? firstItem.image : ""}
                type={firstItem?.type === 'rent' ? "レンタル" : "購入"}
                progress={displayProps.progress}
                isSecondaryButton={true}
              />
            );
          })
        )}

        <div className="flex justify-center py-6 text-gray-400">
          <span className="text-xs flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            すべての{activeTab}の注文が表示されています
          </span>
        </div>
      </div>
    </>
  );
}

function OrderCard({ 
  id, orderNumber, date, status, statusColor, statusIcon, productName, provider, detail, price, image, type, progress, isSecondaryButton 
}: any) {

  const statusColors = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-primary dark:text-blue-300 border-blue-100 dark:border-blue-800/50",
    amber: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border-amber-100 dark:border-amber-800/50",
    purple: "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border-purple-100 dark:border-purple-800/50",
    red: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border-red-100 dark:border-red-800/50"
  };

  const barColors = {
    blue: "bg-primary text-primary",
    amber: "bg-amber-500 text-amber-500",
    purple: "bg-purple-500 text-purple-500",
    red: "bg-red-500 text-red-500"
  };

  const typeStyles = type === "レンタル" 
    ? "bg-white dark:bg-gray-800 text-primary border-gray-100 dark:border-gray-700" 
    : "bg-emerald-500 text-white border-emerald-600";

  return (
    <div className="bg-white dark:bg-[#1A2633] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden group hover:border-primary/30 transition-all">
      <div className="px-5 py-4 flex justify-between items-start border-b border-gray-50 dark:border-gray-700/30">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">注文番号</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{orderNumber}</span>
          </div>
          <span className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            {date}
          </span>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm border ${statusColors[statusColor as keyof typeof statusColors]}`}>
          <span className="material-symbols-outlined text-[16px]">{statusIcon}</span>
          {status}
        </div>
      </div>
      <div className="p-5 flex gap-4 items-start">
        <div className="relative shrink-0 group-hover:scale-105 transition-transform duration-300">
          <div className="bg-center bg-no-repeat bg-cover rounded-xl size-24 shadow-sm border border-gray-100 dark:border-gray-700" style={{ backgroundImage: `url("${image}")`}}></div>
          <div className={`absolute -top-2 -left-2 border text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-sm uppercase tracking-wide ${typeStyles}`}>
            {type}
          </div>
        </div>
        <div className="flex flex-1 flex-col py-0.5 min-w-0">
          <h3 className="text-[#111418] dark:text-white text-lg font-bold leading-snug line-clamp-2">{productName}</h3>
          <p className="text-gray-500 dark:text-gray-400 text-xs font-medium mt-1.5 flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[14px]">apartment</span>
            {provider}
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">{detail}</p>
        </div>
      </div>
      <div className="px-5 pb-5">
        <div className="flex flex-col gap-2">
          <div className="relative h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${barColors[statusColor as keyof typeof barColors].split(" ")[0]}`} style={{ width: `${progress}%` }}></div>
          </div>
          <div className="flex justify-between text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            <span className={progress >= 25 ? barColors[statusColor as keyof typeof barColors].split(" ")[1] : ""}>注文</span>
            <span className={progress >= 50 ? barColors[statusColor as keyof typeof barColors].split(" ")[1] : ""}>確認</span>
            <span className={progress >= 75 ? barColors[statusColor as keyof typeof barColors].split(" ")[1] : ""}>配送</span>
            <span className={progress >= 100 ? barColors[statusColor as keyof typeof barColors].split(" ")[1] : ""}>完了</span>
          </div>
        </div>
      </div>
      <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block">合計金額</span>
          <span className="text-[#111418] dark:text-white font-extrabold text-xl tracking-tight">¥{price}</span>
        </div>
        <Link to={`/order/${id}`} className={`flex items-center justify-center rounded-xl h-11 px-6 text-sm font-bold transition-all transform active:scale-95 ${isSecondaryButton ? "bg-white dark:bg-transparent border-2 border-primary text-primary dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20" : "bg-primary hover:bg-blue-600 active:bg-blue-700 text-white shadow-lg shadow-blue-500/20"}`}>
          詳細を見る
          {!isSecondaryButton && <span className="material-symbols-outlined text-lg ml-1">arrow_forward</span>}
        </Link>
      </div>
    </div>
  );
}
