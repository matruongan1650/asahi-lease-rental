import React, { useState } from "react";
import { Drawer, Badge, triggerToast } from "./AdminUI";
import { getOrGenerateInvoiceBlocks, recalculateInvoiceBlock } from "../utils/billing";
import DocumentViewer from "./DocumentViewer";

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

  const blocks = getOrGenerateInvoiceBlocks(order);

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
              {order.status}
            </Badge>
          </div>
          
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
        {(order.deliveryPhotos || order.signature || order.collectionPhotos || order.collectionSignature) && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">photo_camera</span>
              現場記録
            </h3>
            
            {(order.deliveryPhotos?.length > 0 || order.signature) && (
              <div className="mb-4">
                <h4 className="text-[11px] font-bold text-slate-500 mb-2 border-b border-slate-100 pb-1">納品時</h4>
                {order.deliveryPhotos && order.deliveryPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {order.deliveryPhotos.map((p: any, i: number) => (
                      <div key={i} className="aspect-square bg-slate-100 rounded-md overflow-hidden relative">
                         <img src={p.url || p} alt="納品写真" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                {order.signature && (
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">受領サイン</div>
                    <div className="bg-white border border-slate-200 rounded-md p-2 max-w-[250px] flex items-center justify-center">
                      <img src={order.signature} alt="受領サイン" className="max-w-full h-auto max-h-[80px] object-contain" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {(order.collectionPhotos?.length > 0 || order.collectionSignature) && (
              <div className="mt-4">
                <h4 className="text-[11px] font-bold text-slate-500 mb-2 border-b border-slate-100 pb-1">回収時</h4>
                {order.collectionPhotos && order.collectionPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {order.collectionPhotos.map((p: any, i: number) => (
                      <div key={i} className="aspect-square bg-slate-100 rounded-md overflow-hidden relative">
                         <img src={p.url || p} alt="回収写真" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                {order.collectionSignature && (
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">受領サイン</div>
                    <div className="bg-white border border-slate-200 rounded-md p-2 max-w-[250px] flex items-center justify-center">
                      <img src={order.collectionSignature} alt="受領サイン" className="max-w-full h-auto max-h-[80px] object-contain" />
                    </div>
                  </div>
                )}
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
