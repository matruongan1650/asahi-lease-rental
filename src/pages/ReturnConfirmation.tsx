import React from "react";
import { alertDialog } from "../components/AppDialog";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useOrders } from "../context/OrderContext";
import { calculateRentalPrice, getOrGenerateInvoiceBlocks, getTaxRate } from "../utils/billing";
import { isVehicleCategory } from '../utils/productUtils';
import OrderBus from "../lib/orderBus";
import { useIsDesktop } from "../hooks/useIsDesktop";
import ReturnConfirmationDesktop from "./desktop/ReturnConfirmationDesktop";

export default function ReturnConfirmation() {
  return useIsDesktop() ? <ReturnConfirmationDesktop /> : <ReturnConfirmationMobile />;
}

function ReturnConfirmationMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateOrder, addCustomOrder } = useOrders();

  const { returnQuantities, order, method, address, pickupDate, pickupTime, photos } = location.state || {};
  // 二度押しガード（モバイルの連打で updateOrder/alert が二重発火するのを防ぐ）。成功時は /orders へ遷移し
  // アンマウントされるため解除不要。
  const submittingRef = React.useRef(false);

  if (!order || !returnQuantities) {
    return <div className="p-10 text-center">エラーが発生しました。もう一度やり直してください。</div>;
  }

  const itemsToReturn = order.items.filter((item: any) => returnQuantities[item.id] > 0);
  const totalItemsCount = itemsToReturn.reduce((sum: number, item: any) => sum + returnQuantities[item.id], 0);

  const handleSubmit = async () => {
    if (submittingRef.current) return; // 連打ガード
    submittingRef.current = true;
    // Determine actual return date (pickupDate or today)
    let actualReturnDate = pickupDate;
    if (!actualReturnDate) {
      const today = new Date();
      actualReturnDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    // Check if there are vehicles
    const hasVehicle = order.items.some((i: any) => isVehicleCategory(i.category) && i.type === 'rent');

    const returnedItemsList: any[] = [];
    const remainingItemsList: any[] = [];
    
    let returnedTotalRentalPrice = 0;
    let returnedTotalBuyPrice = 0;
    let remainingTotalRentalPrice = 0;
    let remainingTotalBuyPrice = 0;
    // 「全量返却か」は実際の残数で判定する。rentPrice=0/未設定の品目をリストから落とす実装だと
    // remainingItemsList.length では一部返却を全量返却と誤判定するため、数量で集計する。
    let totalRemainingQty = 0;

    order.items.forEach((item: any) => {
      const returningQty = returnQuantities[item.id] || 0;
      const alreadyReturnedQty = item.returnedQuantity || 0; 
      const currentRemainingQty = item.quantity - alreadyReturnedQty;
      const newRemainingQty = currentRemainingQty - returningQty;

      // 1. Calculate Returned Item（価格の有無ではなく type で判定。0/未設定価格でも品目は計上する）
      if (returningQty > 0) {
        if (item.type === 'rent') {
          const { totalPrice, breakdown } = calculateRentalPrice(
            item.rentPrice || 0, order.rentalStartDate, actualReturnDate, hasVehicle, isVehicleCategory(item.category), item.rentPriceLongTerm
          );
          returnedTotalRentalPrice += totalPrice * returningQty;

          returnedItemsList.push({
            ...item,
            quantity: returningQty,
            returnedQuantity: returningQty,
            actualReturnDate,
            calculatedPrice: totalPrice,
            monthlyBreakdown: breakdown,
          });
        } else if (item.type === 'buy') {
          // 販売品の返却分も金額に計上（残存側の計算と対称）。
          returnedTotalBuyPrice += (item.buyPrice || 0) * returningQty;
          returnedItemsList.push({
            ...item,
            quantity: returningQty,
            returnedQuantity: returningQty,
            actualReturnDate,
          });
        }
      }

      // 2. Calculate Remaining Item（rent / buy とも残った数量 newRemainingQty を使う）
      const remainingQtyToKeep = Math.max(0, newRemainingQty);
      totalRemainingQty += remainingQtyToKeep;
      if (remainingQtyToKeep > 0) {
        if (item.type === 'rent') {
          const { totalPrice, breakdown } = calculateRentalPrice(
            item.rentPrice || 0, order.rentalStartDate, order.rentalEndDate, hasVehicle, isVehicleCategory(item.category), item.rentPriceLongTerm
          );
          remainingTotalRentalPrice += totalPrice * remainingQtyToKeep;

          remainingItemsList.push({
            ...item,
            quantity: remainingQtyToKeep,
            returnedQuantity: 0,
            calculatedPrice: totalPrice,
            monthlyBreakdown: breakdown,
          });
        } else if (item.type === 'buy') {
          // 残った販売数量分のみ計上（元数量ではない＝二重請求防止）。
          remainingTotalBuyPrice += (item.buyPrice || 0) * remainingQtyToKeep;
          remainingItemsList.push({ ...item, quantity: remainingQtyToKeep });
        }
      }
    });

    const taxRate = getTaxRate();
    const returnedSubtotal = returnedTotalRentalPrice + returnedTotalBuyPrice;
    const returnedTax = Math.floor(returnedSubtotal * taxRate);
    const returnedTotal = returnedSubtotal + returnedTax;

    const remainingSubtotal = remainingTotalRentalPrice + remainingTotalBuyPrice;
    const remainingTax = Math.floor(remainingSubtotal * taxRate);
    const remainingTotal = remainingSubtotal + remainingTax;

    const returningEverything = totalRemainingQty === 0;

    // 直接持ち込み（全量・一部いずれも）は倉庫の「持込返却 検品」へ回す。
    // 業者集荷（pickup）の場合は、スタッフの「回収予定」タスクとして登録する。
    const returnReqType = returningEverything ? "full" : "partial";

    // 【ルール】一部返却（partial）は「直接持ち込み」のみ。業者集荷は不可。
    // 万一 method=pickup で一部返却が来た場合でも、回収（集荷）パイプラインには
    // 流さず必ず持込検品キューへ回す。これにより admin の「回収手配」/
    // staff の「回収」一覧に顧客発の一部集荷が混入しない。
    const usePickupFlow = method === "pickup" && returningEverything;

    if (usePickupFlow) {
      // walkin→pickup の切替時、以前の持込チケットが倉庫キューに残らないよう掃除する。
      try {
        OrderBus.getAll<any>("walkinReturns")
          .filter((w: any) => w && (w.orderId === order.id || (order.orderNumber && w.orderNumber === order.orderNumber)))
          .forEach((w: any) => OrderBus.remove("walkinReturns", w.id));
      } catch { /* ignore */ }
      updateOrder(order.id, {
        status: "回収中",
        staffStatus: "回収予定",
        returnRequestType: returnReqType,
        requestedReturn: returnQuantities,
        rentalEndDate: pickupDate || order.rentalEndDate,
        notes: `【回収リクエスト】希望日時: ${pickupDate} ${pickupTime}\n集荷場所: ${address}\n${order.notes || order.note || ''}`
      });
    } else {
      // 直接持ち込み（全量・一部いずれも）: ここでは確定・請求分割しない。
      // 倉庫の「持込返却 検品」キューに登録し、注文を「検品待ち」にする。
      // 倉庫スタッフが実数を検品・確認した時点で確定する（StaffDashboard.completeReturn → finalizePartialReturn）。
      const contact =
        order.personName ||
        `${order.personLastName || ""} ${order.personFirstName || ""}`.trim() ||
        order.companyName ||
        "";

      const walkinProducts = itemsToReturn.map((item: any) => ({
        id: item.id,
        name: item.name,
        qr: `AS-${item.id}`,
        icon: "package",
        expected: returnQuantities[item.id] || 0,
        image: item.image,
        category: item.category,
      }));

      // 同じ注文の未処理伝票があれば削除してから登録（二重確定による幽霊伝票の防止）
      // 新チケットの決定的ID。同IDの既存行は下の push(upsert) がその場で上書きするため削除しない。
      // 削除→push だと DELETE と POST が並行 HTTP になり、POST が先に着くと直後の DELETE が
      // 新チケットを消してしまう（注文が検品待ちのまま倉庫キューから消える）。
      const walkinId = "WIN-" + (order.id || order.orderNumber || "").toString().replace(/[^0-9A-Za-z]/g, "");
      try {
        OrderBus.getAll<any>("walkinReturns")
          .filter((w: any) => w && w.id !== walkinId && (w.orderId === order.id || (order.orderNumber && w.orderNumber === order.orderNumber)))
          .forEach((w: any) => OrderBus.remove("walkinReturns", w.id));
      } catch { /* ignore */ }

      OrderBus.push("walkinReturns", {
        // 決定的ID: 同一注文の同時／二重送信でも同じIDになり、OrderBus.push が upsert して
        // 1件に集約される（多端末同時提出での幽霊伝票・二重 -R 注文を防止）。注文ID（一意・安定）を優先。
        id: walkinId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        firestoreId: order.firestoreId,
        company: order.companyName || contact || "ゲスト",
        contact,
        rentalNo: order.orderNumber || "—",
        time:
          new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + " 受付",
        note: `お客様による${returningEverything ? "一括返却" : "一部返却"}（直接持ち込み）。倉庫にて検品をお願いします。`,
        requestedReturn: returnQuantities,
        photos: photos || [],
        products: walkinProducts,
        source: "customer_direct_return",
        // 2段階検品: まず受付スタッフが一次検品（reception）→ 倉庫が最終検品（recheck）→ 確定
        stage: "reception",
        returningEverything,
      } as any);

      // 元注文は「検品待ち」に。確定は倉庫検品完了時。
      // pickup→walkin の切替時、以前の集荷タスク残渣(回収予定/requestedReturn)を消す。
      updateOrder(order.id, {
        status: "検品待ち",
        returnRequestType: returnReqType,
        ...(order.staffStatus === "回収予定" ? { staffStatus: "", requestedReturn: {} } : {}),
      });
    }

    // サーバー反映を確認してから成功表示（オフライン/瞬断で「受付済」と誤表示し、タブを閉じて
    // 未送信のまま失われるのを防ぐ）。届いていなければ送信待ちである旨を明示する。
    const ok = await OrderBus.flush(8000);
    void alertDialog(
      !ok
        ? "通信が不安定なため送信待ちです。電波の良い場所で自動的に再送信されます（内容は保持されています）。"
        : usePickupFlow
          ? "返却リクエストを送信しました。"
          : "返却を受け付けました。倉庫での検品後に内容が確定します。"
    );
    navigate("/orders");
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-slate-900 min-h-screen shadow-xl relative flex flex-col pb-[calc(160px+env(safe-area-inset-bottom))] mx-auto">
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center px-4 py-3 justify-between">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/orders")} className="flex items-center justify-center size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200">
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
          <h2 className="text-base font-bold leading-tight flex-1 text-center pr-10 text-slate-900 dark:text-white">
            返却リクエスト最終確認
          </h2>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col gap-6 text-slate-900 dark:text-slate-100">
        
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 px-1 border-b border-slate-200 dark:border-slate-800 pb-2">{method === "direct" ? "返却情報" : "集荷情報"}</h3>
          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 size-10">
                <span className="material-symbols-outlined">{method === "direct" ? "storefront" : "local_shipping"}</span>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500 font-medium">返却方法</span>
                  <span className="text-sm font-bold">{method === "direct" ? "直接持ち込み" : "業者集荷"}</span>
                </div>
                {method === "pickup" && (
                   <>
                     <div className="border-t border-slate-200 dark:border-slate-600"></div>
                     <div className="flex justify-between items-center">
                       <span className="text-xs text-slate-500 font-medium">集荷日時</span>
                       <span className="text-sm font-bold text-right">{pickupDate}<br/>{pickupTime}</span>
                     </div>
                     <div className="border-t border-slate-200 dark:border-slate-600"></div>
                     <div className="flex justify-between items-start">
                       <span className="text-xs text-slate-500 font-medium whitespace-nowrap mt-0.5">集荷場所</span>
                       <span className="text-sm font-bold text-right">{address || "未指定"}</span>
                     </div>
                   </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 px-1 border-b border-slate-200 dark:border-slate-800 pb-2 flex justify-between">
            返却アイテム
            <span className="text-primary">計{totalItemsCount}点</span>
          </h3>
          <div className="flex flex-col gap-3">
            {itemsToReturn.map((item, index) => (
              <ReturnConfirmItem 
                key={`${item.id}-${index}`}
                name={item.name}
                detail={item.category || ""}
                quantity={returnQuantities[item.id].toString()}
                image={item.image}
              />
            ))}
          </div>
        </section>
        
        {photos && photos.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 px-1 border-b border-slate-200 dark:border-slate-800 pb-2">状態写真 ({photos.length}枚)</h3>
            <div className="grid grid-cols-3 gap-3">
               {photos.map((url: string, idx: number) => (
                 <div key={idx} className="aspect-square rounded-lg bg-cover bg-center border border-slate-200 dark:border-slate-700" style={{backgroundImage: `url("${url}")`}}></div>
               ))}
            </div>
          </section>
        )}

        <div className="mt-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-xl p-4 flex gap-3">
          <span className="material-symbols-outlined text-orange-500 shrink-0 mt-0.5">info</span>
          <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            <p className="font-bold text-orange-700 dark:text-orange-400 mb-1">内容をご確認ください</p>
            送信後は内容の変更ができません。数量や日時に誤りがないかご確認ください。
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 w-full max-w-[480px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pt-4 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
        <div className="flex flex-col gap-3">
          <button onClick={handleSubmit} className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-base py-4 px-6 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
            <span>返却依頼を送信</span>
            <span className="material-symbols-outlined text-xl">send</span>
          </button>
          <button onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/orders"))} className="w-full bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 font-bold text-sm py-3 px-6 rounded-xl transition-colors">
            修正する
          </button>
        </div>
      </div>
    </div>
  );
}

const ReturnConfirmItem: React.FC<{ name: string, detail: string, quantity: string, image: string }> = ({ name, detail, quantity, image }) => {
  return (
    <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="bg-slate-100 dark:bg-slate-900 rounded-lg h-16 w-16 shrink-0 bg-center bg-cover" style={{ backgroundImage: `url("${image}")`}}></div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate mb-1">{name}</p>
        <p className="text-[10px] text-slate-500">{detail}</p>
      </div>
      <div className="shrink-0 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600">
        <p className="font-bold text-sm text-primary">x {quantity}</p>
      </div>
    </div>
  );
}
