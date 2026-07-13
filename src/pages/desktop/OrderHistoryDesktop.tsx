import { useState, useMemo, useEffect } from "react";
import { getOrGenerateInvoiceBlocks } from "../../utils/billing";
import { Link } from "react-router-dom";
import { useOrders, Order } from "../../context/OrderContext";
import { useUser } from "../../context/UserContext";
import { formatStatusWithReturnRequest } from "../../utils/returnLabels";
import { isClosedOrder } from "../../utils/orderStatus";
import { byOrderDateDesc } from "../../utils/orderSort";

/** PC 用 注文履歴（お客様デスクトップサイト）。モバイル OrderHistory と同じ絞り込み・状態判定ロジックを再利用。 */
function liveOrderTotalD(order: any): number {
  try {
    const blocks = getOrGenerateInvoiceBlocks(order);
    if (Array.isArray(blocks) && blocks.length > 0) return blocks.reduce((s: number, b: any) => s + (Number(b?.total) || 0), 0);
  } catch { /* fallthrough */ }
  return Number(order?.total) || 0;
}

export default function OrderHistoryDesktop() {
  const { orders } = useOrders();
  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<"処理中" | "履歴">("処理中");
  const [searchQuery, setSearchQuery] = useState("");
  // 注文が多い場合に一度に大量の DOM を描画して重くなるのを防ぐ（段階表示）。
  const PAGE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [activeTab, searchQuery]);

  const filteredOrders = useMemo(() => {
    // 注文履歴はアカウントごとに分離（同じ会社の別ユーザーの注文は表示しない）。
    let filtered = orders.filter(
      (o) => currentUser && o.userId === currentUser.id,
    );

    if (activeTab === "処理中") {
      // 完了/キャンセルが処理中に残り続ける不具合を解消（isClosedOrder で履歴側へ振り分け）。
      filtered = filtered.filter(o => !isClosedOrder(o.status) && o.status !== "一部返却");
    } else {
      filtered = filtered.filter(o => isClosedOrder(o.status) || o.status === "一部返却");
    }

    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.orderNumber.toLowerCase().includes(lower) ||
        o.items.some(i => i.name.toLowerCase().includes(lower))
      );
    }

    // 新しい注文を上に表示（管理サイトと一貫）。
    return [...filtered].sort(byOrderDateDesc);
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
    <div className="max-w-5xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">ホーム</Link> <span className="mx-1">/</span> 注文履歴
      </nav>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-6">注文履歴</h1>

      {/* タブ + 検索 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex p-1.5 bg-slate-100 rounded-xl shrink-0">
          <button
            onClick={() => setActiveTab("処理中")}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === '処理中' ? 'bg-white shadow-sm text-primary ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
          >
            処理中
          </button>
          <button
            onClick={() => setActiveTab("履歴")}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === '履歴' ? 'bg-white shadow-sm text-primary ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
          >
            履歴
          </button>
        </div>
        <div className="relative flex items-center flex-1 h-11 rounded-xl focus-within:ring-2 focus-within:ring-primary/40 overflow-hidden bg-white border border-slate-200 shadow-sm transition-all">
          <div className="grid place-items-center h-full w-11 text-slate-400">
            <span className="material-symbols-outlined text-xl">search</span>
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full outline-none text-sm text-slate-700 bg-transparent pr-4 placeholder-slate-400 font-medium"
            placeholder="注文番号、機械名で検索..."
            type="text"
          />
        </div>
      </div>

      {activeTab === "処理中" && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3 flex items-center gap-2 font-medium border border-amber-100 mb-6">
          <span className="material-symbols-outlined text-[16px]">info</span>
          ご返却日延長の場合は延長料金がかかります
        </p>
      )}

      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm py-20 text-center">
          <span className="material-symbols-outlined text-[64px] text-slate-200">receipt_long</span>
          <p className="text-slate-500 font-medium mt-2">注文履歴がありません。</p>
          <Link to="/products" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-blue-600">
            <span className="material-symbols-outlined text-[20px]">storefront</span>商品一覧へ
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {filteredOrders.slice(0, visibleCount).map((order: Order) => {
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
                  price={liveOrderTotalD(order).toLocaleString()}
                  image={firstItem ? firstItem.image : ""}
                  type={firstItem?.type === 'rent' ? "レンタル" : "購入"}
                  progress={displayProps.progress}
                />
              );
            })}
          </div>

          {filteredOrders.length > visibleCount ? (
            <div className="flex justify-center py-8">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE)}
                className="px-6 py-3 rounded-full bg-white border border-slate-200 text-sm font-bold text-primary shadow-sm hover:border-primary/40 transition"
              >
                もっと見る（残り {filteredOrders.length - visibleCount} 件）
              </button>
            </div>
          ) : (
            <div className="flex justify-center py-8 text-slate-400">
              <span className="text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                すべての{activeTab}の注文が表示されています
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrderCard({
  id, orderNumber, date, status, statusColor, statusIcon, productName, provider, detail, price, image, type, progress
}: any) {

  const statusColors = {
    blue: "bg-blue-50 text-primary border-blue-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    red: "bg-red-50 text-red-600 border-red-100"
  };

  const barColors = {
    blue: "bg-primary text-primary",
    amber: "bg-amber-500 text-amber-500",
    purple: "bg-purple-500 text-purple-500",
    red: "bg-red-500 text-red-500"
  };

  const typeStyles = type === "レンタル"
    ? "bg-white text-primary border-slate-200"
    : "bg-emerald-500 text-white border-emerald-600";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:border-primary/30 transition-all flex flex-col">
      <div className="px-5 py-4 flex justify-between items-start border-b border-slate-50">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">注文番号</span>
            <span className="text-sm font-bold text-slate-900">{orderNumber}</span>
          </div>
          <span className="text-xs text-slate-400 mt-1 flex items-center gap-1">
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
          <div className="bg-center bg-no-repeat bg-cover rounded-xl size-24 shadow-sm border border-slate-100" style={{ backgroundImage: `url("${image}")`}}></div>
          <div className={`absolute -top-2 -left-2 border text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-sm uppercase tracking-wide ${typeStyles}`}>
            {type}
          </div>
        </div>
        <div className="flex flex-1 flex-col py-0.5 min-w-0">
          <h3 className="text-slate-900 text-lg font-bold leading-snug line-clamp-2">{productName}</h3>
          <p className="text-slate-500 text-xs font-medium mt-1.5 flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[14px]">apartment</span>
            {provider}
          </p>
          <p className="text-slate-400 text-xs mt-1">{detail}</p>
        </div>
      </div>
      <div className="px-5 pb-5">
        <div className="flex flex-col gap-2">
          <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${barColors[statusColor as keyof typeof barColors].split(" ")[0]}`} style={{ width: `${progress}%` }}></div>
          </div>
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span className={progress >= 25 ? barColors[statusColor as keyof typeof barColors].split(" ")[1] : ""}>注文</span>
            <span className={progress >= 50 ? barColors[statusColor as keyof typeof barColors].split(" ")[1] : ""}>確認</span>
            <span className={progress >= 75 ? barColors[statusColor as keyof typeof barColors].split(" ")[1] : ""}>配送</span>
            <span className={progress >= 100 ? barColors[statusColor as keyof typeof barColors].split(" ")[1] : ""}>完了</span>
          </div>
        </div>
      </div>
      <div className="mt-auto px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 font-medium block">合計金額</span>
          <span className="text-slate-900 font-extrabold text-xl tracking-tight">¥{price}</span>
        </div>
        <Link to={`/order/${id}`} className="flex items-center justify-center rounded-xl h-11 px-6 text-sm font-bold transition-all bg-white border-2 border-primary text-primary hover:bg-blue-50">
          詳細を見る
        </Link>
      </div>
    </div>
  );
}
