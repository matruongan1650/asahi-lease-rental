import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useOrders } from "../context/OrderContext";
import { useUser } from "../context/UserContext";
import { useProducts } from "../context/ProductContext";
import { useState, useRef } from "react";
import { calculateRentalPrice } from "../utils/billing";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ja } from "date-fns/locale/ja";
import { isVehicleCategory } from '../utils/productUtils';
import React, { useEffect, forwardRef } from 'react';

registerLocale("ja", ja);

const CustomDateInput = forwardRef<HTMLInputElement, any>((props, ref) => {
  return (
    <div className="relative w-full">
      <input 
        {...props} 
        ref={ref}
        maxLength={10}
        autoComplete="off"
      />
      <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 text-primary/60 pointer-events-none select-none text-[20px]">
        calendar_month
      </span>
    </div>
  );
});

const formatDateToYYYYMMDD = (date: Date | null) => {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDateFromYYYYMMDD = (dateStr: string) => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
};

const handleDateChangeRaw = (e: any) => {
  if (!e || !e.target || typeof (e.target as HTMLInputElement).value !== 'string') return;
  const target = e.target as HTMLInputElement;
  let val = target.value.replace(/\D/g, '');
  if (val.length > 4 && val.length <= 6) {
    target.value = val.slice(0, 4) + '/' + val.slice(4);
  } else if (val.length > 6) {
    target.value = val.slice(0, 4) + '/' + val.slice(4, 6) + '/' + val.slice(6, 8);
  } else {
    target.value = val;
  }
};

export default function Checkout() {
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
  
  const [siteName, setSiteName] = useState("");
  const [constructionNumber, setConstructionNumber] = useState("");
  const [companyName, setCompanyName] = useState(profile.companyName);
  const [personFirstName, setPersonFirstName] = useState(profile.firstName);
  const [personLastName, setPersonLastName] = useState(profile.lastName);

  const estimateRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const updatedItems = items.map(item => ({ ...item }));

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
  const tax = Math.floor(subtotal * 0.1);
  const total = subtotal + tax;

  const isFormValid = siteName.trim() !== "" && constructionNumber.trim() !== "" && rentalStartDate.trim() !== "" && rentalEndDate.trim() !== "" && deliveryDate.trim() !== "" && deliveryLocation.trim() !== "";

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
      alert("必須項目をすべて入力してから見積書を発行してください。");
      return;
    }
    
    if (!estimateRef.current) return;
    setIsGeneratingPdf(true);
    
    try {
      const element = estimateRef.current;
      const canvas = await html2canvas(element, { 
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, Math.min(pdfHeight, 297));
      
      const filename = `御見積書_${companyName || personLastName || "ゲスト"}.pdf`;
      const pdfBlob = pdf.output('blob');

      // Mobile Safari / iOS fallback: use Web Share API if available
      if (navigator.canShare && navigator.share) {
        try {
          const file = new File([pdfBlob], filename, { type: 'application/pdf' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: '御見積書',
            });
            // If share was successful, don't trigger the default download to avoid double action
            return;
          }
        } catch (shareErr) {
          console.log("Share API cancelled or failed, falling back to default download.", shareErr);
        }
      }

      // Standard fallback (Desktop / Android / older browsers)
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
    } catch (err) {
      console.error("PDF generation failed", err);
      alert("見積書の作成に失敗しました。");
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
            <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">会社名</p>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-900/20 text-slate-700 dark:text-slate-300 px-4 py-3.5 text-base outline-none focus:border-primary focus:ring-primary focus:ring-1 transition-all"
              type="text"
            />
          </label>
          
          <div className="flex flex-col w-full">
            <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">担当者名</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={personLastName}
                onChange={(e) => setPersonLastName(e.target.value)}
                placeholder="姓"
                className="w-full rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-900/20 text-slate-700 dark:text-slate-300 px-4 py-3.5 text-base outline-none focus:border-primary focus:ring-primary focus:ring-1 transition-all"
                type="text"
              />
              <input
                value={personFirstName}
                onChange={(e) => setPersonFirstName(e.target.value)}
                placeholder="名"
                className="w-full rounded-lg border border-slate-100 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-900/20 text-slate-700 dark:text-slate-300 px-4 py-3.5 text-base outline-none focus:border-primary focus:ring-primary focus:ring-1 transition-all"
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

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col w-full relative">
              <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">レンタル開始日 <span className="text-red-500 text-xs font-normal ml-2">必須</span></p>
              <DatePicker
                selected={parseDateFromYYYYMMDD(rentalStartDate)}
                onChange={(date) => {
                  setRentalStartDate(formatDateToYYYYMMDD(date));
                }}
                onChangeRaw={handleDateChangeRaw}
                locale="ja"
                dateFormat="yyyy/MM/dd"
                customInput={<CustomDateInput />}
                wrapperClassName="w-full"
                className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white px-4 pr-11 py-3 text-[16px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm transition-all font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                placeholderText="年 / 月 / 日"
              />
            </div>
            <div className="flex flex-col w-full relative">
              <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">レンタル終了予定日 <span className="text-red-500 text-xs font-normal ml-2">必須</span></p>
              <DatePicker
                selected={parseDateFromYYYYMMDD(rentalEndDate)}
                onChange={(date) => setRentalEndDate(formatDateToYYYYMMDD(date))}
                onChangeRaw={handleDateChangeRaw}
                locale="ja"
                dateFormat="yyyy/MM/dd"
                customInput={<CustomDateInput />}
                wrapperClassName="w-full"
                className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white px-4 pr-11 py-3 text-[16px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm transition-all font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                placeholderText="年 / 月 / 日"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col w-full relative">
              <p className="text-slate-700 dark:text-slate-300 text-sm font-bold leading-normal pb-2">納品希望日 <span className="text-red-500 text-xs font-normal ml-2">必須</span></p>
              <DatePicker
                selected={parseDateFromYYYYMMDD(deliveryDate)}
                onChange={(date) => setDeliveryDate(formatDateToYYYYMMDD(date))}
                onChangeRaw={handleDateChangeRaw}
                locale="ja"
                dateFormat="yyyy/MM/dd"
                customInput={<CustomDateInput />}
                wrapperClassName="w-full"
                className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white px-4 pr-11 py-3 text-[16px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm transition-all font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                placeholderText="年 / 月 / 日"
              />
            </div>
          </div>
          
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
              className="flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-primary px-2 py-2 text-primary font-bold shadow-sm hover:bg-primary/5 active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">request_quote</span>
              <span className="text-[11px]">見積書を発行</span>
            </button>
            <button 
              disabled={!isFormValid}
              onClick={() => {
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
              className={`flex-[2.5] flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/30 active:scale-[0.98] transition-all ${!isFormValid ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed shadow-none" : "bg-primary hover:bg-blue-600"}`}
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
