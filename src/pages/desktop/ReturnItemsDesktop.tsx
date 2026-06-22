import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useOrders } from "../../context/OrderContext";
import { useUser } from "../../context/UserContext";

/** PC 用 返却アイテム選択（お客様デスクトップサイト）。モバイル ReturnItems と同じアクセス制御・返却数ロジックを再利用。 */
export default function ReturnItemsDesktop() {
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
  // deny-by-default: 特権、または「ログイン中 かつ 注文に userId があり 一致」のときだけ許可（OrderDetail と統一）。
  const order =
    foundOrder && (isPrivileged || (!!currentUser?.id && !!foundOrder.userId && foundOrder.userId === currentUser.id))
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
    return (
      <div className="max-w-5xl mx-auto px-6 py-20 text-center">
        <span className="material-symbols-outlined text-[72px] text-slate-200">search_off</span>
        <h1 className="text-2xl font-extrabold text-slate-800 mt-2">注文が見つかりません。</h1>
        <p className="text-slate-500 mt-2">指定された注文が存在しないか、アクセス権限がありません。</p>
        <Link to="/return" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-blue-600">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>返却一覧へ
        </Link>
      </div>
    );
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

  const handleNext = () => {
    // -1 センチネルが返却確認画面へ漏れて残数を +1 水増ししないよう、0 以上に正規化して渡す。
    const sanitized = Object.fromEntries(Object.entries(returnQuantities).map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
    navigate(`/return/${order.id}/shipping`, { state: { returnQuantities: sanitized, order, returnType } });
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">ホーム</Link>
        <span className="mx-1">/</span>
        <Link to="/return" className="hover:text-primary">返却</Link>
        <span className="mx-1">/</span>返却アイテムの選択
      </nav>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-6">
        返却アイテムの選択 <span className="text-base font-bold text-slate-400">（注文: {order.orderNumber}）</span>
      </h1>

      <div className="flex gap-8 items-start flex-col lg:flex-row">
        {/* Left column: return type + item cards */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          {/* Return Type Selection */}
          <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">返却方法を選択してください</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setReturnType("all")}
                className={`py-4 px-4 rounded-xl font-bold text-sm border-2 transition-all ${returnType === "all" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:border-primary/50"}`}
              >
                一括返却
              </button>
              <button
                onClick={() => setReturnType("partial")}
                className={`py-4 px-4 rounded-xl font-bold text-sm border-2 transition-all ${returnType === "partial" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:border-primary/50"}`}
              >
                一部返却
              </button>
            </div>
            {returnType === "partial" && (
              <p className="mt-4 flex items-start gap-2 text-xs text-blue-800 bg-blue-50/60 border border-blue-100 rounded-xl p-3 leading-relaxed">
                <span className="material-symbols-outlined text-[16px] text-blue-600 shrink-0 mt-px">info</span>
                一部返却は「直接持ち込み」のみご利用いただけます（業者集荷は不可）。
              </p>
            )}
          </div>

          {/* Item list */}
          {rentItems.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 border border-slate-200 shadow-sm text-center">
              <span className="material-symbols-outlined text-[56px] text-slate-200">inventory_2</span>
              <p className="text-slate-500 font-bold mt-2">返却可能なレンタル品はありません。</p>
            </div>
          ) : (
            rentItems.map((item, index) => {
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
            })
          )}
        </div>

        {/* Right column: sticky summary */}
        <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-6">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-extrabold text-slate-900 mb-4">返却内容</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">返却方法</span>
                <span className="font-bold text-slate-800">{returnType === "all" ? "一括返却" : "一部返却"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">対象アイテム</span>
                <span className="font-bold text-slate-800">{rentItems.length} 品目</span>
              </div>
              <div className="h-px bg-slate-100 my-1" />
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900">返却数合計</span>
                <span className="text-2xl font-extrabold text-primary">{totalReturning} <span className="text-sm font-bold text-slate-400">点</span></span>
              </div>
            </div>
            <button
              disabled={totalReturning === 0}
              onClick={handleNext}
              className={`w-full mt-5 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${totalReturning > 0 ? "bg-primary hover:bg-blue-600 text-white shadow-lg shadow-primary/20" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
            >
              次へ進む <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">集荷方法・日時は次の画面で指定します。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReturnItemCard({ name, image, lentQuantity, returnType, currentQuantity, onUpdateQuantity, onSetQuantity }: any) {
  const isEditing = returnType === "partial";

  return (
    <div className={`flex gap-4 rounded-2xl bg-white p-4 border border-slate-200 shadow-sm ${(!isEditing && currentQuantity === 0) ? "opacity-50" : ""}`}>
      <div className="w-28 h-28 shrink-0 rounded-xl bg-slate-50 bg-contain bg-center bg-no-repeat border border-slate-100" style={{ backgroundImage: `url("${image}")` }} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div>
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold bg-blue-50 text-blue-700">レンタル</span>
          <h3 className="text-base font-bold text-slate-900 mt-1 line-clamp-2">{name}</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">未返却数: {lentQuantity}</p>
        </div>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-sm font-bold text-slate-700">返却する数量</span>
          {isEditing ? (
            <div className="flex items-center rounded-lg bg-slate-50 border border-slate-200 gap-1 p-1">
              <button onClick={() => onUpdateQuantity(-1)} className="w-8 h-8 grid place-items-center rounded-md bg-white shadow-sm text-slate-600 hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <input
                className="w-12 text-center text-sm font-bold bg-transparent outline-none hide-arrows"
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
              <button onClick={() => onUpdateQuantity(1)} className="w-8 h-8 grid place-items-center rounded-md bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>
          ) : (
            <span className="text-lg font-bold text-primary">{currentQuantity}</span>
          )}
        </div>
      </div>
    </div>
  );
}
