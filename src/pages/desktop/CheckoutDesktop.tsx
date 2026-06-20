import { Link, useNavigate } from "react-router-dom";
import { alertDialog } from "../../components/AppDialog";
import { useCart } from "../../context/CartContext";
import { useOrders } from "../../context/OrderContext";
import { useUser } from "../../context/UserContext";
import { useProducts } from "../../context/ProductContext";
import { useState, useRef } from "react";
import { calculateRentalPrice, getTaxRate } from "../../utils/billing";
import { elementToPdf } from "../../utils/pdfMultiPage"; // A4フィット + 複数ページ分割 + モバイル共有フォールバック
import { isVehicleCategory } from "../../utils/productUtils";
import { isBusinessDay, nextBusinessDay, nonBusinessDayReason } from "../../utils/jpHolidays";
import React, { useEffect } from "react";

// PC 用 チェックアウト（お客様デスクトップサイト）。
// 料金計算・営業日バリデーション・見積書PDF・注文確定の処理はモバイル版と完全に同一。レイアウトのみ2カラム化。
function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CheckoutDesktop() {
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
    return nextBusinessDay(toDateInputValue(min));
  })();
  const earliestRentalStartDate = earliestDeliveryDate;

  // 数量0の品目は注文・表示から除外（カートで数量欄を空(0)のまま blur せず進んだ場合のガード）。
  const updatedItems = items.filter((item) => Number(item.quantity) >= 1).map((item) => ({ ...item }));

  let totalRentalPrice = 0;
  let totalBuyPrice = 0;
  let totalGuaranteeFee = 0;

  const hasVehicle = updatedItems.some((i) => isVehicleCategory(i.category) && i.type === "rent");

  updatedItems.forEach((item) => {
    const fullProduct = products.find((p) => p && p.id === item.id);
    let guaranteeFeeFlat = 0;

    if (item.type === "rent" && fullProduct?.isGuarantee) {
      const qty = item.quantity;
      if (fullProduct.guaranteeType === "flat") {
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

    item.guaranteeFeeFlat = guaranteeFeeFlat;

    if (item.type === "rent" && item.rentPrice) {
      const { totalPrice: itemTotal, breakdown, totalBilledDays, totalActualDays } = calculateRentalPrice(
        item.rentPrice,
        rentalStartDate,
        rentalEndDate,
        hasVehicle,
        isVehicleCategory(item.category),
        item.rentPriceLongTerm
      );

      item.monthlyBreakdown = breakdown;
      item.calculatedPrice = itemTotal;
      item.rentalDays = totalActualDays;
      item.billedDays = totalBilledDays;
      totalRentalPrice += itemTotal * item.quantity;
      totalGuaranteeFee += guaranteeFeeFlat;
    } else if (item.type === "buy" && item.buyPrice) {
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
      isBusinessDay(rentalStartDate) &&
      isBusinessDay(rentalEndDate) &&
      isBusinessDay(deliveryDate)
  );
  // 実際に発注される updatedItems（数量1以上）で判定する（数量0の行のみの ¥0 注文作成を防ぐ）。
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
      // A4 にフィットさせ、明細が多い場合は自動で複数ページに分割する（1ページ目で切れてデータが
      // 欠落しない）。モバイルは共有シート、PC はダウンロードへフォールバック。
      const filename = `御見積書_${companyName || personLastName || "ゲスト"}.pdf`;
      await elementToPdf(estimateRef.current, filename);
    } catch (err) {
      console.error("PDF generation failed", err);
      void alertDialog("見積書の作成に失敗しました。");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleConfirm = () => {
    if (!isDateRangeValid) {
      void alertDialog("日付を確認してください。14:00以降は本日のレンタル開始を選択できません。レンタル終了予定日はレンタル開始日以降を選択してください。");
      return;
    }
    setProfile({ ...profile, companyName, firstName: personFirstName, lastName: personLastName, address: deliveryLocation });
    navigate("/checkout-confirm", {
      state: {
        orderData: {
          items: updatedItems,
          total,
          subtotal,
          tax,
          deliveryLocation,
          deliveryDate,
          siteName,
          constructionNumber,
          companyName,
          personName: `${personLastName} ${personFirstName}`.trim(),
          personLastName,
          personFirstName,
          rentalStartDate,
          rentalEndDate,
          notes,
          userId: profile.id,
          userEmail: profile.email,
          userPhone: profile.phone,
        },
      },
    });
  };

  const lockedInput = "w-full rounded-lg border border-slate-200 bg-slate-100 text-slate-500 px-4 py-3 text-base outline-none cursor-not-allowed";
  const input = "w-full rounded-lg border border-slate-200 bg-white text-slate-900 px-4 py-3 text-base placeholder:text-slate-400 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";
  const dateInput = "w-full min-w-0 rounded-xl border-2 border-slate-200 bg-white text-slate-900 px-3 py-3 text-base outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-slate-300 shadow-sm transition-all font-medium";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">ホーム</Link> <span className="mx-1">/</span>
        <Link to="/cart" className="hover:text-primary">カート</Link> <span className="mx-1">/</span>
        <span className="text-slate-600">チェックアウト</span>
      </nav>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-6">チェックアウト</h1>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Left: form */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">person</span>お客様情報
            </h2>
            <div className="space-y-5">
              <label className="block">
                <p className="text-sm font-bold text-slate-700 pb-2">会社名 <span className="text-xs font-medium text-slate-400">（登録情報・変更不可）</span></p>
                <input value={companyName} readOnly aria-readonly="true" title="登録済みの会社名です。変更はできません。" className={lockedInput} type="text" />
              </label>
              <div>
                <p className="text-sm font-bold text-slate-700 pb-2">担当者名 <span className="text-xs font-medium text-slate-400">（登録情報・変更不可）</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <input value={personLastName} readOnly aria-readonly="true" placeholder="姓" className={lockedInput} type="text" />
                  <input value={personFirstName} readOnly aria-readonly="true" placeholder="名" className={lockedInput} type="text" />
                </div>
              </div>

              <div className="border-t border-dashed border-slate-200 my-1" />

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <p className="text-sm font-bold text-slate-700 pb-2">現場名 <span className="text-red-500 text-xs ml-1">必須</span></p>
                  <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className={input} placeholder="例：〇〇〇市、〇〇〇建設" type="text" />
                </label>
                <label className="block">
                  <p className="text-sm font-bold text-slate-700 pb-2">工事番号 <span className="text-red-500 text-xs ml-1">必須</span></p>
                  <input value={constructionNumber} onChange={(e) => setConstructionNumber(e.target.value)} className={input} placeholder="例：KJ-2023-001" type="text" />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[13px] font-bold text-slate-700 pb-2 whitespace-nowrap">レンタル開始日 <span className="text-red-500 text-[11px] ml-1">必須</span></p>
                  <input
                    type="date"
                    value={rentalStartDate || ""}
                    min={earliestRentalStartDate}
                    onChange={(e) => pickBusinessDate(e.target.value, (v) => {
                      setRentalStartDate(v);
                      if (deliveryDate && v && deliveryDate > v) setDeliveryDate(v);
                      if (rentalEndDate && v && rentalEndDate < v) setRentalEndDate(v);
                    })}
                    className={dateInput}
                  />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-700 pb-2 whitespace-nowrap">レンタル終了予定日 <span className="text-red-500 text-[11px] ml-1">必須</span></p>
                  <input type="date" value={rentalEndDate || ""} min={rentalStartDate || undefined} onChange={(e) => pickBusinessDate(e.target.value, setRentalEndDate)} className={dateInput} />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-700 pb-2 whitespace-nowrap">納品希望日 <span className="text-red-500 text-[11px] ml-1">必須</span></p>
                  <input type="date" value={deliveryDate || ""} min={earliestDeliveryDate} max={rentalStartDate || undefined} onChange={(e) => pickBusinessDate(e.target.value, setDeliveryDate)} className={dateInput} />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 -mt-2">14:00前のご注文は本日納品を選択できます。14:00以降は翌日以降を選択してください。※ 土曜・日曜・祝日は選択できません（営業日のみ）。</p>
              {dateError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-2">{dateError}</div>}

              <label className="block">
                <div className="flex items-center pb-2"><p className="text-sm font-bold text-slate-700">納品場所</p><span className="text-red-500 text-xs ml-auto">必須</span></div>
                <input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} className={input} placeholder="例：東京都〇〇市〇〇1-2-3" type="text" />
              </label>
              <label className="block">
                <p className="text-sm font-bold text-slate-700 pb-2">備考</p>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${input} min-h-[120px] resize-y`} />
              </label>
            </div>
          </section>
        </div>

        {/* Right: summary + actions */}
        <aside className="w-full lg:w-96 shrink-0 lg:sticky lg:top-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-end mb-4 border-b border-dashed border-slate-200 pb-4">
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">合計金額 (税込)</p>
                  <p className="text-slate-900 text-3xl font-extrabold tracking-tight">¥{total.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 text-xs font-medium mb-1">商品点数</p>
                  <p className="text-slate-900 text-base font-bold">{totalItems}点</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto pr-1">
                {updatedItems.map((item) => {
                  const isRent = item.type === "rent";
                  const price = item.calculatedPrice ?? item.buyPrice ?? 0;
                  return (
                    <div key={`${item.id}-${item.type}`} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 shrink-0 rounded bg-white flex items-center justify-center overflow-hidden border border-slate-200">
                          <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-800 text-sm font-bold truncate">{item.name}</p>
                          <p className="text-slate-500 text-xs mt-0.5">
                            {isRent ? `レンタル: 実日数 ${item.rentalDays}日間` + (item.billedDays && item.billedDays > item.rentalDays ? ` (最低保証適用: ${item.billedDays}日請求)` : "") : "購入"}
                          </p>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <p className="text-slate-800 text-sm font-bold">x{item.quantity}</p>
                          <p className="text-primary text-sm font-bold mt-0.5">¥{(price * item.quantity).toLocaleString()}</p>
                        </div>
                      </div>
                      {item.guaranteeFeeFlat !== undefined && item.guaranteeFeeFlat > 0 && (
                        <div className="mt-1 pt-2 border-t border-dashed border-slate-200 bg-amber-50 -mx-3 -mb-3 p-3 rounded-b-lg">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-amber-700 font-medium">初回準備・保証料</span>
                            <span className="font-bold text-amber-700">¥{item.guaranteeFeeFlat.toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                      {isRent && item.monthlyBreakdown && item.monthlyBreakdown.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-dashed border-slate-200">
                          <div className="flex flex-col gap-1">
                            {item.monthlyBreakdown.map((b: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">
                                  {`${b.monthStr}分 (${b.days}日間)`}
                                  {b.discounted && <span className="ml-1 text-[#f59e0b] bg-[#f59e0b]/10 px-1 py-0.5 rounded text-[9px]">長期</span>}
                                </span>
                                <span className="text-slate-700">¥{(b.price * item.quantity).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && <p className="text-slate-500 text-sm py-2">カートに商品がありません。</p>}
              </div>
            </div>
            <div className="border-t border-slate-100 p-5 space-y-3">
              <button onClick={handleDownloadEstimate} className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-primary px-4 py-3 text-primary font-bold bg-white hover:bg-primary/5 transition-colors">
                <span className="material-symbols-outlined text-[20px]">request_quote</span>見積書を発行
              </button>
              <button
                disabled={!isFormValid}
                onClick={handleConfirm}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">check_circle</span>注文を確定する
              </button>
              {!isFormValid && <p className="text-[11px] text-slate-400 text-center">必須項目（現場名・工事番号・各日付・納品場所）をすべて入力してください。</p>}
            </div>
          </div>
        </aside>
      </div>

      {isGeneratingPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl flex flex-col items-center gap-3 shadow-xl">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            <p className="text-sm font-bold text-slate-800">見積書を作成中...</p>
          </div>
        </div>
      )}

      {/* Hidden PDF Template — モバイル版と同一 */}
      <div style={{ position: "absolute", top: -9999, left: -9999, pointerEvents: "none" }}>
        <div ref={estimateRef} className="w-[794px] min-h-[1123px] p-12 mx-auto font-sans relative overflow-hidden" style={{ backgroundColor: "#ffffff", color: "#0f172a" }}>
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
                <p className="mb-4 font-medium">発行日: {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })}</p>
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
                  const isRent = item.type === "rent";
                  const price = item.calculatedPrice ?? item.buyPrice ?? 0;
                  const rows = [
                    <tr key={`${item.id}-${index}-main`}>
                      <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8" }}>{index + 1}</td>
                      <td className="border p-2.5 font-medium" style={{ borderColor: "#94a3b8" }}>
                        {item.name}
                        <div className="text-[10px] mt-1" style={{ color: "#64748b" }}>
                          {isRent ? `実日数 ${item.rentalDays}日間` + (item.billedDays && item.billedDays > item.rentalDays ? ` (最低保証適用: 請求 ${item.billedDays}日間)` : "") : "販売品"}
                        </div>
                      </td>
                      <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8" }}>{item.quantity}</td>
                      <td className="border p-2.5 text-right" style={{ borderColor: "#94a3b8" }}>¥{price.toLocaleString()}</td>
                      <td className="border p-2.5 text-right font-medium" style={{ borderColor: "#94a3b8" }}>¥{(price * item.quantity).toLocaleString()}</td>
                    </tr>,
                  ];

                  if (item.guaranteeFeeFlat && item.guaranteeFeeFlat > 0) {
                    rows.push(
                      <tr key={`${item.id}-${index}-fee`}>
                        <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8" }}></td>
                        <td className="border p-2.5 font-medium" style={{ borderColor: "#94a3b8", paddingLeft: "1.5rem" }}>↳ 【初回設定追加】 保証・準備費用</td>
                        <td className="border p-2.5 text-center" style={{ borderColor: "#94a3b8" }}>1式</td>
                        <td className="border p-2.5 text-right" style={{ borderColor: "#94a3b8" }}>¥{item.guaranteeFeeFlat.toLocaleString()}</td>
                        <td className="border p-2.5 text-right font-medium" style={{ borderColor: "#94a3b8" }}>¥{item.guaranteeFeeFlat.toLocaleString()}</td>
                      </tr>
                    );
                  }
                  return rows;
                })}
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
    </div>
  );
}
