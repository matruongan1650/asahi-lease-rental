import React, { useState, useRef } from "react";
import { alertDialog } from "../../components/AppDialog";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useUser } from "../../context/UserContext";

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

/** PC 用 返却方法・配送設定（お客様デスクトップサイト）。モバイル ReturnShipping と同じ検証・永続化・遷移ロジックを再利用。 */
export default function ReturnShippingDesktop() {
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
  // 延滞（終了予定日 < 今日）でも返却/回収日を選べるよう、上限は「終了予定日」と「今日」の遅い方。
  const _now = new Date(); // JST ローカルの「今日」（toISOString は UTC のため早朝にズレる）。
  const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  const returnMaxEffective = [returnMaxDate, todayStr].filter(Boolean).sort().pop() || "";

  const [address, setAddress] = useState(profile.address);
  const [pickupDate, setPickupDate] = useState(returnMaxEffective || returnMinDate || "");
  const [pickupTime, setPickupTime] = useState("午前中");
  const isDateOutOfRange = Boolean(
    pickupDate &&
    ((returnMinDate && pickupDate < returnMinDate) || (returnMaxEffective && pickupDate > returnMaxEffective))
  );

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input.files;
    if (!files || files.length === 0) return;
    try {
      const remainingSlots = Math.max(0, 5 - photos.length);
      const selected = Array.from(files).slice(0, remainingSlots).filter((file) => file.type.startsWith("image/"));
      // allSettled: 1枚の読み込み失敗で選択全部が消える（未処理 rejection）のを防ぐ。
      const results = await Promise.allSettled(selected.map(readImageAsDataUrl));
      const dataUrls = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter(Boolean);
      setPhotos(prev => [...prev, ...dataUrls].slice(0, 5));
      const failed = selected.length - dataUrls.length;
      if (failed > 0) void alertDialog(`${failed}枚の画像を読み込めませんでした。別の画像でお試しください。`);
    } finally {
      input.value = "";
    }
  };

  const handleProceed = () => {
    if (!pickupDate || isDateOutOfRange) {
      void alertDialog("返却予定日はレンタル開始日以降の日付で選択してください（延滞中は本日まで指定できます）。");
      return;
    }
    setProfile({ ...profile, address });
    navigate(`/return-confirmation`, { state: { returnQuantities, order, method, address, pickupDate, pickupTime, photos } });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 text-slate-900">
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">ホーム</Link>
        <span className="mx-1">/</span>
        <Link to="/return" className="hover:text-primary">返却</Link>
        <span className="mx-1">/</span>
        返却方法・配送設定
      </nav>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">返却方法・配送設定</h1>
        <button
          onClick={() => (window.history.length > 2 ? navigate(-1) : navigate(`/return/${orderId}`))}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-primary transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>戻る
        </button>
      </div>

      <div className="flex gap-8 items-start flex-col lg:flex-row">
        {/* Left: form content */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-6">
          {/* Method Selection */}
          <section className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">moving</span>返却方法の選択
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={`flex items-start p-4 rounded-xl border-2 transition-all cursor-pointer ${method === "direct" ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300"}`}>
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
                    <span className="material-symbols-outlined text-[20px] text-slate-600">storefront</span>
                    <span className="font-bold text-sm">直接持ち込み</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">アサヒリース株式会社に直接お持ち込みいただきます。</p>
                </div>
              </label>

              {/* 一部返却は直接持ち込みのみ（業者集荷は不可） */}
              {returnType !== "partial" && (
                <label className={`flex items-start p-4 rounded-xl border-2 transition-all cursor-pointer ${method === "pickup" ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300"}`}>
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
                      <span className="material-symbols-outlined text-[20px] text-slate-600">local_shipping</span>
                      <span className="font-bold text-sm">回収を依頼</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">回収者が指定の場所まで引取に伺います。</p>
                  </div>
                </label>
              )}
            </div>
            {returnType === "partial" && (
              <p className="mt-4 flex items-start gap-1.5 text-[11px] text-slate-500 leading-relaxed">
                <span className="material-symbols-outlined text-[14px] text-primary mt-px">info</span>
                一部返却は「直接持ち込み」のみご利用いただけます。業者集荷をご希望の場合は、全量返却をご選択ください。
              </p>
            )}
          </section>

          {method === "pickup" && (
            <section className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3">情報入力</h2>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600">回収場所（納品場所と同じ）<span className="text-red-500 ml-1">*</span></label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="東京都渋谷区〇〇 1-2-3"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-600">回収希望日 <span className="text-red-500 ml-1">*</span></label>
                  <input
                    type="date"
                    value={pickupDate}
                    min={returnMinDate || undefined}
                    max={returnMaxEffective || undefined}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {returnMinDate || "開始日未設定"} 〜 {returnMaxEffective || "終了日未設定"} の範囲で選択できます（延滞時は本日まで）。
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-600">回収希望時間</label>
                  <select
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
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
            <section className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm flex flex-col gap-3">
              <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3">持込予定日</h2>
              <div className="flex flex-col gap-1.5 max-w-sm">
                <label className="text-xs font-bold text-slate-600">返却予定日 <span className="text-red-500 ml-1">*</span></label>
                <input
                  type="date"
                  value={pickupDate}
                  min={returnMinDate || undefined}
                  max={returnMaxEffective || undefined}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {returnMinDate || "開始日未設定"} 〜 {returnMaxEffective || "終了日未設定"} の範囲で選択できます（延滞時は本日まで）。
                </p>
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                写真の追加 <span className="text-[10px] font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">任意</span>
              </h2>
              <span className="text-xs font-bold text-slate-400">{photos.length} / 5</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              返却する商品の現在の状態がわかる写真を追加してください。<br />キズ・汚れなどがある場合は特に撮影をお願いします。
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map((photoUrl, index) => (
                <div key={index} className="relative aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
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
                  className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 text-slate-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors"
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
        </div>

        {/* Right: sticky summary / action panel */}
        <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-6">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-extrabold text-slate-900 mb-4">返却内容の確認</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">返却方法</span>
                <span className="font-bold text-slate-800 text-right">{method === "direct" ? "直接持ち込み" : "回収を依頼"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">{method === "direct" ? "持込予定日" : "回収希望日"}</span>
                <span className={`font-bold text-right ${pickupDate && !isDateOutOfRange ? "text-slate-800" : "text-slate-400"}`}>{pickupDate || "未選択"}</span>
              </div>
              {method === "pickup" && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">回収希望時間</span>
                  <span className="font-bold text-slate-800 text-right">{pickupTime}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">写真</span>
                <span className="font-bold text-slate-800 text-right">{photos.length} 枚</span>
              </div>
            </div>

            {isDateOutOfRange && (
              <p className="mt-4 flex items-start gap-1.5 text-[11px] text-rose-600 leading-relaxed">
                <span className="material-symbols-outlined text-[14px] mt-px">error</span>
                返却予定日が指定可能な範囲外です。
              </p>
            )}

            <button
              onClick={handleProceed}
              className="w-full mt-5 py-3.5 rounded-xl bg-primary text-white font-bold hover:bg-blue-600 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
            >
              確認画面へ進む <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">最終確認は次の画面で行います。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
