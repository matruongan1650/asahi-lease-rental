import { useState, useEffect } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useOrders, Order } from "../context/OrderContext";
import { useUser } from "../context/UserContext";
import { isReturnEligible } from "../utils/orderStatus";
import { useIsDesktop } from "../hooks/useIsDesktop";
import ReturnItemsDesktop from "./desktop/ReturnItemsDesktop";

export default function ReturnItems() {
  return useIsDesktop() ? <ReturnItemsDesktop /> : <ReturnItemsMobile />;
}

function ReturnItemsMobile() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { orders } = useOrders();
  const { currentUser } = useUser();
  const [returnType, setReturnType] = useState<"all" | "partial">("all");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});

  // アクセス制御: 自分が発注した注文のみ返却操作できる（他社注文の URL 直打ちを防ぐ）。
  // 所有者を証明できない注文（userId 未設定）も拒否（deny-by-default）。
  const isPrivileged = currentUser?.role === "admin" || currentUser?.role === "staff";
  const foundOrder = orders.find(o => o.id === orderId);
  // deny-by-default: 特権、または「ログイン中 かつ 注文に userId があり 一致」のときだけ許可。
  // 未ログイン(undefined)や userId 未設定の注文で undefined===undefined となり素通りするのを防ぐ（OrderDetail と統一）。
  // 返却可能なステータスのみ（未納品=処理中/確認済み/配送中 等は不可）。検品待ちは編集・再提出のため許可。
  const returnAllowed = (o: any) => o && (isReturnEligible(o.status) || o.status === "検品待ち" || o.status === "回収中");
  const order =
    foundOrder && returnAllowed(foundOrder) && (isPrivileged || (!!currentUser?.id && !!foundOrder.userId && foundOrder.userId === currentUser.id))
      ? foundOrder
      : undefined;

  useEffect(() => {
    if (order) {
      const initial: Record<string, number> = {};
      order.items.forEach(item => {
        if (item.type === 'rent') {
          const remaining = item.quantity - (item.returnedQuantity || 0);
          initial[item.id] = returnType === "all" ? remaining : 0;
        }
      });
      setReturnQuantities(initial);
    }
  }, [order, returnType]);

  if (!order) {
    return <div className="text-center p-10">注文が見つかりません。</div>;
  }

  const rentItems = order.items.filter(item => item.type === 'rent' && (item.returnedQuantity || 0) < item.quantity);
  // 空欄を表す -1 センチネルは 0 として扱う（合計が負に化けて表示・ボタン活性が壊れるのを防ぐ）。
  const totalReturning: number = Object.values(returnQuantities).reduce<number>((a: number, b: any) => a + Math.max(0, Number(b) || 0), 0);

  const handleUpdateQuantity = (id: string, delta: number, max: number) => {
    setReturnQuantities(prev => {
      const current = prev[id] || 0;
      return { ...prev, [id]: Math.max(0, Math.min(max, current + delta)) };
    });
  };

  const handleSetQuantity = (id: string, val: number, max: number) => {
    setReturnQuantities(prev => {
      if (val === -1) return { ...prev, [id]: -1 };
      return { ...prev, [id]: Math.max(0, Math.min(max, val)) };
    });
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-hidden pb-[140px] text-slate-900 dark:text-white bg-background-light dark:bg-background-dark max-w-[480px] mx-auto">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-4 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/return")} className="flex size-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h2 className="text-lg font-bold leading-tight text-center flex-1 pr-10">返却アイテムの選択</h2>
      </header>

      <main className="flex flex-col gap-4 p-4">
        {/* Return Type Selection */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
           <h3 className="text-sm font-bold mb-3">返却方法を選択してください</h3>
           <div className="grid grid-cols-2 gap-3">
             <button 
               onClick={() => setReturnType("all")}
               className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all ${returnType === "all" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary/50"}`}
             >
               一括返却
             </button>
             <button
               onClick={() => setReturnType("partial")}
               className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all ${returnType === "partial" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary/50"}`}
             >
               一部返却
             </button>
           </div>
           {returnType === "partial" && (
             <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500 leading-relaxed">
               <span className="material-symbols-outlined text-[14px] text-primary mt-px">info</span>
               一部返却は「直接持ち込み」のみご利用いただけます（業者集荷は不可）。
             </p>
           )}
        </div>

        <div className="flex items-center justify-between px-1 mt-2 gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">注文: {order.orderNumber}</p>
          {returnType === "partial" && rentItems.length > 1 && (
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={() => { const o: Record<string, number> = {}; rentItems.forEach((it) => { o[it.id] = it.quantity - (it.returnedQuantity || 0); }); setReturnQuantities(o); }} className="text-xs font-bold text-primary">すべて最大</button>
              <button onClick={() => { const o: Record<string, number> = {}; rentItems.forEach((it) => { o[it.id] = 0; }); setReturnQuantities(o); }} className="text-xs font-bold text-slate-400">すべて0</button>
            </div>
          )}
        </div>

        {/* Item list */}
        {rentItems.map((item, index) => {
          const maxReturnable = item.quantity - (item.returnedQuantity || 0);
          return (
            <ReturnItemCard 
              key={`${item.id}-${index}`}
              name={item.name}
              image={item.image}
              lentQuantity={maxReturnable}
              returnType={returnType}
              currentQuantity={returnQuantities[item.id] || 0}
              onUpdateQuantity={(delta: number) => handleUpdateQuantity(item.id, delta, maxReturnable)}
              onSetQuantity={(val: number) => handleSetQuantity(item.id, val, maxReturnable)}
            />
          );
        })}

      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20 w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-safe">
        <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
          <div className="flex flex-col">
            <p className="text-xs text-slate-500 dark:text-slate-400">返却数合計</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">
               {totalReturning} <span className="text-sm font-normal text-slate-500">点</span>
            </p>
          </div>
          <button 
            disabled={totalReturning === 0}
            onClick={() => {
              // -1 センチネルが返却確認画面へ漏れて残数を +1 水増ししないよう、0 以上に正規化して渡す。
              const sanitized = Object.fromEntries(Object.entries(returnQuantities).map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
              navigate(`/return/${order.id}/shipping`, { state: { returnQuantities: sanitized, order, returnType } });
            }}
            className={`flex-1 rounded-xl font-bold h-12 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform ${totalReturning > 0 ? "bg-primary hover:bg-blue-600 text-white shadow-blue-500/20" : "bg-slate-300 text-slate-500 cursor-not-allowed"}`}
          >
            次へ進む
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnItemCard({ name, image, lentQuantity, returnType, currentQuantity, onUpdateQuantity, onSetQuantity }: any) {
  const isEditing = returnType === "partial";

  return (
    <div className={`flex flex-col gap-3 rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm border border-slate-200 dark:border-slate-700 ${(!isEditing && currentQuantity === 0) ? "opacity-50" : ""}`}>
      <div className="flex gap-4">
        <div className="relative shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900 size-[64px]">
          <div className="absolute inset-0 bg-center bg-cover bg-no-repeat" style={{ backgroundImage: `url("${image}")`}}></div>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2">{name}</p>
          <div className="text-xs text-slate-500 font-medium">
            未返却数: {lentQuantity}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/50 mt-1">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">返却する数量</span>
        {isEditing ? (
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 gap-1 p-1">
            <button onClick={() => onUpdateQuantity(-1)} className="flex size-7 items-center justify-center text-slate-600 dark:text-slate-200 hover:text-primary bg-white dark:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 rounded-md transition-colors shadow-sm">
              <span className="material-symbols-outlined text-[20px]">remove</span>
            </button>
            <input 
              className="w-12 bg-transparent text-center text-base font-bold outline-none border-none p-0 h-9 hide-arrows" 
              type="number" 
              inputMode="numeric"
              pattern="[0-9]*"
              value={currentQuantity === -1 ? '' : currentQuantity}
              onChange={(e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val) && onSetQuantity) onSetQuantity(-1);
                else if (onSetQuantity) onSetQuantity(val);
              }}
              onBlur={(e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val) || val < 0) {
                  if (onSetQuantity) onSetQuantity(0);
                }
              }}
            />
            <button onClick={() => onUpdateQuantity(1)} className="flex size-7 items-center justify-center text-white bg-primary hover:bg-primary/90 active:bg-primary/80 rounded-md transition-colors shadow-sm">
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
          </div>
        ) : (
           <span className="text-lg font-bold text-primary">{currentQuantity}</span>
        )}
      </div>
    </div>
  );
}
