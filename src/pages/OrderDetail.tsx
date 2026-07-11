import React, { useState, useEffect, useMemo } from "react";
import { alertDialog } from "../components/AppDialog";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useOrders } from "../context/OrderContext";
import { useUser } from "../context/UserContext";
import { isVehicleCategory, getItemUnit } from '../utils/productUtils';
import DocumentViewer from "../components/DocumentViewer";
import { calculateRentalPrice, calculateTotalPayment, parseDateLocal, getOrGenerateInvoiceBlocks, regenerateBlocksPreservingState, getTaxRate } from "../utils/billing";
import OrderBus from "../lib/orderBus";
import { formatStatusWithReturnRequest } from "../utils/returnLabels";
import { isFullyReturned, isReturnEligible } from "../utils/orderStatus";
import { computeExtension, validateExtensionDate, canExtendOrder, extensionMinDate } from "../utils/extendRental";
import { useIsDesktop } from "../hooks/useIsDesktop";
import OrderDetailDesktop from "./desktop/OrderDetailDesktop";

type CustomerPhoto = {
  src: string;
  label: string;
  note?: string;
  bg?: string;
};

function normalizeCustomerPhoto(photo: any, label: string, note?: string): CustomerPhoto | null {
  if (!photo) return null;
  if (typeof photo === "string") {
    return { src: photo, label, note };
  }
  const src = photo.dataUrl || photo.url || photo.src || photo.href || "";
  const photoLabel = photo.time || photo.label || photo.name || label;
  if (!src && !photo.bg) return null;
  return { src, label: photoLabel, note, bg: photo.bg };
}

function collectCustomerPhotos(label: string, ...values: any[]): CustomerPhoto[] {
  return values
    .flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
    .map((photo) => normalizeCustomerPhoto(photo, label))
    .filter((photo): photo is CustomerPhoto => Boolean(photo));
}

function formatConfirmedAt(value: any): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CustomerPhotoTile({ photo, alt }: { photo: CustomerPhoto; alt: string }) {
  const image = photo.src ? (
    <img src={photo.src} alt={alt} className="aspect-square w-full rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
  ) : (
    <div className="relative aspect-square w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700" style={{ background: photo.bg || "#e2e8f0" }}>
      <span className="material-symbols-outlined absolute inset-0 grid place-items-center text-white/60 text-[20px]">image</span>
    </div>
  );

  const content = (
    <div className="relative">
      {image}
      {(photo.note || photo.label) && (
        <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/55 text-white text-[9px] px-1.5 py-1 truncate">
          {photo.note || photo.label}
        </span>
      )}
    </div>
  );

  return photo.src ? (
    <a href={photo.src} target="_blank" rel="noreferrer" className="block">
      {content}
    </a>
  ) : content;
}

function CustomerPhotoGrid({ photos, alt, cols = "grid-cols-3" }: { photos: CustomerPhoto[]; alt: string; cols?: string }) {
  if (photos.length === 0) return null;
  return (
    <div className={`grid ${cols} gap-2`}>
      {photos.map((photo, index) => (
        <CustomerPhotoTile key={`${photo.label}-${index}`} photo={photo} alt={alt} />
      ))}
    </div>
  );
}

// PC とスマホでお客様サイトを分岐。
export default function OrderDetail() {
  return useIsDesktop() ? <OrderDetailDesktop /> : <OrderDetailMobile />;
}

function OrderDetailMobile() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { orders, updateOrder } = useOrders();
  const { currentUser } = useUser();
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

  const found = orders.find(o => o.id === id);

  // アクセス制御: 顧客は自分が発注した注文しか開けない（URL 直打ちで他社の注文を覗けないようにする）。
  // admin / staff は業務上すべて閲覧可。
  // 発注者(userId)が一致しない注文は拒否し、所有者を証明できない注文（userId 未設定）も
  // 非特権ユーザーには見せない（deny-by-default）。自分の注文は注文履歴から userId 一致で開ける。
  const isPrivileged = currentUser?.role === "admin" || currentUser?.role === "staff";
  // deny-by-default: 特権でなければ「ログイン済み(本人ID あり)かつ注文に発注者ID があり一致」した時だけ開ける。
  // （未ログイン + userId 未設定の注文で undefined === undefined となり素通りしていた IDOR を防ぐ）
  const order =
    found && (isPrivileged || (!!currentUser?.id && !!found.userId && found.userId === currentUser.id))
      ? found
      : undefined;

  // 延長後の合計を即時プレビュー（確定前にいくらになるか分かるように）。handleConfirmExtension と同じ計算。
  const extensionPreview = useMemo(() => {
    if (!order || !order.rentalStartDate || !order.rentalEndDate || !newEndDate) return null;
    const selectedEnd = parseDateLocal(newEndDate);
    const currentEnd = parseDateLocal(order.rentalEndDate);
    if (isNaN(selectedEnd.getTime()) || selectedEnd < currentEnd) return null;
    try {
      // 確定処理(computeExtension)と完全に同じ計算（プレビューと確定額のズレを根絶。E2:
      // 手動追加費用・入金済み印込み / E1: 手動単価の按分維持）。
      const { total } = computeExtension(order, newEndDate);
      return { newTotal: total, diff: total - (Number(order.total) || 0) };
    } catch { return null; }
  }, [newEndDate, order]);

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-slate-500">
        <p>注文が見つかりません</p>
        <button onClick={() => navigate("/orders")} className="mt-4 text-primary font-bold">戻る</button>
      </div>
    );
  }

  const blocks = getOrGenerateInvoiceBlocks(order);
  const deliveryPhotos = collectCustomerPhotos("納品写真", (order as any).deliveryPhotos);
  const collectionPhotos = collectCustomerPhotos("回収写真", (order as any).collectionPhotos);
  const warehousePhotos = collectCustomerPhotos("倉庫検品写真", (order as any).warehousePhotos);
  const issuePhotos = ((order as any).itemIssues || [])
    .map((issue: any) => normalizeCustomerPhoto(
      issue.photo,
      issue.type === "missing" ? "不足写真" : "破損写真",
      `${issue.itemName || issue.itemId || "商品"} / ${issue.type === "missing" ? "不足" : "破損"} ${issue.quantity || ""}点`
    ))
    .filter((photo: CustomerPhoto | null): photo is CustomerPhoto => Boolean(photo));
  const deliverySignature = (order as any).signature || (order as any).deliverySignature;
  const collectionSignature = (order as any).collectionSignature;
  const warehouseSignature = (order as any).warehouseSignature;
  const fieldRecordGroups = [
    { title: "納品時", photos: deliveryPhotos, signature: deliverySignature, signatureLabel: "受領サイン", alt: "納品写真" },
    { title: "回収時", photos: collectionPhotos, signature: collectionSignature, signatureLabel: "受領サイン", alt: "回収写真" },
    { title: "倉庫検品時", photos: warehousePhotos, signature: warehouseSignature, signatureLabel: "倉庫確認サイン", alt: "倉庫検品写真" }
  ].filter((group) => group.photos.length > 0 || group.signature);
  const hasFieldRecords = fieldRecordGroups.length > 0 || issuePhotos.length > 0;

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
  } else if (isFullyReturned(order.status) || order.status === "一部返却" || order.status === "完了") {
    activeStep = 4;
    statusColor = "green";
  }

  const isRentalActive =
    order.status !== "キャンセル" &&
    !isFullyReturned(order.status) &&
    order.status !== "完了";
  // 返却手続きボタンは「返却可能」ステータスのみ表示（未納品の注文を検品待ちへ送れないように）。
  const canStartReturn = isReturnEligible(order.status) || order.status === "検品待ち" || order.status === "回収中";

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
    // 返却手続き進行中(回収中/検品待ち/集荷依頼あり)は延長不可（E6: 返却中の再課金を防ぐ）。
    if (!canExtendOrder(order)) {
      setExtendingError("返却手続き中のため延長できません。");
      return;
    }
    const dateError = validateExtensionDate(order, newEndDate);
    if (dateError) {
      setExtendingError(dateError);
      return;
    }

    try {
      // 共通ロジック（プレビューと同一計算・手動単価按分・入金済み印/手動費用の引き継ぎ込み）。
      const { updatedItems, newInvoiceBlocks, subtotal, tax, total } = computeExtension(order, newEndDate);
      await updateOrder(order.id, {
        rentalEndDate: newEndDate,
        items: updatedItems,
        subtotal,
        tax,
        total,
        invoiceBlocks: newInvoiceBlocks
      });

      setIsExtending(false);
      void alertDialog("レンタル期間を延長しました。");
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
              {formatStatusWithReturnRequest(order.status, order.returnRequestType)}
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
            {(isFullyReturned(order.status) || order.status === "一部返却") && order.actualReturnDate && (
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
            {(order as any).deliveryConfirmedAt && (
              <div className="border-t border-emerald-100 dark:border-emerald-900/50 pt-3">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mb-1">納品確認時刻</p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatConfirmedAt((order as any).deliveryConfirmedAt)}</p>
              </div>
            )}
            {(order as any).collectionConfirmedAt && (
              <div className="border-t border-blue-100 dark:border-blue-900/50 pt-3">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mb-1">回収確認時刻</p>
                <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{formatConfirmedAt((order as any).collectionConfirmedAt)}</p>
              </div>
            )}
          </div>
        </section>

        {/* Order Items */}
        <section className="flex flex-col gap-3">
          <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2 px-1">
            <span className="material-symbols-outlined text-[16px]">inventory_2</span>
            注文商品一覧 ({order.items.length})
          </h3>
          
          {order.items.map((item: any, idx: number) => {
            const isRent = item.type === 'rent';
            const qty = Number(item.quantity) || 1;
            // 明細金額（行合計）。calculatedPrice は「1点あたり」なので数量を掛ける（Checkout と同じ規則）。
            // 未保存の旧注文向けに monthlyBreakdown 合計 → rentPrice×日数 の順でフォールバックする。
            let lineTotal = 0;
            if (isRent) {
              if (item.calculatedPrice != null) {
                lineTotal = Number(item.calculatedPrice) * qty;
              } else if (Array.isArray(item.monthlyBreakdown) && item.monthlyBreakdown.length) {
                lineTotal = item.monthlyBreakdown.reduce((s: number, b: any) => s + (Number(b.price) || 0), 0) * qty;
              } else {
                lineTotal = (Number(item.rentPrice) || 0) * (Number(item.rentalDays) || 1) * qty;
              }
            } else {
              lineTotal = (Number(item.buyPrice) || 0) * qty;
            }
            const guaranteeFee = Number(item.guaranteeFeeFlat) || 0;

            return (
              <OrderItem
                key={`${item.id}-${idx}`}
                name={item.name}
                quantity={item.quantity.toString()}
                returnedQuantity={item.returnedQuantity || 0}
                unit={`${getItemUnit(item)}/${isRent ? "レンタル" : "購入"}`}
                detail={isRent ? (item.actualReturnDate ? "返却額再計算済" : `${item.rentalDays || "—"}日間 (予定)`) : "購入品"}
                price={lineTotal.toLocaleString()}
                guaranteeFee={guaranteeFee}
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
              <span className="text-slate-500 dark:text-slate-400">消費税 ({order.subtotal > 0 ? Math.round((order.tax / order.subtotal) * 100) : Math.round(getTaxRate() * 100)}%)</span>
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

        {/* Field Photos */}
        {hasFieldRecords && (
          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">photo_camera</span>
              現場写真・検品写真
            </h3>
            <div className="flex flex-col gap-4">
              {fieldRecordGroups.map((group) => (
                <div key={group.title} className="border-t first:border-t-0 border-slate-100 dark:border-slate-700 first:pt-0 pt-4">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">{group.title}</p>
                  <CustomerPhotoGrid photos={group.photos} alt={group.alt} />
                  {group.signature && (
                    <div className="mt-3">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 font-bold">{group.signatureLabel}</p>
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-w-[220px] flex items-center justify-center">
                        <img src={group.signature} alt={group.signatureLabel} className="max-w-full h-auto max-h-[72px] object-contain" />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {issuePhotos.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">不足・破損写真</p>
                  <CustomerPhotoGrid photos={issuePhotos} alt="不足・破損写真" />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Customer Operations */}
        {isRentalActive && hasRentItems && (
          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">touch_app</span>
              レンタル操作
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {canExtendOrder(order) && (
              <button
                onClick={handleOpenExtension}
                className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 hover:border-primary dark:hover:border-primary transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-primary text-[24px]">more_time</span>
                <span className="text-xs font-bold">期間延長</span>
              </button>
              )}
              
              {canStartReturn && (
                <Link
                  to={`/return/${order.id}`}
                  className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 hover:border-primary dark:hover:border-primary transition-all active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-primary text-[24px]">assignment_return</span>
                  <span className="text-xs font-bold">返却手続き</span>
                </Link>
              )}
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
            {activeStep >= 3 ? (
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
            ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-400">
              <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              </div>
              <span>納品書は配送完了後に発行されます</span>
            </div>
            )}

            {/* 複数月レンタルでは月ごとの請求書（レンタル中でも各月分を表示できる） */}
            {(isFullyReturned(order.status) || order.status === "一部返却" || order.status === "完了" || (blocks && blocks.length > 0)) && (
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
                {(isFullyReturned(order.status) || order.status === "一部返却" || order.status === "完了") && (
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
                                {rp.photos.map((ph: any, pi: number) => {
                                  const photo = normalizeCustomerPhoto(ph, "検品写真");
                                  return photo ? <CustomerPhotoTile key={pi} photo={photo} alt="検品写真" /> : null;
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {/* 返却受付時にお客様が送付した状態写真（検品記録として保存） */}
                  {Array.isArray(rec.customerPhotos) && rec.customerPhotos.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-[11px] font-bold text-slate-500 mb-1.5">状態写真（{rec.customerPhotos.length}枚）</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {rec.customerPhotos.map((url: string, pi: number) => (
                          <img key={pi} src={url} alt={`状態写真 ${pi + 1}`} className="aspect-square w-full rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                        ))}
                      </div>
                    </div>
                  )}
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
                    min={extensionMinDate(order)}
                    onChange={(e) => {
                      setNewEndDate(e.target.value);
                      setExtendingError("");
                    }}
                    className="w-full bg-slate-50 border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 rounded-lg h-10 px-3 font-medium outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>

                {extensionPreview && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 dark:text-slate-400">延長後の合計</span>
                      <span className="font-bold text-primary text-base">¥{extensionPreview.newTotal.toLocaleString()}</span>
                    </div>
                    {extensionPreview.diff > 0 && (
                      <p className="text-[11px] text-slate-400 mt-0.5 text-right">現在より +¥{extensionPreview.diff.toLocaleString()}</p>
                    )}
                  </div>
                )}

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

const OrderItem: React.FC<{ name: string; quantity: string; returnedQuantity?: number; unit: string; detail: string; price: string; guaranteeFee?: number; image: string; item: any }> = ({ name, quantity, returnedQuantity, unit, detail, price, guaranteeFee = 0, image, item }) => {
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
          <div className="flex justify-between items-end gap-2">
            {guaranteeFee > 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">保証料: <span className="font-bold text-slate-700 dark:text-slate-200">¥{guaranteeFee.toLocaleString()}</span></p>
            ) : <span />}
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
