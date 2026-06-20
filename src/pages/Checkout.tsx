import { Link, useNavigate } from "react-router-dom";
import { alertDialog } from "../components/AppDialog";
import { useCart } from "../context/CartContext";
import { useOrders } from "../context/OrderContext";
import { useUser } from "../context/UserContext";
import { useProducts } from "../context/ProductContext";
import { useState, useRef } from "react";
import { calculateRentalPrice, getTaxRate } from "../utils/billing";
import { elementToPdf } from "../utils/pdfMultiPage"; // A4フィット + 複数ページ分割 + モバイル共有フォールバック
import { isVehicleCategory } from '../utils/productUtils';
import { isBusinessDay, nextBusinessDay, nonBusinessDayReason } from '../utils/jpHolidays';
import React, { useEffect } from 'react';
import { useIsDesktop } from "../hooks/useIsDesktop";
import CheckoutDesktop from "./desktop/CheckoutDesktop";

// 日付入力は 期間延長（注文詳細）と同じネイティブの <input type="date"> を使用する。
// 値の形式は YYYY-MM-DD（state とそのまま一致）。
function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// PC とスマホでお客様サイトを分岐。
export default function Checkout() {
  return useIsDesktop() ? <CheckoutDesktop /> : <CheckoutMobile />;
}

function CheckoutMobile() {
  const navigate = useNavigate();
  const { items, totalItems } = useCart();
  const { addOrder } = useOrders();
  const { profile, setProfile } = useUser();
  const { products } = useProducts();

  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState(profile.address);
  const [notes, setNotes] = useState("");
  const [rentalStartDate, setRentalStartDate] = useState("");
  const [rentalEndDate, setRentalEndDate] = useState("");
  const [dateError, setDateError] = useState("");

  // 土日・祝日は選択不可。営業日のみ受け付け、それ以外は理由を表示して反映しない。
  const pickBusinessDate = (value: string, apply: (v: string) => void) => {
    if (value && !isBusinessDay(value)) {
      setDateError(`${nonBusinessDayReason(value)}は選択できません。営業日（平日）をお選びください。`);
      return;
    }
    setDateError("");
    apply(value);
  };

  const [siteName, setSiteName] = useState("");
  const [constructionNumber, setConstructionNumber] = useState("");
  // 会社名・担当者名は登録情報（プロフィール）から固定表示。注文では変更不可。
  const [companyName] = useState(profile.companyName);
  const [personFirstName] = useState(profile.firstName);
  const [personLastName] = useState(profile.lastName);

  const estimateRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const earliestDeliveryDate = (() => {
    const now = new Date();
    const min = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() >= 14) {
      min.setDate(min.getDate() + 1);
    }
    // 最短でも次の営業日（土日・祝日を飛ばす）。
    return nextBusinessDay(toDateInputValue(min));
  })();
  const earliestRentalStartDate = earliestDeliveryDate;

  // 数量0の品目は注文・表示から除外する（カートで数量欄を空(0)にしたまま blur せず checkout に
  // 進んだ場合に、0点の明細が注文へ流れ込み合計と食い違うのを防ぐ）。
  const updatedItems = items.filter(item => Number(item.quantity) >= 1).map(item => ({ ...item }));

  let totalRentalPrice = 0;
  let totalBuyPrice = 0;
  let totalGuaranteeFee = 0;
  
  const hasVehicle = updatedItems.some(i => isVehicleCategory(i.category) && i.type === 'rent');

  updatedItems.forEach(item => {
    // Find the full product matching this item to get guarantee settings
    const fullProduct = products.find(p => p && p.id === item.id);
    let guaranteeFeeFlat = 0;
    
    // We only apply guarantee fees to rentals as per requirements
    if (item.type === 'rent' && fullProduct?.isGuarantee) {
      const qty = item.quantity;
      if (fullProduct.guaranteeType === 'flat') {
        guaranteeFeeFlat = (fullProduct.guaranteeRate || 0) * qty;
      } else if (fullProduct.guaranteeFees) {
        if (qty <= 50) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range1) || 0;
        else if (qty <= 100) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range2) || 0;
        else if (qty <= 150) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range3) || 0;
        else if (qty <= 200) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range4) || 0;
        else if (qty <= 250) guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range5) || Number(fullProduct.guaranteeFees.range4) || 0;
        else guaranteeFeeFlat = Number(fullProduct.guaranteeFees.range6) || Number(fullProduct.guaranteeFees.range5) || Number(fullProduct.guaranteeFees.range4) || 0;
      }
    }
    
    // Assign guarantee fee to item for display
    item.guaranteeFeeFlat = guaranteeFeeFlat;

    if (item.type === 'rent' && item.rentPrice) {
      const { totalPrice: itemTotal, breakdown, totalBilledDays, totalActualDays } = calculateRentalPrice(
        item.rentPrice,
        rentalStartDate,
        rentalEndDate,
        hasVehicle,
        isVehicleCategory(item.category),
        item.rentPriceLongTerm
      );
      
      item.monthlyBreakdown = breakdown; // Store breakdown for possible invoice display
      item.calculatedPrice = itemTotal; // DO NOT embed guarantee here
      item.rentalDays = totalActualDays;
      item.billedDays = totalBilledDays;
      totalRentalPrice += itemTotal * item.quantity;
      totalGuaranteeFee += guaranteeFeeFlat;
    } else if (item.type === 'buy' && item.buyPrice) {
      item.calculatedPrice = item.buyPrice;
      totalBuyPrice += item.buyPrice * item.quantity;
    }
  });

  const subtotal = totalRentalPrice + totalBuyPrice + totalGuaranteeFee;
  const tax = Math.floor(subtotal * getTaxRate());
  const total = subtotal + tax;

  const isDateRangeValid = Boolean(
    rentalStartDate &&
    rentalEndDate &&
    rentalEndDate >= rentalStartDate &&
    rentalStartDate >= earliestRentalStartDate &&
    deliveryDate &&
    deliveryDate >= earliestDeliveryDate &&
    deliveryDate <= rentalStartDate &&
    // すべて営業日（土日・祝日不可）
    isBusinessDay(rentalStartDate) &&
    isBusinessDay(rentalEndDate) &&
    isBusinessDay(deliveryDate)
  );
  // カートが空のときは確定不可（0 件注文の作成を防ぐ）。
  // 判定は実際に発注される updatedItems（数量1以上）で行う。items.length だと数量0の行が残った
  // ケースで isFormValid が true になり、品目0・¥0 の注文が作成されてしまう。
  const isFormValid = updatedItems.length > 0 && siteName.trim() !== "" && constructionNumber.trim() !== "" && isDateRangeValid && deliveryLocation.trim() !== "";

  useEffect(() => {
    if (rentalStartDate && rentalStartDate < earliestRentalStartDate) {
      setRentalStartDate(earliestRentalStartDate);
      if (!rentalEndDate || rentalEndDate < earliestRentalStartDate) {
        setRentalEndDate(earliestRentalStartDate);
      }
      return;
    }
    if (rentalStartDate && rentalEndDate && rentalEndDate < rentalStartDate) {
      setRentalEndDate(rentalStartDate);
    }
    if (deliveryDate && deliveryDate < earliestDeliveryDate) {
      setDeliveryDate(earliestDeliveryDate);
    }
    if (deliveryDate && rentalStartDate && deliveryDate > rentalStartDate) {
      setDeliveryDate(rentalStartDate);
    }
  }, [deliveryDate, earliestDeliveryDate, earliestRentalStartDate, rentalStartDate, rentalEndDate]);

  const getQuotationAddressee = () => {
    let addressee = "";
    if (companyName) {
      addressee += companyName + " ";
    }
    if (personLastName || personFirstName) {
      addressee += `${personLastName} ${personFirstName} 様`;
    } else if (companyName) {
      addressee += "御中";
    } else {
      addressee = "　　　　　　様";
    }
    return addressee.trim();
  };

  const handleDownloadEstimate = async () => {
    if (!isFormValid) {
      void alertDialog("必須項目をすべて入力してから見積書を発行してください。");
      return;
    }
    
    if (!estimateRef.current) return;
    setIsGeneratingPdf(true);

    try {
      // A4 にフィットさせ、明細が多い場合は自動で複数ページに分割する（以前は1ページ目で切れて
      // データが欠落していた）。モバイルは共有シート、PC はダウンロードへフォールバック。
      const filename = `御見積書_${companyName || personLastName || "ゲスト"}.pdf`;
      await elementToPdf(estimateRef.current, filename);
    } catch (err) {
      console.error("PDF generation failed", err);
      void alertDialog("見積書の作成に失敗しました。");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm p-4 pb-2 justify-between border-b border-slate-200 dark:border-slate-800/50">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate('/cart')} className="text-slate-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">チェックアウト</h2>
      </header>

      <section className="mt-4 px-4">
        <h3 className="text-slate-900 dark:text-slate-100 text-lg font-bold leading-tight tracking-[-0.015em] pb-3 px-1">お客様情報</h3>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5 space-y-5">
          <label className="flex flex-col w-full">
            <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">会社名 <span className="text-xs font-medium text-slate-400">（登録情報・変更不可）</span></p>
            <input
              value={companyName}
              readOnly
              aria-readonly="true"
              title="登録済みの会社名です。変更はできません。"
              className="w-full rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 px-4 py-3.5 text-base outline-none cursor-not-allowed"
              type="text"
            />
          </label>

          <div className="flex flex-col w-full">
            <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">担当者名 <span className="text-xs font-medium text-slate-400">（登録情報・変更不可）</span></p>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={personLastName}
                readOnly
                aria-readonly="true"
                placeholder="姓"
                title="登録済みの担当者名です。変更はできません。"
                className="w-full rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 px-4 py-3.5 text-base outline-none cursor-not-allowed"
                type="text"
              />
              <input
                value={personFirstName}
                readOnly
                aria-readonly="true"
                placeholder="名"
                title="登録済みの担当者名です。変更はできません。"
                className="w-full rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 px-4 py-3.5 text-base outline-none cursor-not-allowed"
                type="text"
              />
            </div>
          </div>
          
          <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-2"></div>
          
          <label className="flex flex-col w-full">
            <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">現場名 <span className="text-red-500 text-xs font-normal ml-2">必須</span></p>
            <input 
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white px-4 py-3.5 text-base placeholder:text-slate-400 outline-none focus:border-primary focus:ring-primary focus:ring-1 transition-all" 
              placeholder="例：〇〇〇市、〇〇〇建設" 
              type="text"
            />
          </label>

          <label className="flex flex-col w-full">
            <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">工事番号 <span className="text-red-500 text-xs font-normal ml-2">必須</span></p>
            <input 
              value={constructionNumber}
              onChange={(e) => setConstructionNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white px-4 py-3.5 text-base placeholder:text-slate-400 outline-none focus:border-primary focus:ring-primary focus:ring-1 transition-all" 
              placeholder="例：KJ-2023-001" 
              type="text"
            />
          </label>

          {/* 小さいスマホ（〜360px）でもはみ出さないよう min-w-0 + 控えめな padding */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col w-full min-w-0 relative">
              <p className="text-slate-700 dark:text-slate-300 text-[13px] font-bold leading-normal pb-2 whitespace-nowrap">レンタル開始日 <span className="text-red-500 text-[11px] font-normal ml-1">必須</span></p>
              {/* 期間延長と同じネイティブのカレンダー（OS 標準の日付ピッカー）を使用 */}
              <input
                type="date"
                value={rentalStartDate || ""}
                min={earliestRentalStartDate}
                onChange={(e) => pickBusinessDate(e.target.value, (v) => {
                  setRentalStartDate(v);
                  if (deliveryDate && v && deliveryDate > v) {
                    setDeliveryDate(v);
                  }
                  if (rentalEndDate && v && rentalEndDate < v) {
                    setRentalEndDate(v);
                  }
                })}
                className="w-full min-w-0 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white px-2.5 py-3 text-[16px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm transition-all font-sans font-medium"
              />
            </div>
            <div className="flex flex-col w-full min-w-0 relative">
              <p className="text-slate-700 dark:text-slate-300 text-[13px] font-bold leading-normal pb-2 whitespace-nowrap">レンタル終了予定日 <span className="text-red-500 text-[11px] font-normal ml-1">必須</span></p>
              <input
                type="date"
                value={rentalEndDate || ""}
                min={rentalStartDate || undefined}
                onChange={(e) => pickBusinessDate(e.target.value, setRentalEndDate)}
                className="w-full min-w-0 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white px-2.5 py-3 text-[16px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm transition-all font-sans font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col w-full min-w-0 relative">
              <p className="text-slate-700 dark:text-slate-300 text-[13px] font-bold leading-normal pb-2 whitespace-nowrap">納品希望日 <span className="text-red-500 text-[11px] font-normal ml-1">必須</span></p>
              <input
                type="date"
                value={deliveryDate || ""}
                min={earliestDeliveryDate}
                max={rentalStartDate || undefined}
                onChange={(e) => pickBusinessDate(e.target.value, setDeliveryDate)}
                className="w-full min-w-0 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white px-2.5 py-3 text-[16px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm transition-all font-sans font-medium"
              />
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                14:00前のご注文は本日納品を選択できます。14:00以降は翌日以降を選択してください。
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 -mt-1">※ 土曜・日曜・祝日は選択できません（営業日のみ）。</p>
          {dateError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-2">
              {dateError}
            </div>
          )}
          
          <label className="flex flex-col w-full">
            <div className="flex items-center pb-2">
              <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal">納品場所</p>
              <span className="text-red-500 text-xs font-normal ml-auto">必須</span>
            </div>
            <input 
              value={deliveryLocation}
              onChange={(e) => setDeliveryLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white px-4 py-3.5 text-base placeholder:text-slate-400 outline-none focus:border-primary focus:ring-primary focus:ring-1 transition-all" 
              placeholder="例：KJ-2023-001" 
              type="text"
            />
          </label>

          <label className="flex flex-col w-full">
            <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">備考</p>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white px-4 py-3.5 text-base placeholder:text-slate-400 outline-none focus:border-primary focus:ring-primary focus:ring-1 transition-all min-h-[120px] resize-y" 
            />
          </label>
        </div>
      </section>

      <section className="mt-8 px-4">
        <h3 className="text-slate-900 dark:text-slate-100 text-lg font-bold leading-tight tracking-[-0.015em] pb-3 px-1">注文内容</h3>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-5">
            <div className="flex justify-between items-end mb-4 border-b border-dashed border-slate-200 dark:border-slate-700 pb-4">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">合計金額 (税込)</p>
                <p className="text-slate-900 dark:text-white text-3xl font-extrabold tracking-tight">¥{total.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">商品点数</p>
                <p className="text-slate-900 dark:text-white text-base font-bold">{totalItems}点</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {updatedItems.map(item => {
                const isRent = item.type === 'rent';
                const price = item.calculatedPrice ?? item.buyPrice ?? 0;
                return (
                  <div key={`${item.id}-${item.type}`} className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 shrink-0 rounded bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                        <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-800 dark:text-slate-200 text-sm font-bold truncate">{item.name}</p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                          {isRent 
                            ? `レンタル: 実日数 ${item.rentalDays}日間` + (item.billedDays && item.billedDays > item.rentalDays ? ` (最低保証適用: ${item.billedDays}日請求)` : "")
                            : '購入'}
                        </p>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <p className="text-slate-800 dark:text-slate-200 text-sm font-bold">x{item.quantity}</p>
                        <p className="text-primary text-sm font-bold mt-0.5">¥{(price * item.quantity).toLocaleString()}</p>
                      </div>
                    </div>
                    {item.guaranteeFeeFlat !== undefined && item.guaranteeFeeFlat > 0 && (
                      <div className="mt-1 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/10 -mx-3 -mb-3 p-3 rounded-b-lg">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-amber-700 dark:text-amber-500 font-medium">初回準備・保証料</span>
                          <span className="font-bold text-amber-700 dark:text-amber-500">¥{item.guaranteeFeeFlat.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                    {isRent && item.monthlyBreakdown && item.monthlyBreakdown.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700">
                        <div className="flex flex-col gap-1">
                          {item.monthlyBreakdown.map((b: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 dark:text-slate-400">
                                {`${b.monthStr}分 (${b.days}日間)`}
                                {b.discounted && <span className="ml-1 text-[#f59e0b] bg-[#f59e0b]/10 px-1 py-0.5 rounded text-[9px]">長期</span>}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300">¥{(b.price * item.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="text-slate-500 text-sm py-2">カートに商品がありません。</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="h-48"></div>

      {isGeneratingPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl flex flex-col items-center gap-3 shadow-xl">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">見積書を作成中...</p>
          </div>
        </div>
      )}

      {/* Hidden PDF Template (Rendered exactly like standard Japanese format) */}
      <div style={{ position: "absolute", top: -9999, left: -9999, pointerEvents: "none" }}>
        <div ref={estimateRef} className="w-[794px] min-h-[1123px] p-12 mx-auto font-sans relative overflow-hidden" style={{ backgroundColor: "#ffffff", color: "#0f172a" }}>
          
          {/* Faint Background Watermark Logo */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.04, zIndex: 0, pointerEvents: "none" }}>
            <svg width="400" height="150" viewBox="0 0 400 150" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(0, 0)">
                <text x="145" y="80" fontFamily="sans-serif" fontSize="48" fontWeight="bold" fill="#00639C" textAnchor="end" letterSpacing="1">ASAHI</text>
                <ellipse cx="230" cy="65" rx="80" ry="45" fill="#e60012" />
                <text x="230" y="80" fontFamily="sans-serif" fontSize="40" fontWeight="bold" fill="#ffffff" textAnchor="middle" letterSpacing="1">LEASE</text>
                <text x="200" y="135" fontFamily="sans-serif" fontSize="32" fontWeight="900" fill="#231815" textAnchor="middle" letterSpacing="4">アサヒリース 株式会社</text>
              </g>
            </svg>
          </div>

          <div style={{ position: "relative", zIndex: 10 }}>
            <div className="flex justify-between items-start mb-8">
              <div className="w-[60%]">
                <h1 className="text-3xl font-bold tracking-widest mb-6 border-b-2 pb-2 inline-block" style={{ borderColor: "#0f172a" }}>御見積書</h1>
                <div className="mb-4 text-lg">
                  <p className="font-bold underline underline-offset-4 mb-1">{getQuotationAddressee()}</p>
                </div>
                <p className="mb-4 text-sm font-medium">下記の通り御見積申し上げます。</p>
                <div className="mb-6 flex items-end">
                  <span className="text-lg font-bold mr-4">御見積金額</span>
                  <span className="text-2xl font-bold border-b-2" style={{ borderColor: "#0f172a", marginBottom: "-2px" }}>¥{total.toLocaleString()} <span className="text-xs font-normal" style={{ color: "#334155" }}>(税込)</span></span>
                </div>
                
                <table className="w-full text-xs border-collapse mt-4">
                  <tbody>
                    <tr>
                      <th className="border p-2.5 text-left w-24 font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>現場名</th>
                      <td className="border p-2.5 font-medium" style={{ borderColor: "#94a3b8" }}>{siteName}</td>
                    </tr>
                    <tr>
                      <th className="border p-2.5 text-left font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>工事番号</th>
                      <td className="border p-2.5 font-medium" style={{ borderColor: "#94a3b8" }}>{constructionNumber}</td>
                    </tr>
                    <tr>
                      <th className="border p-2.5 text-left font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>レンタル期間</th>
                      <td className="border p-2.5 font-medium" style={{ borderColor: "#94a3b8" }}>{rentalStartDate?.replace(/-/g, "/") || ""} 〜 {rentalEndDate?.replace(/-/g, "/") || ""}</td>
                    </tr>
                    <tr>
                      <th className="border p-2.5 text-left font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>納品場所</th>
                      <td className="border p-2.5 font-medium" style={{ borderColor: "#94a3b8" }}>{deliveryLocation}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="text-xs text-right leading-loose pt-2">
                <p className="mb-4 font-medium">発行日: {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                <div className="text-left inline-block relative mt-2">
                  <p className="font-bold text-lg mb-1 tracking-widest">アサヒリース 株式会社</p>
                  <p style={{ color: "#334155" }}>〒194-0021</p>
                  <p style={{ color: "#334155" }}>東京都町田市中町1-30-8</p>
                  <p style={{ color: "#334155" }}>菅井町田ビル3-Ｄ</p>
                  <p style={{ color: "#334155" }}>TEL: 042-850-9827</p>
                  <p style={{ color: "#334155" }}>FAX: 042-850-9837</p>
                  <p style={{ color: "#334155" }}>登録番号: T3020001111097</p>
                </div>
              </div>
            </div>

            <table className="w-full text-xs border-collapse mb-8">
              <thead>
                <tr>
                  <th className="border p-2.5 text-center font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>No.</th>
                  <th className="border p-2.5 text-left font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>商品名</th>
                  <th className="border p-2.5 text-center font-bold w-16" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>数量</th>
                  <th className="border p-2.5 text-center font-bold w-24" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>単価</th>
                  <th className="border p-2.5 text-center font-bold w-28" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {updatedItems.flatMap((item, index) => {
                  const isRent = item.type === 'rent';
                  const price = item.calculatedPrice ?? item.buyPrice ?? 0;
                  const rows = [
                    <tr key={`${item.id}-${index}-main`}>
                      <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8" }}>{index + 1}</td>
                      <td className="border p-2.5 font-medium" style={{ borderColor: "#94a3b8" }}>
                        {item.name}
                        <div className="text-[10px] mt-1" style={{ color: "#64748b" }}>
                          {isRent 
                            ? `実日数 ${item.rentalDays}日間` + (item.billedDays && item.billedDays > item.rentalDays ? ` (最低保証適用: 請求 ${item.billedDays}日間)` : "")
                            : '販売品'}
                        </div>
                      </td>
                      <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8" }}>{item.quantity}</td>
                      <td className="border p-2.5 text-right" style={{ borderColor: "#94a3b8" }}>¥{price.toLocaleString()}</td>
                      <td className="border p-2.5 text-right font-medium" style={{ borderColor: "#94a3b8" }}>¥{(price * item.quantity).toLocaleString()}</td>
                    </tr>
                  ];
                  
                  if (item.guaranteeFeeFlat && item.guaranteeFeeFlat > 0) {
                    rows.push(
                      <tr key={`${item.id}-${index}-fee`}>
                         <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8" }}></td>
                         <td className="border p-2.5 font-medium" style={{ borderColor: "#94a3b8", paddingLeft: "1.5rem" }}>
                           ↳ 【初回設定追加】 保証・準備費用
                         </td>
                         <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8" }}>1式</td>
                         <td className="border p-2.5 text-right" style={{ borderColor: "#94a3b8" }}>¥{item.guaranteeFeeFlat.toLocaleString()}</td>
                         <td className="border p-2.5 text-right font-medium" style={{ borderColor: "#94a3b8" }}>¥{item.guaranteeFeeFlat.toLocaleString()}</td>
                      </tr>
                    );
                  }
                  return rows;
                })}
                {/* Fill remaining space to keep table structure looking professional */}
                {Array.from({ length: Math.max(0, 10 - updatedItems.length) }).map((_, i) => (
                  <tr key={`empty-${i}`}>
                    <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8", color: "transparent" }}>-</td>
                    <td className="border p-2.5" style={{ borderColor: "#94a3b8", color: "transparent" }}>-</td>
                    <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8", color: "transparent" }}>-</td>
                    <td className="border p-2.5 text-right" style={{ borderColor: "#94a3b8", color: "transparent" }}>-</td>
                    <td className="border p-2.5 text-right" style={{ borderColor: "#94a3b8", color: "transparent" }}>-</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} rowSpan={3} className="border p-4 align-top" style={{ borderColor: "#94a3b8" }}>
                    <span className="font-bold border-b pb-1 mb-2 inline-block" style={{ borderColor: "#94a3b8" }}>備考</span>
                    <span className="whitespace-pre-wrap leading-relaxed block" style={{ color: "#334155" }}>{notes}</span>
                  </td>
                  <th className="border p-2.5 text-right font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>小計</th>
                  <td className="border p-2.5 text-right font-medium" style={{ borderColor: "#94a3b8" }}>¥{subtotal.toLocaleString()}</td>
                </tr>
                <tr>
                  <th className="border p-2.5 text-right font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f8fafc" }}>消費税 (10%)</th>
                  <td className="border p-2.5 text-right font-medium" style={{ borderColor: "#94a3b8" }}>¥{tax.toLocaleString()}</td>
                </tr>
                <tr>
                  <th className="border p-2.5 text-right text-sm font-bold" style={{ borderColor: "#94a3b8", backgroundColor: "#f1f5f9" }}>合計</th>
                  <td className="border p-2.5 text-right font-bold text-sm" style={{ borderColor: "#94a3b8" }}>¥{total.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            
            <div className="flex justify-between items-end mt-12">
              <p className="text-[10px]" style={{ color: "#64748b" }}>※ 本書の有効期限は発行日より1ヶ月とさせていただきます。</p>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 pb-8 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 pb-safe">
        <div className="w-full flex flex-col gap-3">
          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">お支払い合計</span>
            <span className="text-xl font-extrabold text-slate-900 dark:text-white">¥{total.toLocaleString()}</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleDownloadEstimate}
              className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-full border-2 border-primary px-2 py-2 text-primary font-bold bg-white dark:bg-slate-800 shadow-sm active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">request_quote</span>
              <span className="text-[11px] whitespace-nowrap">見積書を発行</span>
            </button>
            <button 
              disabled={!isFormValid}
              onClick={() => {
                if (!isDateRangeValid) {
                  void alertDialog("日付を確認してください。14:00以降は本日のレンタル開始を選択できません。レンタル終了予定日はレンタル開始日以降を選択してください。");
                  return;
                }
                setProfile({ ...profile, companyName, firstName: personFirstName, lastName: personLastName, address: deliveryLocation });
                navigate("/checkout-confirm", {
                  state: {
                    orderData: {
                      items: updatedItems, total, subtotal, tax, deliveryLocation, deliveryDate, siteName, constructionNumber, companyName,
                      personName: `${personLastName} ${personFirstName}`.trim(),
                      personLastName, personFirstName,
                      rentalStartDate, rentalEndDate, notes,
                      // ログイン中アカウントの情報を注文に紐付ける（admin 側で発注者を特定できる）
                      userId: profile.id,
                      userEmail: profile.email,
                      userPhone: profile.phone,
                    }
                  }
                });
              }}
              className={`f7-cta flex-[2.5] min-w-0 whitespace-nowrap px-4 ${!isFormValid ? "" : ""}`}
            >
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              注文を確定する
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
