import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useOrders } from "../context/OrderContext";
import { calculateRentalPrice, getOrGenerateInvoiceBlocks } from "../utils/billing";
import { isVehicleCategory } from '../utils/productUtils';

export default function ReturnConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateOrder, addCustomOrder } = useOrders();

  const { returnQuantities, order, method, address, pickupDate, pickupTime, photos } = location.state || {};

  if (!order || !returnQuantities) {
    return <div className="p-10 text-center">エラーが発生しました。もう一度やり直してください。</div>;
  }

  const itemsToReturn = order.items.filter((item: any) => returnQuantities[item.id] > 0);
  const totalItemsCount = itemsToReturn.reduce((sum: number, item: any) => sum + returnQuantities[item.id], 0);

  const handleSubmit = () => {
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

    order.items.forEach((item: any) => {
      const returningQty = returnQuantities[item.id] || 0;
      const alreadyReturnedQty = item.returnedQuantity || 0; 
      const currentRemainingQty = item.quantity - alreadyReturnedQty;
      const newRemainingQty = currentRemainingQty - returningQty;

      // 1. Calculate Returned Item
      if (returningQty > 0) {
        if (item.type === 'rent' && item.rentPrice) {
          const { totalPrice, breakdown } = calculateRentalPrice(
            item.rentPrice, order.rentalStartDate, actualReturnDate, hasVehicle, isVehicleCategory(item.category), item.rentPriceLongTerm
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
        }
      }

      // 2. Calculate Remaining Item
      if (newRemainingQty > 0 || item.type === 'buy') {
        const remainingQtyToKeep = item.type === 'rent' ? newRemainingQty : item.quantity;
        
        if (item.type === 'rent' && item.rentPrice) {
          const { totalPrice, breakdown } = calculateRentalPrice(
            item.rentPrice, order.rentalStartDate, order.rentalEndDate, hasVehicle, isVehicleCategory(item.category), item.rentPriceLongTerm
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
          remainingTotalBuyPrice += item.buyPrice * item.quantity;
          remainingItemsList.push({ ...item });
        }
      }
    });

    const returnedSubtotal = returnedTotalRentalPrice + returnedTotalBuyPrice;
    const returnedTax = Math.floor(returnedSubtotal * 0.1);
    const returnedTotal = returnedSubtotal + returnedTax;

    const remainingSubtotal = remainingTotalRentalPrice + remainingTotalBuyPrice;
    const remainingTax = Math.floor(remainingSubtotal * 0.1);
    const remainingTotal = remainingSubtotal + remainingTax;

    const returningEverything = remainingItemsList.length === 0;

    if (returningEverything) {
      const tempOrder = {
        ...order,
        items: returnedItemsList,
        subtotal: returnedSubtotal,
        tax: returnedTax,
        total: returnedTotal,
        status: "返却済",
        actualReturnDate: actualReturnDate,
        invoiceBlocks: undefined
      };
      const newInvoiceBlocks = getOrGenerateInvoiceBlocks(tempOrder);

      updateOrder(order.id, {
        items: returnedItemsList,
        subtotal: returnedSubtotal,
        tax: returnedTax,
        total: returnedTotal,
        status: "返却済",
        actualReturnDate: actualReturnDate,
        invoiceBlocks: newInvoiceBlocks
      });
    } else {
      const tempOrder = {
        ...order,
        items: remainingItemsList,
        subtotal: remainingSubtotal,
        tax: remainingTax,
        total: remainingTotal,
        status: "処理中",
        invoiceBlocks: undefined
      };
      const newInvoiceBlocks = getOrGenerateInvoiceBlocks(tempOrder);

      updateOrder(order.id, {
        items: remainingItemsList,
        subtotal: remainingSubtotal,
        tax: remainingTax,
        total: remainingTotal,
        status: "処理中",
        invoiceBlocks: newInvoiceBlocks
      });

      const tempCustomOrder = {
        items: returnedItemsList,
        total: returnedTotal,
        subtotal: returnedSubtotal,
        tax: returnedTax,
        deliveryLocation: order.deliveryLocation,
        deliveryDate: order.deliveryDate,
        siteName: order.siteName,
        constructionNumber: order.constructionNumber,
        companyName: order.companyName,
        personName: order.personName,
        rentalStartDate: order.rentalStartDate,
        rentalEndDate: order.rentalEndDate,
        actualReturnDate: actualReturnDate,
        date: new Date().toLocaleDateString("ja-JP") + " • " + new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        status: "返却済"
      } as any;
      const customInvoiceBlocks = getOrGenerateInvoiceBlocks(tempCustomOrder);

      addCustomOrder({
        ...tempCustomOrder,
        orderNumber: `${order.orderNumber}-R-${Math.floor(Math.random() * 1000)}`,
        invoiceBlocks: customInvoiceBlocks
      });
    }

    alert("返却リクエストを送信しました。");
    navigate("/orders");
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-slate-900 min-h-screen shadow-xl relative flex flex-col pb-32 mx-auto">
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
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 px-1 border-b border-slate-200 dark:border-slate-800 pb-2">集荷情報</h3>
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

      <div className="fixed bottom-0 w-full max-w-[480px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 pb-8 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 pb-safe">
        <div className="flex flex-col gap-3">
          <button onClick={handleSubmit} className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-base py-4 px-6 rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
            <span>返却依頼を送信</span>
            <span className="material-symbols-outlined text-xl">send</span>
          </button>
          <button onClick={() => navigate("/orders")} className="w-full bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 font-bold text-sm py-3 px-6 rounded-xl transition-colors">
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
