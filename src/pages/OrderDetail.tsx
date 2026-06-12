import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useOrders } from "../context/OrderContext";
import { isVehicleCategory } from '../utils/productUtils';
import DocumentViewer from "../components/DocumentViewer";
import { calculateRentalPrice, calculateTotalPayment, parseDateLocal, getOrGenerateInvoiceBlocks } from "../utils/billing";
import OrderBus from "../lib/orderBus";

export default function OrderDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { orders, updateOrder } = useOrders();
  const [viewingDoc, setViewingDoc] = useState<"納品書" | "請求書" | "回収書" | null>(null);
  const [viewingBlockId, setViewingBlockId] = useState<string | null>(null);
  const [showInvoiceSelector, setShowInvoiceSelector] = useState(false);

  // 倉庫の検品記録（写真付き）— お客様にも自分の注文の検品内容を公開する
  const [inspections, setInspections] = useState<any[]>([]);
  useEffect(() => {
    const unsub = OrderBus.subscribe("returnInspections", (rows: any) => setInspections(rows || []));
    return () => unsub();
  }, []);
  
  // Extension state
  const [isExtending, setIsExtending] = useState(false);
  const [newEndDate, setNewEndDate] = useState("");
  const [extendingError, setExtendingError] = useState("");

  const order = orders.find(o => o.id === id);

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-slate-500">
        <p>注文が見つかりません</p>
        <button onClick={() => navigate("/orders")} className="mt-4 text-primary font-bold">戻る</button>
      </div>
    );
  }

  const blocks = getOrGenerateInvoiceBlocks(order);

  // Stepper logic
  const statuses = ["ご注文", "準備中", "配送中", "レンタル中", "返却・完了"];
  let activeStep = 0;
  let statusColor = "amber"; // amber, blue, green, red
  
  if (order.status === "キャンセル") {
    statusColor = "red";
  } else if (order.status === "処理中" || order.status === "確認済み") {
    activeStep = 0;
    statusColor = "amber";
  } else if (order.status === "準備中") {
    activeStep = 1;
    statusColor = "amber";
  } else if (order.status === "配送中") {
    activeStep = 2;
    statusColor = "blue";
  } else if (order.status === "配送済み" || order.status === "レンタル中" || order.status === "回収予定" || order.status === "回収中") {
    activeStep = 3;
    statusColor = "blue";
  } else if (order.status === "検品待ち") {
    // 一部返却の持ち込み品を倉庫が検品中
    activeStep = 3;
    statusColor = "amber";
  } else if (order.status === "返却済み" || order.status === "一部返却" || order.status === "完了") {
    activeStep = 4;
    statusColor = "green";
  }

  const isRentalActive = 
    order.status !== "キャンセル" && 
    order.status !== "返却済み" && 
    order.status !== "完了";

  const hasRentItems = order.items.some(i => i.type === 'rent');

  // Handle extension request
  const handleOpenExtension = () => {
    if (order.rentalEndDate) {
      setNewEndDate(order.rentalEndDate);
    }
    setExtendingError("");
    setIsExtending(true);
  };

  const handleConfirmExtension = async () => {
    if (!order.rentalStartDate || !order.rentalEndDate) return;
    
    const currentEnd = parseDateLocal(order.rentalEndDate);
    const selectedEnd = parseDateLocal(newEndDate);

    if (isNaN(selectedEnd.getTime())) {
      setExtendingError("日付を正しく入力してください。");
      return;
    }

    if (selectedEnd <= currentEnd) {
      setExtendingError("延長日は現在の返却予定日以降の日付を選択してください。");
      return;
    }

    try {
      const hasVehicle = order.items.some(i => isVehicleCategory(i.category) && i.type === 'rent');
      let totalRentalPrice = 0;
      let totalBuyPrice = 0;
      let totalGuaranteeFee = 0;

      const updatedItems = order.items.map(item => {
        const copy = { ...item };
        if (copy.type === 'rent' && copy.rentPrice) {
          const { totalPrice: itemTotal, breakdown, totalBilledDays, totalActualDays } = calculateRentalPrice(
            copy.rentPrice,
            order.rentalStartDate,
            newEndDate,
            hasVehicle,
            isVehicleCategory(copy.category),
            copy.rentPriceLongTerm
          );
          copy.monthlyBreakdown = breakdown;
          copy.calculatedPrice = itemTotal;
          copy.rentalDays = totalActualDays;
          copy.billedDays = totalBilledDays;
          totalRentalPrice += itemTotal * copy.quantity;
          
          if (copy.guaranteeFeeFlat) {
            totalGuaranteeFee += copy.guaranteeFeeFlat;
          }
        } else if (copy.type === 'buy' && copy.buyPrice) {
          totalBuyPrice += copy.buyPrice * copy.quantity;
        }
        return copy;
      });

      const subtotal = totalRentalPrice + totalBuyPrice + totalGuaranteeFee;
      const { tax, total } = calculateTotalPayment(subtotal);

      // Regenerate invoice blocks for the extended period
      const tempOrder = {
        ...order,
        rentalEndDate: newEndDate,
        items: updatedItems,
        subtotal,
        tax,
        total,
        invoiceBlocks: undefined
      };
      const newInvoiceBlocks = getOrGenerateInvoiceBlocks(tempOrder);

      await updateOrder(order.id, {
        rentalEndDate: newEndDate,
        items: updatedItems,
        subtotal,
        tax,
        total,
        invoiceBlocks: newInvoiceBlocks
      });

      setIsExtending(false);
      alert("レンタル期間を延長しました。");
    } catch (err) {
      console.error(err);
      setExtendingError("延長処理に失敗しました。");
    }
  };

  return (
    <div className="font-body-md text-base pb-24 max-w-[480px] mx-auto min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white">
      <header className="sticky top-0 left-0 w-full z-40 flex items-center justify-between px-4 h-14 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/orders")} className="transition-all active:scale-95 text-blue-600 dark:text-blue-400">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="font-manrope text-lg font-bold">注文詳細</h1>
        </div>
        <div className="w-8"></div>
      </header>

      <main className="px-4 pt-4 flex flex-col gap-5">
        {/* Status Stepper */}
        <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-5">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-1 block uppercase">Order ID</span>
              <h2 className="text-lg font-bold font-manrope">{order.orderNumber}</h2>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${
              statusColor === 'red' ? 'bg-red-100 text-red-700 border border-red-200' :
              statusColor === 'green' ? 'bg-green-100 text-green-700 border border-green-200' :
              statusColor === 'blue' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
              'bg-amber-100 text-amber-700 border border-amber-200'
            }`}>
              {order.status}
            </div>
          </div>

          {order.status !== "キャンセル" ? (
            <div className="flex flex-col gap-2">
              <div className="relative h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                    statusColor === 'green' ? 'bg-green-500' :
                    statusColor === 'blue' ? 'bg-primary' : 'bg-amber-500'
                  }`}
                  style={{ width: `${(activeStep / (statuses.length - 1)) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {statuses.map((label, stepIdx) => (
                  <span 
                    key={label} 
                    className={stepIdx <= activeStep ? "text-primary dark:text-blue-400" : ""}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-red-500">このご注文はキャンセルされました。</p>
          )}

          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
            <span className="material-symbols-outlined text-[18px]">calendar_today</span>
            <p className="text-xs font-medium">注文日時: {order.date}</p>
          </div>
        </section>

        {/* Basic Information */}
        <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">info</span>
            基本情報
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">取引先企業</p>
              <p className="text-sm font-medium">{order.companyName || "-"}</p>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">担当者名</p>
              <p className="text-sm font-medium">{order.personName || "-"}</p>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">現場名</p>
              <p className="text-sm font-medium">{order.siteName || "-"}</p>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">工事番号</p>
              <p className="text-sm font-medium">{order.constructionNumber || "-"}</p>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">レンタル期間 (予定)</p>
              <p className="text-sm font-medium">{order.rentalStartDate ? `${order.rentalStartDate.replace(/-/g, "/")} 〜 ${order.rentalEndDate?.replace(/-/g, "/") || ''}` : "指定なし"}</p>
            </div>
            {(order.status === "返却済" || order.status === "一部返却") && order.actualReturnDate && (
              <div className="border-t border-dashed border-primary/30 pt-3 animate-pulse">
                <p className="text-xs text-primary dark:text-blue-400 font-bold mb-1">実際の返却日</p>
                <p className="text-sm font-bold text-primary dark:text-blue-400">{order.actualReturnDate.replace(/-/g, "/")}</p>
              </div>
            )}
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">納品場所</p>
              <p className="text-sm font-medium">{order.deliveryLocation || "-"}</p>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">納品希望日</p>
              <p className="text-sm font-medium">{order.deliveryDate || "-"}</p>
            </div>
          </div>
        </section>

        {/* Order Items */}
        <section className="flex flex-col gap-3">
          <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2 px-1">
            <span className="material-symbols-outlined text-[16px]">inventory_2</span>
            注文商品一覧 ({order.items.length})
          </h3>
          
          {order.items.map((item: any, idx: number) => {
            const price = item.calculatedPrice ?? item.buyPrice ?? 0;
            const isRent = item.type === 'rent';

            return (
              <OrderItem 
                key={`${item.id}-${idx}`}
                name={item.name}
                quantity={item.quantity.toString()}
                returnedQuantity={item.returnedQuantity || 0}
                unit={isRent ? "点/レンタル" : "点/購入"}
                detail={isRent ? (item.actualReturnDate ? "返却額再計算済" : `${item.rentalDays || "—"}日間 (予定)`) : "購入品"}
                price={price.toLocaleString()}
                image={item.image}
                item={item}
              />
            );
          })}
        </section>

        {/* Payment Summary */}
        <section className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-4">お支払い明細</h3>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">小計</span>
              <span className="font-medium text-slate-900 dark:text-white">¥{order.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">消費税 (10%)</span>
              <span className="font-medium text-slate-900 dark:text-white">¥{order.tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-900 dark:text-white">合計金額</span>
              <span className="font-extrabold text-primary text-2xl tracking-tighter">¥{order.total.toLocaleString()}</span>
            </div>
          </div>
        </section>

        {/* Monthly Invoice Blocks */}
        <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
            月別請求内訳 ({blocks.length}期)
          </h3>
          <div className="flex flex-col gap-4 divide-y divide-slate-100 dark:divide-slate-700/50">
            {blocks.map((block) => {
              const statusLabels: Record<string, string> = {
                accumulating: "累積中",
                pending: "請求待ち",
                paid: "支払済み"
              };
              const statusColors: Record<string, string> = {
                accumulating: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
                pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              };

              return (
                <div key={block.id} className="pt-4 first:pt-0 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-extrabold text-sm text-slate-800 dark:text-white">{block.monthPeriod}分</span>
                      <span className="text-[10px] text-slate-400 ml-2">({block.startDate} 〜 {block.endDate})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setViewingBlockId(block.id);
                          setViewingDoc("請求書");
                        }}
                        className="px-2 py-0.5 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:underline rounded text-[10px] font-bold cursor-pointer"
                      >
                        請求書表示
                      </button>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusColors[block.status] || ''}`}>
                        {statusLabels[block.status] || block.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs border-b border-slate-100 dark:border-slate-700/50 pb-2.5 text-slate-500 dark:text-slate-400">
                    <div>
                      <span className="block text-[10px] text-slate-400">実日数 / 請求日数</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{block.actualDays}日 / {block.chargeableDays}日</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">適用単価</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {block.tierApplied === 'Price_B' ? '長期割引 (Price B)' : '通常単価 (Price A)'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">保証料合計</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">¥{block.guaranteeFee.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Extra Costs List */}
                  {block.extraCosts && block.extraCosts.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-3 space-y-2 text-xs">
                      <div className="font-bold text-slate-400 text-[10px] border-b border-slate-200 dark:border-slate-700 pb-1">追加費用明細</div>
                      {block.extraCosts.map((cost) => (
                        <div key={cost.id} className="flex justify-between items-start">
                          <div className="flex-1 min-w-0 pr-2">
                            <span className="font-bold text-slate-700 dark:text-slate-300 block">{cost.itemName}</span>
                            {cost.note && <span className="text-[10px] text-slate-400 dark:text-slate-500 block">{cost.note}</span>}
                            {cost.attachmentUrl && (
                              <a href={cost.attachmentUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 font-bold hover:underline flex items-center gap-0.5 mt-0.5">
                                <span className="material-symbols-outlined text-[11px]">image</span>
                                添付写真を表示
                              </a>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`font-bold font-mono ${cost.amount < 0 ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}`}>
                              {cost.amount >= 0 ? '+' : ''}¥{cost.amount.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-slate-400 block">{cost.isTaxable ? '課税' : '非課税'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Block Totals */}
                  <div className="flex justify-end gap-4 text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                    <span>小計: <span className="text-slate-800 dark:text-slate-200">¥{block.subtotal.toLocaleString()}</span></span>
                    <span>消費税: <span className="text-slate-800 dark:text-slate-200">¥{block.tax.toLocaleString()}</span></span>
                    <span className="text-sm">合計: <span className="text-primary dark:text-blue-400 font-extrabold">¥{block.total.toLocaleString()}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Customer Operations */}
        {isRentalActive && hasRentItems && (
          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">touch_app</span>
              レンタル操作
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleOpenExtension}
                className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 hover:border-primary dark:hover:border-primary transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-primary text-[24px]">more_time</span>
                <span className="text-xs font-bold">期間延長</span>
              </button>
              
              <Link
                to={`/return/${order.id}`}
                className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 hover:border-primary dark:hover:border-primary transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-primary text-[24px]">assignment_return</span>
                <span className="text-xs font-bold">返却手続き</span>
              </Link>
            </div>
          </section>
        )}

        {/* Documents */}
        <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-8 shadow-sm">
          <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">file_copy</span>
            帳票・書類
          </h3>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setViewingDoc("納品書")}
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-primary dark:hover:border-primary/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all font-medium text-sm text-slate-700 dark:text-slate-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                </div>
                <span>納品書を表示・ダウンロード</span>
              </div>
              <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
            </button>
            
            {/* 複数月レンタルでは月ごとの請求書（レンタル中でも各月分を表示できる） */}
            {(order.status === "返却済" || order.status === "一部返却" || order.status === "完了" || (blocks && blocks.length > 0)) && (
              <>
                <button
                  onClick={() => {
                    if (blocks && blocks.length > 1) {
                      setShowInvoiceSelector(true);
                    } else if (blocks && blocks.length === 1) {
                      setViewingBlockId(blocks[0].id);
                      setViewingDoc("請求書");
                    } else {
                      setViewingDoc("請求書");
                    }
                  }}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-primary dark:hover:border-primary/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all font-medium text-sm text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 dark:text-red-400">
                      <span className="material-symbols-outlined text-[18px]">request_quote</span>
                    </div>
                    <span>請求書を表示・ダウンロード</span>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
                </button>
                {/* 回収書は返却後のみ */}
                {(order.status === "返却済" || order.status === "一部返却" || order.status === "完了") && (
                <button
                  onClick={() => setViewingDoc("回収書")}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-primary dark:hover:border-primary/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all font-medium text-sm text-slate-700 dark:text-slate-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
                      <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                    </div>
                    <span>回収書を表示・ダウンロード</span>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
                </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* 検品記録（倉庫）— 保安用品の検品結果・写真、保安車両の貸出/返却チェック */}
        {(() => {
          const baseNum = (order.orderNumber || "").split("-R-")[0];
          const myInspections = (inspections || []).filter(
            (r: any) => r && (r.orderId === order.id || r.orderNumber === order.orderNumber || (baseNum && r.orderNumber === baseNum))
          );
          const vco: any = (order as any).vehicleCheckout;
          const vci: any = (order as any).vehicleCheckin;
          const fuel: any = (order as any).fuelCharge;
          if (myInspections.length === 0 && !vco && !vci) return null;
          return (
            <section className="mt-6 px-4 pb-8">
              <h3 className="text-slate-900 dark:text-white text-base font-bold mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">fact_check</span>
                検品記録
              </h3>

              {myInspections.map((rec: any) => (
                <div key={rec.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">{rec.inspectedAt} ・ {rec.inspector}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${rec.hasShortage ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200"}`}>
                      {rec.hasShortage ? "不足・破損あり" : "検品OK"}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(rec.products || []).map((p: any, i: number) => (
                      <div key={i} className="py-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-800 dark:text-slate-200 min-w-0 truncate">{p.name}</span>
                          <span className={`font-bold shrink-0 ml-2 ${p.shortage > 0 ? "text-red-500" : "text-slate-700 dark:text-slate-300"}`}>{p.counted}/{p.expected} 点</span>
                        </div>
                        {(p.reports || []).map((rp: any, ri: number) => (
                          <div key={ri} className="mt-1.5">
                            <span className="text-[11px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">{rp.reason}{rp.qty ? ` ${rp.qty}点` : ""}</span>
                            {rp.note && <span className="text-[11px] text-slate-500 ml-2">{rp.note}</span>}
                            {(rp.photos || []).length > 0 && (
                              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                                {rp.photos.map((ph: any, pi: number) => (
                                  ph && ph.dataUrl ? (
                                    <img key={pi} src={ph.dataUrl} alt="検品写真" className="aspect-square w-full rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                                  ) : (
                                    <div key={pi} className="relative aspect-square w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700" style={{ background: ph?.bg || "#e2e8f0" }}>
                                      <span className="material-symbols-outlined absolute inset-0 grid place-items-center text-white/60 text-[20px]">image</span>
                                      {ph?.time && <span className="absolute bottom-0.5 left-1 text-[9px] text-white/90 bg-black/40 px-1 rounded">{ph.time}</span>}
                                    </div>
                                  )
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {(vco || vci) && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[18px]">local_shipping</span>保安車両 チェック記録
                  </p>
                  <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
                    {vco && (<>
                      <dt className="text-slate-500">貸出時 走行距離</dt><dd className="font-medium">{vco.km ? `${vco.km} km` : "—"}</dd>
                      <dt className="text-slate-500">貸出時 状態</dt><dd className="font-medium">{vco.condition || "異常なし"}</dd>
                    </>)}
                    {vci && (<>
                      <dt className="text-slate-500">返却時 走行距離</dt><dd className="font-medium">{vci.km ? `${vci.km} km` : "—"}</dd>
                      <dt className="text-slate-500">返却時 状態</dt><dd className="font-medium">{vci.condition || "異常なし"}</dd>
                      <dt className="text-slate-500">燃料</dt>
                      <dd className={`font-bold ${vci.fuelFull ? "text-emerald-600" : "text-red-500"}`}>{vci.fuelFull ? "満タン返却" : "満タン未満（補給対応）"}</dd>
                    </>)}
                  </dl>
                  {fuel && Number(fuel.amount) > 0 && (
                    <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                      <p className="text-[12px] font-bold text-red-600 dark:text-red-400">燃料補給費: ¥{Math.round(Number(fuel.amount)).toLocaleString()}（請求書に計上）</p>
                      {fuel.receiptPhoto && (
                        <img src={fuel.receiptPhoto} alt="給油レシート" className="mt-2 w-28 rounded-lg border border-red-200 dark:border-red-800" />
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })()}
      </main>

      {/* Extension Modal */}
      {isExtending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in scale-in duration-200">
            <div className="p-5">
              <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">more_time</span>
                レンタル期間の延長
              </h3>
              
              <div className="flex flex-col gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-1">現在の返却予定日</p>
                  <p className="font-bold">{order.rentalEndDate?.replace(/-/g, "/")}</p>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">新しい返却予定日</label>
                  <input 
                    type="date"
                    value={newEndDate}
                    onChange={(e) => {
                      setNewEndDate(e.target.value);
                      setExtendingError("");
                    }}
                    className="w-full bg-slate-50 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 rounded-lg h-10 px-3 font-medium outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>

                {extendingError && (
                  <p className="text-xs text-red-500 font-bold">{extendingError}</p>
                )}
              </div>
            </div>
            
            <div className="flex border-t border-slate-100 dark:border-slate-750">
              <button
                onClick={() => setIsExtending(false)}
                className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-r border-slate-100 dark:border-slate-750 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmExtension}
                className="flex-1 py-3 text-sm font-bold text-primary hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                期間を延長する
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingDoc && (
        <DocumentViewer 
          order={order} 
          type={viewingDoc} 
          blockId={viewingBlockId || undefined} 
          onClose={() => {
            setViewingDoc(null);
            setViewingBlockId(null);
          }} 
        />
      )}

      {/* Invoice Month Selector Modal */}
      {showInvoiceSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden p-5 animate-in scale-in duration-200 text-slate-900 dark:text-white">
            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">request_quote</span>
              対象月を選択してください
            </h3>
            <div className="flex flex-col gap-2">
              {blocks.map((block) => (
                <button
                  key={block.id}
                  onClick={() => {
                    setViewingBlockId(block.id);
                    setViewingDoc("請求書");
                    setShowInvoiceSelector(false);
                  }}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 font-bold text-xs flex justify-between items-center transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
                >
                  <span>{block.monthPeriod}分 請求書</span>
                  <span className="text-[10px] text-slate-400">({block.startDate} 〜 {block.endDate})</span>
                </button>
              ))}
              <div className="border-t border-slate-100 dark:border-slate-700 my-2"></div>
              <button
                onClick={() => {
                  setViewingBlockId(null);
                  setViewingDoc("請求書");
                  setShowInvoiceSelector(false);
                }}
                className="w-full text-left p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 font-bold text-xs text-slate-600 dark:text-slate-400 text-center transition-colors cursor-pointer"
              >
                全体合計の請求書を表示
              </button>
              <button
                onClick={() => setShowInvoiceSelector(false)}
                className="w-full text-center py-2.5 text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const OrderItem: React.FC<{ name: string; quantity: string; returnedQuantity?: number; unit: string; detail: string; price: string; image: string; item: any }> = ({ name, quantity, returnedQuantity, unit, detail, price, image, item }) => {
  return (
    <div className="bg-white dark:bg-slate-800 border border-[#c2c6d7] dark:border-slate-700 rounded-xl overflow-hidden shadow-sm flex flex-col">
      <div className="flex">
        <div className="w-24 h-24 flex-shrink-0 bg-slate-50 dark:bg-slate-900 overflow-hidden">
          <img className="w-full h-full object-contain" src={image} alt={name}/>
        </div>
        <div className="flex-1 p-3 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-[15px]">{name}</h4>
              <p className="font-bold text-primary whitespace-nowrap ml-2">
                {quantity} <span className="text-[10px] text-slate-900 dark:text-white">{unit}</span>
              </p>
            </div>
            <p className="text-[12px] text-[#424754] dark:text-slate-400">{detail}</p>
            {returnedQuantity !== undefined && returnedQuantity > 0 && (
              <p className="text-[11px] mt-1 font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full inline-block">
                返却済: {returnedQuantity}点
              </p>
            )}
          </div>
          <div className="flex justify-end items-end">
            <p className="font-extrabold text-[16px] text-[#191b23] dark:text-white tracking-tighter">¥{price}</p>
          </div>
        </div>
      </div>
      {item?.monthlyBreakdown && item.monthlyBreakdown.length > 0 && (
        <div className="px-3 pb-3 pt-1 border-t border-dashed border-slate-200 dark:border-slate-700 mt-1 bg-slate-50 dark:bg-slate-800/80">
          <p className="text-[10px] font-bold text-slate-500 mb-1">月別ご請求額（自動分割）</p>
          <div className="flex flex-col gap-1">
            {item.monthlyBreakdown.map((b: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  {b.monthStr}分 ({b.days}日間)
                  {b.discounted && <span className="ml-1 text-[#f59e0b] bg-[#f59e0b]/10 px-1 py-0.5 rounded text-[9px]">長期</span>}
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-300">¥{(b.price * parseInt(quantity)).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
