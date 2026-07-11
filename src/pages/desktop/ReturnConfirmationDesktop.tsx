import React from "react";
import { alertDialog } from "../../components/AppDialog";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useOrders } from "../../context/OrderContext";
import { calculateRentalPrice, getTaxRate } from "../../utils/billing";
import { isVehicleCategory } from "../../utils/productUtils";
import OrderBus from "../../lib/orderBus";

/** PC 用 返却リクエスト最終確認（お客様デスクトップサイト）。モバイル ReturnConfirmation と
 *  同じガード・返却金額計算・walkinReturns 登録／回収フロー・注文ステータス更新を再利用。 */
export default function ReturnConfirmationDesktop() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateOrder } = useOrders();
  const submittingRef = React.useRef(false); // 二重送信ガード（モバイル版と同様）

  const { returnQuantities, order, method, address, pickupDate, pickupTime, photos } = location.state || {};

  if (!order || !returnQuantities) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <span className="material-symbols-outlined text-[72px] text-slate-200">error_outline</span>
        <h1 className="text-2xl font-extrabold text-slate-800 mt-2">エラーが発生しました</h1>
        <p className="text-slate-500 mt-2">もう一度やり直してください。</p>
        <Link to="/orders" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-blue-600">
          <span className="material-symbols-outlined text-[20px]">receipt_long</span>注文履歴へ
        </Link>
      </div>
    );
  }

  // 返却対象はレンタル行のみ。数量マップは item.id キーのため、同一IDで rent/buy 両行を持つ注文だと
  // 購入行まで返却対象に取り違えられる（計数・walkinProducts・-R請求の水増し）(C15)。
  const itemsToReturn = order.items.filter((item: any) => item.type === 'rent' && returnQuantities[item.id] > 0);
  const totalItemsCount = itemsToReturn.reduce((sum: number, item: any) => sum + returnQuantities[item.id], 0);

  const handleSubmit = async () => {
    if (submittingRef.current) return; // 連打で updateOrder/walkinReturns/alert が二重実行されるのを防ぐ
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
    // 「全量返却か」は実際の残数で判定する（rentPrice=0/未設定の品目をリストから落とすと
    // 一部返却を全量返却と誤判定するため）。
    let totalRemainingQty = 0;

    order.items.forEach((item: any) => {
      const returningQty = item.type === 'rent' ? (returnQuantities[item.id] || 0) : 0; // buy 行は返却数を適用しない(C15)
      const alreadyReturnedQty = item.returnedQuantity || 0;
      const currentRemainingQty = item.quantity - alreadyReturnedQty;
      const newRemainingQty = currentRemainingQty - returningQty;

      // 1. Calculate Returned Item（価格の有無ではなく type で判定）
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
      // 倉庫が既に受付・検品中(stage=recheck / receptionAt)のチケットがある間は、集荷依頼の再提出で
      // 検品結果を消したり注文を回収中へ巻き戻したりしない（walkin 分岐と同じガード）(C12)。
      const inProgressTicket = OrderBus.getAll<any>("walkinReturns").some((w: any) =>
        w && (w.orderId === order.id || (order.orderNumber && w.orderNumber === order.orderNumber)) &&
        (w.stage === "recheck" || w.receptionAt));
      if (inProgressTicket) {
        void alertDialog("この返却は既に倉庫で受付・検品中のため、内容を変更できません。変更が必要な場合は倉庫までご連絡ください。");
        navigate("/orders");
        return;
      }
      // walkin→pickup の切替時、以前の持込チケットが倉庫キューに残らないよう掃除する。
      // 進行中（受付済み・倉庫差戻しの再検品 WIN-RE-*）は掃除対象外(C13)。
      try {
        OrderBus.getAll<any>("walkinReturns")
          .filter((w: any) => w && (w.orderId === order.id || (order.orderNumber && w.orderNumber === order.orderNumber))
            && w.stage !== "recheck" && !w.receptionAt)
          .forEach((w: any) => OrderBus.remove("walkinReturns", w.id));
      } catch { /* ignore */ }
      updateOrder(order.id, {
        status: "回収中",
        staffStatus: "回収予定",
        returnRequestType: returnReqType,
        requestedReturn: returnQuantities,
        rentalEndDate: pickupDate || order.rentalEndDate,
        // 再提出時は前回の【回収リクエスト】ブロックを取り除いてから付け直す（編集のたびに古い日時・住所が蓄積しない）(C16)。
        notes: `【回収リクエスト】希望日時: ${pickupDate} ${pickupTime}\n集荷場所: ${address}\n${String(order.notes || order.note || '').replace(/^(【回収リクエスト】希望日時:.*\n集荷場所:.*(\n|$))+/, '')}`
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
      // 倉庫が既に一次受付(reception)を済ませたチケット(stage=recheck / receptionAt あり)を、
      // お客様の再提出で reception へ巻き戻し・上書きしない（倉庫の検品結果を消さない）(C2)。
      const existingWalkin = OrderBus.getAll<any>("walkinReturns").find((w: any) => w && w.id === walkinId);
      if (existingWalkin && (existingWalkin.stage === "recheck" || existingWalkin.receptionAt)) {
        void alertDialog("この返却は既に倉庫で受付・検品中のため、内容を変更できません。変更が必要な場合は倉庫までご連絡ください。");
        navigate("/orders");
        return;
      }
      try {
        OrderBus.getAll<any>("walkinReturns")
          // 倉庫差戻しの再検品チケット(WIN-RE-*, stage=recheck)等の進行中チケットは掃除しない(C13)。
          .filter((w: any) => w && w.id !== walkinId && (w.orderId === order.id || (order.orderNumber && w.orderNumber === order.orderNumber))
            && w.stage !== "recheck" && !w.receptionAt)
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
    <div className="max-w-3xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">ホーム</Link>
        <span className="mx-1">/</span>
        <Link to="/orders" className="hover:text-primary">注文履歴</Link>
        <span className="mx-1">/</span>返却リクエスト最終確認
      </nav>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-6">返却リクエスト最終確認</h1>

      <div className="flex flex-col gap-6">
        {/* 返却情報 / 集荷情報 */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-6 py-4 text-base font-extrabold text-slate-900 border-b border-slate-100">
            {method === "direct" ? "返却情報" : "集荷情報"}
          </h2>
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 size-12">
                <span className="material-symbols-outlined">{method === "direct" ? "storefront" : "local_shipping"}</span>
              </div>
              <div className="flex flex-col gap-3 w-full">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500 font-medium">返却方法</span>
                  <span className="text-sm font-bold text-slate-900">{method === "direct" ? "直接持ち込み" : "業者集荷"}</span>
                </div>
                {method === "pickup" && (
                  <>
                    <div className="h-px bg-slate-100" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500 font-medium">集荷日時</span>
                      <span className="text-sm font-bold text-slate-900 text-right">{pickupDate} {pickupTime}</span>
                    </div>
                    <div className="h-px bg-slate-100" />
                    <div className="flex justify-between items-start gap-6">
                      <span className="text-sm text-slate-500 font-medium whitespace-nowrap mt-0.5">集荷場所</span>
                      <span className="text-sm font-bold text-slate-900 text-right">{address || "未指定"}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 返却アイテム */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-6 py-4 text-base font-extrabold text-slate-900 border-b border-slate-100 flex items-center justify-between">
            返却アイテム
            <span className="text-sm font-extrabold text-primary">計{totalItemsCount}点</span>
          </h2>
          <div className="divide-y divide-slate-100">
            {itemsToReturn.map((item: any, index: number) => (
              <div key={`${item.id}-${index}`} className="flex items-center gap-4 p-5">
                <div className="bg-slate-50 rounded-xl h-20 w-20 shrink-0 bg-center bg-contain bg-no-repeat border border-slate-100" style={{ backgroundImage: `url("${item.image}")` }} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base text-slate-900 line-clamp-2">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.category || ""}</p>
                </div>
                <div className="shrink-0 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                  <p className="font-extrabold text-base text-primary">x {returnQuantities[item.id]}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 状態写真 */}
        {photos && photos.length > 0 && (
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-6 py-4 text-base font-extrabold text-slate-900 border-b border-slate-100">
              状態写真 <span className="text-sm font-bold text-slate-400">（{photos.length}枚）</span>
            </h2>
            <div className="p-6 grid grid-cols-3 sm:grid-cols-4 gap-4">
              {photos.map((url: string, idx: number) => (
                <div key={idx} className="aspect-square rounded-xl bg-cover bg-center border border-slate-200" style={{ backgroundImage: `url("${url}")` }} />
              ))}
            </div>
          </section>
        )}

        {/* 不可逆 警告 */}
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 flex gap-3">
          <span className="material-symbols-outlined text-orange-500 shrink-0 mt-0.5">info</span>
          <div className="text-sm text-slate-700 leading-relaxed">
            <p className="font-bold text-orange-700 mb-1">内容をご確認ください</p>
            送信後は内容の変更ができません。数量や日時に誤りがないかご確認ください。
          </div>
        </div>

        {/* In-flow CTA buttons (NOT fixed) */}
        <div className="flex flex-col sm:flex-row-reverse gap-3 mt-2">
          <button
            onClick={handleSubmit}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/20 hover:bg-blue-600 active:scale-[0.99] transition-all"
          >
            <span>返却依頼を送信</span>
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
          <button
            onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/orders"))}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 px-6 py-3.5 text-base font-bold text-slate-700 hover:bg-slate-50 active:scale-[0.99] transition-all"
          >
            修正する
          </button>
        </div>
      </div>
    </div>
  );
}
