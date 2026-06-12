import React, { useState } from "react";
import { Drawer, Badge, triggerToast } from "./AdminUI";
import { getOrGenerateInvoiceBlocks, recalculateInvoiceBlock } from "../utils/billing";
import DocumentViewer from "./DocumentViewer";
import { formatStatusWithReturnRequest } from "../utils/returnLabels";

type FieldPhoto = {
  src: string;
  label: string;
  note?: string;
  bg?: string;
};

function normalizeFieldPhoto(photo: any, label: string, note?: string): FieldPhoto | null {
  if (!photo) return null;
  if (typeof photo === "string") {
    return { src: photo, label, note };
  }
  const src = photo.dataUrl || photo.url || photo.src || photo.href || "";
  const photoLabel = photo.time || photo.label || photo.name || label;
  if (!src && !photo.bg) return null;
  return { src, label: photoLabel, note, bg: photo.bg };
}

function collectFieldPhotos(label: string, ...values: any[]): FieldPhoto[] {
  return values
    .flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
    .map((photo) => normalizeFieldPhoto(photo, label))
    .filter((photo): photo is FieldPhoto => Boolean(photo));
}

function FieldPhotoGrid({ photos, alt }: { photos: FieldPhoto[]; alt: string }) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      {photos.map((photo, index) => {
        const body = photo.src ? (
          <img src={photo.src} alt={alt} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-white/70" style={{ background: photo.bg || "#e2e8f0" }}>
            <span className="material-symbols-outlined text-[24px]">image</span>
          </div>
        );
        return photo.src ? (
          <a
            key={`${photo.label}-${index}`}
            href={photo.src}
            target="_blank"
            rel="noreferrer"
            className="aspect-square bg-slate-100 rounded-md overflow-hidden relative group block"
          >
            {body}
            {(photo.label || photo.note) && (
              <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[9px] px-1.5 py-1 truncate">
                {photo.note || photo.label}
              </span>
            )}
          </a>
        ) : (
          <div key={`${photo.label}-${index}`} className="aspect-square bg-slate-100 rounded-md overflow-hidden relative">
            {body}
            {(photo.label || photo.note) && (
              <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[9px] px-1.5 py-1 truncate">
                {photo.note || photo.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function buildOrderEditDraft(order: any) {
  return {
    ...order,
    items: (order.items || []).map((item: any) => ({ ...item })),
    subtotal: Number(order.subtotal || 0),
    tax: Number(order.tax || 0),
    total: Number(order.total || 0),
    delivery: Number(order.delivery || 0),
  };
}

function editableItemAmount(item: any): number {
  const qty = Number(item.quantity || 0);
  const unit = Number(item.calculatedPrice ?? (item.type === "rent" ? item.rentPrice : item.buyPrice) ?? 0);
  return unit * qty + Number(item.guaranteeFeeFlat || 0);
}

interface AdminOrderDrawerProps {
  open: boolean;
  order: any;
  onClose: () => void;
  onUpdateStatus?: (id: string, newStatus: string, newStaffStatus?: string) => void;
  onUpdateOrder?: (id: string, updates: any) => void;
}

export default function AdminOrderDrawer({ open, order, onClose, onUpdateStatus, onUpdateOrder }: AdminOrderDrawerProps) {
  if (!order) return null;

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [costName, setCostName] = useState("追加配送費");
  const [costAmount, setCostAmount] = useState("");
  const [costTaxable, setCostTaxable] = useState(true);
  const [costNote, setCostNote] = useState("");
  const [costPhoto, setCostPhoto] = useState<string>("");

  const [viewingBlockId, setViewingBlockId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<"請求書" | "回収書" | "納品書" | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<any>(() => buildOrderEditDraft(order));

  const blocks = getOrGenerateInvoiceBlocks(order);
  const deliveryPhotos = collectFieldPhotos("納品写真", order.deliveryPhotos, order.deliveryPhoto);
  const collectionPhotos = collectFieldPhotos("回収写真", order.collectionPhotos, order.collectionPhoto);
  const warehousePhotos = collectFieldPhotos("倉庫検品写真", order.warehousePhotos, order.warehousePhoto);
  const issuePhotos = (order.itemIssues || [])
    .map((issue: any) => normalizeFieldPhoto(
      issue.photo,
      issue.type === "missing" ? "不足写真" : "破損写真",
      `${issue.itemName || issue.itemId || "商品"} / ${issue.type === "missing" ? "不足" : "破損"} ${issue.quantity || ""}点`
    ))
    .filter((photo: FieldPhoto | null): photo is FieldPhoto => Boolean(photo));
  const deliverySignature = order.signature || order.deliverySignature;
  const collectionSignature = order.collectionSignature;
  const warehouseSignature = order.warehouseSignature;
  const hasFieldRecords = Boolean(
    deliveryPhotos.length ||
    collectionPhotos.length ||
    warehousePhotos.length ||
    issuePhotos.length ||
    deliverySignature ||
    collectionSignature ||
    warehouseSignature
  );

  const handleAddCost = () => {
    if (!activeBlockId) return;
    const amount = Number(costAmount);
    if (isNaN(amount) || amount === 0) {
      triggerToast("金額を正しく入力してください", "err");
      return;
    }

    const newCost: any = {
      id: "cost-" + Date.now(),
      itemName: costName,
      amount,
      isTaxable: costTaxable,
      attachmentUrl: costPhoto || undefined,
      note: costNote || undefined
    };

    const updatedBlocks = blocks.map(b => {
      if (b.id === activeBlockId) {
        const extraCosts = [...(b.extraCosts || []), newCost];
        const updated = { ...b, extraCosts };
        return recalculateInvoiceBlock(updated);
      }
      return b;
    });

    const overallSubtotal = updatedBlocks.reduce((sum, b) => sum + b.subtotal, 0);
    const overallTax = updatedBlocks.reduce((sum, b) => sum + b.tax, 0);
    const overallTotal = updatedBlocks.reduce((sum, b) => sum + b.total, 0);

    if (onUpdateOrder) {
      onUpdateOrder(order.firestoreId || order.id, { 
        invoiceBlocks: updatedBlocks,
        subtotal: overallSubtotal,
        tax: overallTax,
        total: overallTotal
      });
      triggerToast("追加費用を登録しました", "ok");
    }
    
    // Close modal & reset form
    setActiveBlockId(null);
    setCostName("追加配送費");
    setCostAmount("");
    setCostTaxable(true);
    setCostNote("");
    setCostPhoto("");
  };

  const handleDeleteCost = (blockId: string, costId: string) => {
    const updatedBlocks = blocks.map(b => {
      if (b.id === blockId) {
        const extraCosts = (b.extraCosts || []).filter(c => c.id !== costId);
        const updated = { ...b, extraCosts };
        return recalculateInvoiceBlock(updated);
      }
      return b;
    });

    const overallSubtotal = updatedBlocks.reduce((sum, b) => sum + b.subtotal, 0);
    const overallTax = updatedBlocks.reduce((sum, b) => sum + b.tax, 0);
    const overallTotal = updatedBlocks.reduce((sum, b) => sum + b.total, 0);

    if (onUpdateOrder) {
      onUpdateOrder(order.firestoreId || order.id, {
        invoiceBlocks: updatedBlocks,
        subtotal: overallSubtotal,
        tax: overallTax,
        total: overallTotal
      });
      triggerToast("追加費用を削除しました", "ok");
    }
  };

  const openEditModal = () => {
    setEditDraft(buildOrderEditDraft(order));
    setEditOpen(true);
  };

  const setDraftValue = (key: string, value: any) => {
    setEditDraft((prev: any) => ({ ...prev, [key]: value }));
  };

  const setDraftItemValue = (index: number, key: string, value: any) => {
    setEditDraft((prev: any) => ({
      ...prev,
      items: (prev.items || []).map((item: any, i: number) => i === index ? { ...item, [key]: value } : item),
    }));
  };

  const recalcEditDraftTotals = () => {
    setEditDraft((prev: any) => {
      const subtotal = (prev.items || []).reduce((sum: number, item: any) => sum + editableItemAmount(item), 0) + Number(prev.delivery || 0);
      const tax = Math.floor(subtotal * 0.1);
      return { ...prev, subtotal, tax, total: subtotal + tax };
    });
  };

  const handleSaveEdit = () => {
    if (!onUpdateOrder || !editDraft) return;
    const normalizedItems = (editDraft.items || []).map((item: any) => ({
      ...item,
      quantity: Number(item.quantity || 0),
      rentPrice: item.rentPrice === "" || item.rentPrice === undefined ? item.rentPrice : Number(item.rentPrice),
      buyPrice: item.buyPrice === "" || item.buyPrice === undefined ? item.buyPrice : Number(item.buyPrice),
      calculatedPrice: item.calculatedPrice === "" || item.calculatedPrice === undefined ? item.calculatedPrice : Number(item.calculatedPrice),
      guaranteeFeeFlat: Number(item.guaranteeFeeFlat || 0),
    }));

    const updates: any = {
      companyName: editDraft.companyName || "",
      personName: editDraft.personName || "",
      personLastName: editDraft.personLastName || "",
      personFirstName: editDraft.personFirstName || "",
      userEmail: editDraft.userEmail || "",
      userPhone: editDraft.userPhone || "",
      siteName: editDraft.siteName || "",
      constructionNumber: editDraft.constructionNumber || "",
      deliveryLocation: editDraft.deliveryLocation || "",
      deliveryDate: editDraft.deliveryDate || "",
      rentalStartDate: editDraft.rentalStartDate || "",
      rentalEndDate: editDraft.rentalEndDate || "",
      actualReturnDate: editDraft.actualReturnDate || "",
      status: editDraft.status || order.status,
      staffStatus: editDraft.staffStatus || "",
      assignedStaff: editDraft.assignedStaff || "",
      returnRequestType: editDraft.returnRequestType || undefined,
      notes: editDraft.notes || editDraft.note || "",
      items: normalizedItems,
      delivery: Number(editDraft.delivery || 0),
      subtotal: Number(editDraft.subtotal || 0),
      tax: Number(editDraft.tax || 0),
      total: Number(editDraft.total || 0),
      invoiceBlocks: undefined,
    };

    onUpdateOrder(order.firestoreId || order.id, updates);
    triggerToast("注文情報を更新しました", "ok");
    setEditOpen(false);
  };

  return (
    <>
      <Drawer
      open={open}
      onClose={onClose}
      title="注文詳細"
      sub={order.orderNumber || order.id}
      width={600}
    >
      <div className="flex flex-col gap-6">
        
        {/* Status Header */}
        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <div className="text-xs font-bold text-slate-500 mb-1">現在の状態</div>
            <Badge tone={order.status === "処理中" ? "warning" : order.status === "完了" || order.status === "配送済み" ? "ok" : "default"}>
              {formatStatusWithReturnRequest(order.status, order.returnRequestType)}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            {onUpdateOrder && (
              <button
                onClick={openEditModal}
                className="flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-md font-bold text-sm shadow-sm border border-slate-200 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                注文情報を編集
              </button>
            )}
            {order.status === "処理中" && onUpdateStatus && (
              <button
                onClick={() => {
                  onUpdateStatus(order.firestoreId || order.id, "確認済み", "配送予定");
                  onClose();
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-bold text-sm shadow-sm transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                手配する
              </button>
            )}
          </div>
        </div>

        {/* 帳票（PDF）— この注文の納品書・回収書・請求書を表示 */}
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-3">
          <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">description</span>帳票
          </span>
          <button
            onClick={() => { setViewingBlockId(null); setViewingDoc("納品書"); }}
            className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md font-bold text-[12px] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">local_shipping</span>納品書
          </button>
          <button
            onClick={() => { setViewingBlockId(null); setViewingDoc("回収書"); }}
            className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md font-bold text-[12px] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">assignment_return</span>回収書
          </button>
          {/* 複数月レンタルは月ごとに請求書 PDF を発行（例: 6/11〜8/1 → 6月分・7月分・8月分） */}
          {blocks.map((b: any) => {
            const m = (b.monthPeriod || "").split("-");
            const label = m.length === 2 ? `請求書 ${Number(m[1])}月分` : "請求書";
            return (
              <button
                key={b.id}
                onClick={() => { setViewingBlockId(b.id); setViewingDoc("請求書"); }}
                className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-md font-bold text-[12px] flex items-center gap-1 transition-colors cursor-pointer"
                title={`${b.startDate} 〜 ${b.endDate}`}
              >
                <span className="material-symbols-outlined text-[14px]">receipt_long</span>{label}
              </button>
            );
          })}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">person</span>
              顧客情報
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-500 block text-[10px]">企業名</span>
                <span className="font-bold text-slate-800">{order.companyName || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">担当者</span>
                <span className="font-bold text-slate-800">{order.personName || "—"}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">location_on</span>
              現場情報
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-500 block text-[10px]">現場名</span>
                <span className="font-bold text-slate-800">{order.siteName || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">工事番号</span>
                <span className="font-bold text-slate-800">{order.constructionNumber || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">納品先住所</span>
                <span className="font-bold text-slate-800">{order.deliveryLocation || "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            期間・スケジュール
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-500 block text-[10px]">納品希望日</span>
              <span className="font-bold text-slate-800">{order.deliveryDate || "—"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">レンタル開始日</span>
              <span className="font-bold text-slate-800">{order.rentalStartDate ? order.rentalStartDate.replace(/-/g, "/") : "—"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">レンタル終了予定</span>
              <span className="font-bold text-slate-800">{order.rentalEndDate ? order.rentalEndDate.replace(/-/g, "/") : "—"}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <h3 className="text-xs font-bold text-slate-400 p-4 border-b border-slate-100 flex items-center gap-1 bg-slate-50/50">
            <span className="material-symbols-outlined text-[14px]">inventory_2</span>
            注文内容 ({order.items?.length || 0}点)
          </h3>
          <div className="divide-y divide-slate-100">
            {order.items?.map((item: any, idx: number) => {
              const price = item.calculatedPrice ?? item.buyPrice ?? 0;
              return (
                <div key={idx} className="p-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                  <div className="w-12 h-12 bg-slate-100 rounded-md overflow-hidden flex-shrink-0">
                    {item.image && <img src={item.image} alt={item.name} className="w-full h-full object-contain" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm truncate">{item.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {item.type === 'rent' ? "レンタル" : "購入"} × {item.quantity}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-800">¥{(price * item.quantity).toLocaleString()}</div>
                    {item.guaranteeFeeFlat > 0 && (
                      <div className="text-[10px] text-slate-400 mt-0.5">※初回保証料含む</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="bg-slate-50 p-4 border-t border-slate-200 text-sm flex flex-col gap-2">
            <div className="flex justify-between text-slate-600">
              <span>小計</span>
              <span>¥{order.subtotal?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>消費税</span>
              <span>¥{order.tax?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between font-bold text-lg text-slate-900 border-t border-slate-200 pt-2 mt-1">
              <span>合計</span>
              <span className="text-blue-700">¥{order.total?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>

        {/* Monthly Invoice Blocks */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <h3 className="text-xs font-bold text-slate-400 p-4 border-b border-slate-100 flex items-center gap-1 bg-slate-50/50">
            <span className="material-symbols-outlined text-[14px]">receipt_long</span>
            月別請求内訳 ({blocks.length}期)
          </h3>
          <div className="divide-y divide-slate-100">
            {blocks.map((block) => {
              const statusLabels: Record<string, string> = {
                accumulating: "累積中",
                pending: "請求待ち",
                paid: "支払済み"
              };
              const statusTones: Record<string, "default" | "warning" | "ok" | "danger"> = {
                accumulating: "default",
                pending: "warning",
                paid: "ok"
              };

              return (
                <div key={block.id} className="p-4 flex flex-col gap-3 hover:bg-slate-50/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-extrabold text-slate-800 text-sm">{block.monthPeriod}分</span>
                      <span className="text-[10px] text-slate-400 ml-2">({block.startDate} 〜 {block.endDate})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTones[block.status] || "default"}>
                        {statusLabels[block.status] || block.status}
                      </Badge>
                      <button
                        onClick={() => {
                          setViewingBlockId(block.id);
                          setViewingDoc("請求書");
                        }}
                        className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[12px]">receipt_long</span>
                        請求書表示
                      </button>
                      {onUpdateOrder && (
                        <button
                          onClick={() => setActiveBlockId(block.id)}
                          className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[12px]">add</span>
                          追加費用入力
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 border-b border-slate-100 pb-2.5">
                    <div>
                      <span className="block text-[10px] text-slate-400">実日数 / 請求日数</span>
                      <span className="font-bold text-slate-700">{block.actualDays}日 / {block.chargeableDays}日</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">適用単価</span>
                      <span className="font-bold text-slate-700">
                        {block.tierApplied === 'Price_B' ? '長期割引 (Price B)' : '通常単価 (Price A)'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">保証料合計</span>
                      <span className="font-bold text-slate-700">¥{block.guaranteeFee.toLocaleString()}</span>
                    </div>
                  </div>

                   {/* Extra Costs List */}
                  {block.extraCosts && block.extraCosts.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-2.5 space-y-2 text-xs">
                      <div className="font-bold text-slate-500 text-[10px] border-b border-slate-200 pb-1">追加費用明細</div>
                      {block.extraCosts.map((cost) => (
                        <div key={cost.id} className="flex justify-between items-start border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-700">{cost.itemName}</span>
                              {onUpdateOrder && (
                                <button
                                  onClick={() => handleDeleteCost(block.id, cost.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors flex items-center justify-center p-0.5 hover:bg-red-50 rounded cursor-pointer"
                                  title="削除"
                                >
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                              )}
                            </div>
                            {cost.note && <span className="text-[10px] text-slate-400 block">{cost.note}</span>}
                            {cost.attachmentUrl && (
                              <a href={cost.attachmentUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 font-bold hover:underline flex items-center gap-0.5 mt-0.5">
                                <span className="material-symbols-outlined text-[11px]">image</span>
                                添付写真を表示
                              </a>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 font-mono">
                            <span className={`font-bold ${cost.amount < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                              {cost.amount >= 0 ? '+' : ''}¥{cost.amount.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-slate-400 block">{cost.isTaxable ? '課税' : '非課税'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Block Totals */}
                  <div className="flex justify-end gap-4 text-xs font-bold text-slate-600 mt-0.5">
                    <span>小計: <span className="text-slate-800">¥{block.subtotal.toLocaleString()}</span></span>
                    <span>消費税: <span className="text-slate-800">¥{block.tax.toLocaleString()}</span></span>
                    <span className="text-sm">合計: <span className="text-blue-700 font-extrabold">¥{block.total.toLocaleString()}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Field Records */}
        {hasFieldRecords && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">photo_camera</span>
              現場記録
            </h3>
            
            {(deliveryPhotos.length > 0 || deliverySignature) && (
              <div className="mb-4">
                <h4 className="text-[11px] font-bold text-slate-500 mb-2 border-b border-slate-100 pb-1">納品時</h4>
                <FieldPhotoGrid photos={deliveryPhotos} alt="納品写真" />
                {deliverySignature && (
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">受領サイン</div>
                    <div className="bg-white border border-slate-200 rounded-md p-2 max-w-[250px] flex items-center justify-center">
                      <img src={deliverySignature} alt="受領サイン" className="max-w-full h-auto max-h-[80px] object-contain" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {(collectionPhotos.length > 0 || collectionSignature) && (
              <div className="mt-4">
                <h4 className="text-[11px] font-bold text-slate-500 mb-2 border-b border-slate-100 pb-1">回収時</h4>
                <FieldPhotoGrid photos={collectionPhotos} alt="回収写真" />
                {collectionSignature && (
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">受領サイン</div>
                    <div className="bg-white border border-slate-200 rounded-md p-2 max-w-[250px] flex items-center justify-center">
                      <img src={collectionSignature} alt="受領サイン" className="max-w-full h-auto max-h-[80px] object-contain" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {(warehousePhotos.length > 0 || warehouseSignature) && (
              <div className="mt-4">
                <h4 className="text-[11px] font-bold text-slate-500 mb-2 border-b border-slate-100 pb-1">倉庫検品時</h4>
                <FieldPhotoGrid photos={warehousePhotos} alt="倉庫検品写真" />
                {warehouseSignature && (
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">倉庫確認サイン</div>
                    <div className="bg-white border border-slate-200 rounded-md p-2 max-w-[250px] flex items-center justify-center">
                      <img src={warehouseSignature} alt="倉庫確認サイン" className="max-w-full h-auto max-h-[80px] object-contain" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {issuePhotos.length > 0 && (
              <div className="mt-4">
                <h4 className="text-[11px] font-bold text-slate-500 mb-2 border-b border-slate-100 pb-1">不足・破損写真</h4>
                <FieldPhotoGrid photos={issuePhotos} alt="不足・破損写真" />
              </div>
            )}
          </div>
        )}

      </div>

      {/* Extra Cost Modal */}
      {activeBlockId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">追加費用の入力</h3>
              <button 
                onClick={() => setActiveBlockId(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">費用項目</label>
                <select
                  value={costName}
                  onChange={(e) => setCostName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500"
                >
                  <option value="追加配送費">追加配送費</option>
                  <option value="清掃・クリーニング費">清掃・クリーニング費</option>
                  <option value="破損・紛失補償金">破損・紛失補償金</option>
                  <option value="値引き・調整">値引き・調整</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">金額 (¥)</label>
                <input
                  type="number"
                  placeholder="例: 5000 (値引きは -5000)"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="costTaxable"
                  checked={costTaxable}
                  onChange={(e) => setCostTaxable(e.target.checked)}
                  className="w-4 h-4 text-blue-600"
                />
                <label htmlFor="costTaxable" className="text-xs font-bold text-slate-600 cursor-pointer">
                  消費税10%を適用する (課税対象)
                </label>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">添付写真 (任意)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCostPhoto(URL.createObjectURL(file));
                    }
                  }}
                  className="w-full text-xs text-slate-500 border border-slate-200 rounded-lg p-2 bg-slate-50 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">メモ (理由・特記事項)</label>
                <textarea
                  rows={2}
                  placeholder="例: 配達ルート変更のため実費追加"
                  value={costNote}
                  onChange={(e) => setCostNote(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setActiveBlockId(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddCost}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
              >
                費用を追加
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && editDraft && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden animate-scaleIn flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800">注文情報を編集</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{order.orderNumber || order.id}</p>
              </div>
              <button
                onClick={() => setEditOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-500 mb-3">顧客情報</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="col-span-2">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">会社名</span>
                      <input value={editDraft.companyName || ""} onChange={(e) => setDraftValue("companyName", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label className="col-span-2">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">担当者名</span>
                      <input value={editDraft.personName || ""} onChange={(e) => setDraftValue("personName", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">姓</span>
                      <input value={editDraft.personLastName || ""} onChange={(e) => setDraftValue("personLastName", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">名</span>
                      <input value={editDraft.personFirstName || ""} onChange={(e) => setDraftValue("personFirstName", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">メール</span>
                      <input value={editDraft.userEmail || ""} onChange={(e) => setDraftValue("userEmail", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">電話番号</span>
                      <input value={editDraft.userPhone || ""} onChange={(e) => setDraftValue("userPhone", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-500 mb-3">現場・日程</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">現場名</span>
                      <input value={editDraft.siteName || ""} onChange={(e) => setDraftValue("siteName", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">工事番号</span>
                      <input value={editDraft.constructionNumber || ""} onChange={(e) => setDraftValue("constructionNumber", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label className="col-span-2">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">納品先住所</span>
                      <input value={editDraft.deliveryLocation || ""} onChange={(e) => setDraftValue("deliveryLocation", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">納品希望日</span>
                      <input type="date" value={editDraft.deliveryDate || ""} onChange={(e) => setDraftValue("deliveryDate", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">実際の返却日</span>
                      <input type="date" value={editDraft.actualReturnDate || ""} onChange={(e) => setDraftValue("actualReturnDate", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">レンタル開始日</span>
                      <input type="date" value={editDraft.rentalStartDate || ""} onChange={(e) => setDraftValue("rentalStartDate", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">レンタル終了予定日</span>
                      <input type="date" value={editDraft.rentalEndDate || ""} onChange={(e) => setDraftValue("rentalEndDate", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-500 mb-3">ステータス</h4>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">注文ステータス</span>
                      <select value={editDraft.status || ""} onChange={(e) => setDraftValue("status", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 bg-white outline-none focus:border-blue-500">
                        {["処理中", "確認済み", "準備中", "配送中", "配送済み", "レンタル中", "回収予定", "回収中", "検品待ち", "一部返却", "返却済", "返却済み", "完了", "キャンセル"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">スタッフステータス</span>
                      <input value={editDraft.staffStatus || ""} onChange={(e) => setDraftValue("staffStatus", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">返却区分</span>
                      <select value={editDraft.returnRequestType || ""} onChange={(e) => setDraftValue("returnRequestType", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 bg-white outline-none focus:border-blue-500">
                        <option value="">未設定</option>
                        <option value="full">一括返却</option>
                        <option value="partial">一部返却</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-500">金額</h4>
                    <button onClick={recalcEditDraftTotals} className="text-[11px] font-bold text-blue-600 hover:text-blue-700">金額を再計算</button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">配送費</span>
                      <input type="number" value={editDraft.delivery || 0} onChange={(e) => setDraftValue("delivery", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 font-mono outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">小計</span>
                      <input type="number" value={editDraft.subtotal || 0} onChange={(e) => setDraftValue("subtotal", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 font-mono outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">消費税</span>
                      <input type="number" value={editDraft.tax || 0} onChange={(e) => setDraftValue("tax", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 font-mono outline-none focus:border-blue-500" />
                    </label>
                    <label>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">合計</span>
                      <input type="number" value={editDraft.total || 0} onChange={(e) => setDraftValue("total", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 font-mono outline-none focus:border-blue-500" />
                    </label>
                  </div>
                  <label className="block mt-3">
                    <span className="text-[11px] font-bold text-slate-500 block mb-1">備考</span>
                    <textarea rows={2} value={editDraft.notes || editDraft.note || ""} onChange={(e) => setDraftValue("notes", e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500" />
                  </label>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500">注文商品</h4>
                  <button
                    onClick={() => setDraftValue("items", [...(editDraft.items || []), { id: `custom-${Date.now()}`, name: "", type: "rent", quantity: 1, calculatedPrice: 0 }])}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
                  >
                    商品行を追加
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white text-slate-400">
                      <tr className="border-b border-slate-100">
                        <th className="p-2 text-left">商品名</th>
                        <th className="p-2 text-left">区分</th>
                        <th className="p-2 text-right">数量</th>
                        <th className="p-2 text-right">単価</th>
                        <th className="p-2 text-right">保証料</th>
                        <th className="p-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(editDraft.items || []).map((item: any, idx: number) => (
                        <tr key={`${item.id || idx}-${idx}`}>
                          <td className="p-2 min-w-[220px]">
                            <input value={item.name || ""} onChange={(e) => setDraftItemValue(idx, "name", e.target.value)} className="w-full border border-slate-200 rounded p-1.5 outline-none focus:border-blue-500" />
                          </td>
                          <td className="p-2">
                            <select value={item.type || "rent"} onChange={(e) => setDraftItemValue(idx, "type", e.target.value)} className="border border-slate-200 rounded p-1.5 bg-white outline-none focus:border-blue-500">
                              <option value="rent">レンタル</option>
                              <option value="buy">購入</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input type="number" value={item.quantity || 0} onChange={(e) => setDraftItemValue(idx, "quantity", e.target.value)} className="w-20 border border-slate-200 rounded p-1.5 text-right font-mono outline-none focus:border-blue-500" />
                          </td>
                          <td className="p-2">
                            <input type="number" value={item.calculatedPrice ?? (item.type === "rent" ? item.rentPrice : item.buyPrice) ?? 0} onChange={(e) => setDraftItemValue(idx, "calculatedPrice", e.target.value)} className="w-28 border border-slate-200 rounded p-1.5 text-right font-mono outline-none focus:border-blue-500" />
                          </td>
                          <td className="p-2">
                            <input type="number" value={item.guaranteeFeeFlat || 0} onChange={(e) => setDraftItemValue(idx, "guaranteeFeeFlat", e.target.value)} className="w-24 border border-slate-200 rounded p-1.5 text-right font-mono outline-none focus:border-blue-500" />
                          </td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => setDraftValue("items", (editDraft.items || []).filter((_: any, i: number) => i !== idx))}
                              className="text-red-500 hover:text-red-700 font-bold"
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </Drawer>

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
    </>
  );
}
