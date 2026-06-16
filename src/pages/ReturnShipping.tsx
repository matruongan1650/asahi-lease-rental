import React, { useState, useRef } from "react";
import { alertDialog } from "../components/AppDialog";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";

function normalizeDateInput(value: any): string {
  const match = String(value || "").match(/(\d{4})[^\d](\d{1,2})[^\d](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("image read failed"));
    reader.readAsDataURL(file);
  });
}

export default function ReturnShipping() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const location = useLocation();
  const returnQuantities = location.state?.returnQuantities;
  const order = location.state?.order;
  const returnType = location.state?.returnType || "all";
  const { profile, setProfile } = useUser();

  const [method, setMethod] = useState<"direct" | "pickup">(
    returnType === "partial" ? "direct" : "pickup"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const returnMinDate = normalizeDateInput(order?.rentalStartDate);
  const returnMaxDate = normalizeDateInput(order?.rentalEndDate);
  
  const [address, setAddress] = useState(profile.address);
  const [pickupDate, setPickupDate] = useState(returnMaxDate || returnMinDate || "");
  const [pickupTime, setPickupTime] = useState("午前中");
  const isDateOutOfRange = Boolean(
    pickupDate &&
    ((returnMinDate && pickupDate < returnMinDate) || (returnMaxDate && pickupDate > returnMaxDate))
  );

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = Math.max(0, 5 - photos.length);
      const selected = Array.from(files).slice(0, remainingSlots).filter((file) => file.type.startsWith("image/"));
      const dataUrls = await Promise.all(selected.map(readImageAsDataUrl));
      setPhotos(prev => [...prev, ...dataUrls.filter(Boolean)].slice(0, 5));
      e.target.value = "";
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-hidden pb-[140px] text-slate-900 dark:text-white bg-background-light dark:bg-background-dark max-w-[480px] mx-auto">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-4 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate(`/return/${orderId}`)} className="flex size-10 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h2 className="text-lg font-bold leading-tight text-center flex-1 pr-10">返却方法・配送設定</h2>
      </header>

      <main className="flex flex-col gap-6 p-4">
        
        {/* Method Selection */}
        <section>
          <h3 className="text-sm font-bold mb-3 px-1">返却方法の選択</h3>
          <div className="grid grid-cols-1 gap-3">
            <label className={`flex items-start p-4 rounded-xl border-2 transition-all cursor-pointer ${method === "direct" ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"}`}>
              <input 
                type="radio" 
                name="returnMethod" 
                value="direct"
                checked={method === "direct"}
                onChange={() => setMethod("direct")}
                className="mt-1 w-5 h-5 text-primary border-slate-300 focus:ring-primary"
              />
              <div className="ml-3 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-300">storefront</span>
                  <span className="font-bold text-sm">直接持ち込み</span>
                </div>
                <p className="text-xs text-slate-500">アサヒリース株式会社に直接お持ち込みいただきます。</p>
              </div>
            </label>
            
            <label className={`flex items-start p-4 rounded-xl border-2 transition-all cursor-pointer ${method === "pickup" ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"}`}>
              <input
                type="radio"
                name="returnMethod"
                value="pickup"
                checked={method === "pickup"}
                onChange={() => setMethod("pickup")}
                className="mt-1 w-5 h-5 text-primary border-slate-300 focus:ring-primary"
              />
              <div className="ml-3 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-300">local_shipping</span>
                  <span className="font-bold text-sm">回収を依頼</span>
                </div>
                <p className="text-xs text-slate-500">
                  {returnType === "partial" ? "一部返却の対象品だけを指定場所まで引取に伺います。" : "回収者が指定の場所まで引取に伺います。"}
                </p>
              </div>
            </label>
          </div>
        </section>

        {method === "pickup" && (
          <section className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-sm font-bold border-b border-slate-100 dark:border-slate-700 pb-2">情報入力</h3>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">回収場所（納品場所と同じ）<span className="text-red-500 ml-1">*</span></label>
              <input 
                type="text" 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                placeholder="東京都渋谷区〇〇 1-2-3"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">回収希望日 <span className="text-red-500 ml-1">*</span></label>
                <input 
                  type="date" 
                  value={pickupDate}
                  min={returnMinDate || undefined}
                  max={returnMaxDate || undefined}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {returnMinDate || "開始日未設定"} 〜 {returnMaxDate || "終了日未設定"} の範囲で選択してください。
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">回収希望時間</label>
                <select 
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  <option>午前中</option>
                  <option>12:00 - 14:00</option>
                  <option>14:00 - 16:00</option>
                  <option>16:00 - 18:00</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {method === "direct" && (
          <section className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-3">
            <h3 className="text-sm font-bold border-b border-slate-100 dark:border-slate-700 pb-2">持込予定日</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">返却予定日 <span className="text-red-500 ml-1">*</span></label>
              <input
                type="date"
                value={pickupDate}
                min={returnMinDate || undefined}
                max={returnMaxDate || undefined}
                onChange={(e) => setPickupDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {returnMinDate || "開始日未設定"} 〜 {returnMaxDate || "終了日未設定"} の範囲で選択してください。
              </p>
            </div>
          </section>
        )}

        <section className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
             <h3 className="text-sm font-bold flex items-center gap-2">
                写真の追加 <span className="text-[10px] font-normal text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">任意</span>
             </h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            返却する商品の現在の状態がわかる写真を追加してください。<br/>キズ・汚れなどがある場合は特に撮影をお願いします。
          </p>
          
          <div className="grid grid-cols-3 gap-3">
             {photos.map((photoUrl, index) => (
                <div key={index} className="relative aspect-square rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-900">
                   <img src={photoUrl} className="w-full h-full object-cover" alt="返却商品の写真" />
                   <button 
                     onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                     className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                   >
                     <span className="material-symbols-outlined text-[14px]">close</span>
                   </button>
                </div>
             ))}
             
             {photos.length < 5 && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[24px]">add_a_photo</span>
                  <span className="text-[10px] font-bold mt-1">追加</span>
                </button>
             )}
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            multiple
            onChange={handlePhotoUpload}
          />
        </section>

      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20 w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-safe">
        <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
          <button 
            onClick={() => {
              if (!pickupDate || isDateOutOfRange) {
                void alertDialog("返却予定日はレンタル開始日からレンタル終了予定日の範囲で選択してください。");
                return;
              }
              setProfile({ ...profile, address });
              navigate(`/return-confirmation`, { state: { returnQuantities, order, method, address, pickupDate, pickupTime, photos }});
            }}
            className="w-full rounded-xl bg-primary hover:bg-blue-600 text-white font-bold py-4 text-center shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform"
          >
            確認画面へ進む
          </button>
        </div>
      </div>
    </div>
  );
}
