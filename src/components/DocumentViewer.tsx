import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { isVehicleCategory } from "../utils/productUtils";
import { calculateMonthlyInvoice } from "../utils/billing";

interface DocumentViewerProps {
  order: any;
  type: "納品書" | "請求書" | "回収書";
  blockId?: string;
  onClose: () => void;
}

export default function DocumentViewer({ order, type, blockId, onClose }: DocumentViewerProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPdf = async () => {
    if (!documentRef.current) return;
    setIsGenerating(true);
    try {
      const element = documentRef.current;

      // 重要: 署名などの data-URL 画像が完全にデコードされてから html2canvas に渡す。
      // そうしないと clone 時に画像が未デコードのまま空白でキャプチャされ、PDF に署名が出ない。
      const imgs = Array.from(element.querySelectorAll("img"));
      await Promise.all(
        imgs.map(async (img) => {
          try {
            if (typeof (img as HTMLImageElement).decode === "function") {
              await (img as HTMLImageElement).decode();
            } else if (!(img.complete && img.naturalWidth > 0)) {
              await new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              });
            }
          } catch {
            /* デコード失敗（無効な画像など）は無視して続行 */
          }
        })
      );

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${type}_${order.orderNumber}.pdf`);
    } catch (err) {
      console.error("PDF生成エラー:", err);
      alert("PDFの生成中にエラーが発生しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/');

  function getInvoiceIssueDate(order: any): string {
    let dateToUse = new Date();
    
    if (order.actualReturnDate) {
      dateToUse = new Date(order.actualReturnDate.replace(/\//g, "-"));
    } else if (order.rentalEndDate) {
      dateToUse = new Date(order.rentalEndDate.replace(/\//g, "-"));
    } else if (order.date) {
      const cleanDateStr = order.date.split("•")[0]?.trim() || "";
      if (cleanDateStr) {
        dateToUse = new Date(cleanDateStr.replace(/\//g, "-"));
      }
    }

    if (isNaN(dateToUse.getTime())) {
      dateToUse = new Date();
    }

    const lastDay = new Date(dateToUse.getFullYear(), dateToUse.getMonth() + 1, 0);
    const yyyy = lastDay.getFullYear();
    const mm = String(lastDay.getMonth() + 1).padStart(2, "0");
    const dd = String(lastDay.getDate()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd}`;
  }

  const block = blockId ? order.invoiceBlocks?.find((b: any) => b.id === blockId) : null;

  // Totals to display
  const subtotal = block ? block.subtotal : order.subtotal;
  const tax = block ? block.tax : order.tax;
  const total = block ? block.total : order.total;

  // Issue date
  const issueDate = type === "請求書"
    ? (block ? block.endDate : getInvoiceIssueDate(order))
    : today;

  let itemsToRender: any[] = [];
  if (block) {
    const monthlyData = calculateMonthlyInvoice(order, block.monthPeriod);
    itemsToRender = monthlyData.items.map((item: any) => ({
      name: item.name,
      type: item.type,
      quantity: item.quantity,
      rentalDays: item.days,
      price: item.type === 'rent' ? item.price : item.buyPrice,
      calculatedPrice: item.type === 'rent' ? item.rentalFee : item.total,
      guaranteeFeeFlat: item.guaranteeFee
    }));
    if (block.extraCosts) {
      block.extraCosts.forEach((cost: any) => {
        itemsToRender.push({
          name: cost.itemName,
          isExtraCost: true,
          quantity: 1,
          price: cost.amount,
          calculatedPrice: cost.amount,
          note: cost.note
        });
      });
    }
  } else {
    itemsToRender = order.items.map((item: any) => ({
      ...item,
      calculatedPrice: item.calculatedPrice ?? (item.type === 'rent' ? (item.rentPrice * (item.rentalDays || 1)) : item.buyPrice)
    }));
    if (type === "請求書" && order.invoiceBlocks) {
      order.invoiceBlocks.forEach((b: any) => {
        if (b.extraCosts) {
          b.extraCosts.forEach((cost: any) => {
            itemsToRender.push({
              name: cost.itemName,
              isExtraCost: true,
              quantity: 1,
              price: cost.amount,
              calculatedPrice: cost.amount,
              note: cost.note
            });
          });
        }
      });
    }
  }

  let customerName = "";
  if (order.companyName) {
    customerName += order.companyName + " 御中\n";
  }
  if (order.personName) {
    customerName += order.personName + " 様";
  }

  const message = type === "納品書" ? "下記の通り納品申し上げます。" : type === "回収書" ? "下記の通り回収いたしました。" : "下記の通りご請求申し上げます。";
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden">
        
        {/* Header toolbar */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <h2 className="font-bold text-lg">{type} プレビュー</h2>
          <div className="flex gap-2">
            <button 
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              {isGenerating ? "生成中..." : "PDFダウンロード"}
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Document Area */}
        <div className="flex-1 overflow-auto p-4 md:p-8 bg-slate-100 flex justify-center items-start">
          
          {/* A4 Document Container */}
          <div 
            ref={documentRef} 
            className="bg-white shadow-sm"
            style={{ 
               width: "210mm", 
               minHeight: "297mm", 
               padding: "20mm 15mm",
               fontFamily: "'Noto Sans JP', sans-serif",
               color: "#333",
               boxSizing: "border-box"
            }}
          >
            {/* Document Header */}
            <div className="flex justify-between items-start mb-10">
              <div className="flex flex-col whitespace-pre-wrap text-lg leading-relaxed font-medium">
                {customerName || "お客様 様"}
              </div>
              <div className="text-right">
                <p className="mb-2 text-sm">発行日: {issueDate}</p>
                <p className="text-sm">文書番号: {order.orderNumber}</p>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold tracking-[0.5em] ml-[0.5em] border-b-2 border-black inline-block pb-1">{type}</h1>
              {block && (
                <p className="text-xs text-slate-500 mt-2 font-bold bg-slate-100 py-1 rounded">対象期間: {block.monthPeriod}分 ({block.startDate} 〜 {block.endDate})</p>
              )}
            </div>

            {/* Message & Company Info */}
            <div className="flex justify-between items-end mb-8">
              <div>
                <p className="mb-2 text-sm">{message}</p>
                {type === "請求書" && (
                  <>
                    <h2 className="font-bold text-xl mb-1 mt-4">ご請求金額： ¥{total.toLocaleString()} -</h2>
                    <p className="text-xs text-slate-500">(消費税 10% ¥{tax.toLocaleString()} を含む)</p>
                  </>
                )}
              </div>
              
              <div className="text-right text-sm leading-relaxed">
                <p className="font-bold text-lg mb-1 tracking-widest">アサヒリース 株式会社</p>
                <p>〒194-0021</p>
                <p>東京都町田市中町1-30-8</p>
                <p>菅井町田ビル3-Ｄ</p>
                <p>TEL: 042-709-3221</p>
                <p>インボイス登録番号: T1234567890123</p>
              </div>
            </div>

            {/* Order Meta Data */}
            <div className="mb-6">
              <table className="w-full text-sm border-collapse border border-slate-300">
                <tbody>
                  <tr>
                    <th className="border border-slate-300 bg-slate-100 p-2 text-left w-1/4">現場名</th>
                    <td className="border border-slate-300 p-2 w-1/4">{order.siteName || "-"}</td>
                    <th className="border border-slate-300 bg-slate-100 p-2 text-left w-1/4">工事番号</th>
                    <td className="border border-slate-300 p-2 w-1/4">{order.constructionNumber || "-"}</td>
                  </tr>
                  <tr>
                    <th className="border border-slate-300 bg-slate-100 p-2 text-left">レンタル期間</th>
                    <td className="border border-slate-300 p-2" colSpan={3}>
                      {order.rentalStartDate ? `${order.rentalStartDate.replace(/-/g, "/")} 〜 ${order.rentalEndDate?.replace(/-/g, "/") || ""}` : "-"}
                      {type === "請求書" && order.actualReturnDate && (
                        <span className="ml-4 font-bold text-red-600">(実返却日: {order.actualReturnDate.replace(/-/g, "/")})</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Items Table */}
            <table className="w-full text-sm border-collapse border border-slate-400 mb-8">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-400">
                  <th className="border border-slate-400 p-2 text-left w-10">No.</th>
                  <th className="border border-slate-400 p-2 text-left">品名・明細</th>
                  <th className="border border-slate-400 p-2 text-right w-24">
                    {type === "納品書" ? "納品数" : type === "回収書" ? "回収数" : "数量"}
                  </th>
                  <th className="border border-slate-400 p-2 text-left w-24">単位</th>
                  {type === "請求書" && (
                    <>
                      <th className="border border-slate-400 p-2 text-right w-32">単価</th>
                      <th className="border border-slate-400 p-2 text-right w-32">金額</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {itemsToRender.map((item: any, idx: number) => {
                  const price = item.price ?? 0;
                  const calculatedPrice = item.calculatedPrice ?? 0;
                  const quantityToDisplay = type === "回収書" ? (item.returnedQuantity ?? item.quantity) : item.quantity;
                  const isRent = item.type === 'rent';
                  const isExtra = item.isExtraCost;

                  return (
                    <tr key={idx} className={`border-b border-slate-300 ${isExtra ? 'bg-amber-50/20' : ''}`}>
                      <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
                      <td className="border border-slate-300 p-2">
                        {item.name}
                        {isRent && item.rentalDays && (
                          <span className="block text-xs text-slate-500 mt-0.5">{item.rentalDays}日間 (レンタル)</span>
                        )}
                        {isRent && item.guaranteeFeeFlat > 0 && (
                          <span className="block text-[10px] text-slate-400 mt-0.5">※初回保証料含む</span>
                        )}
                        {item.note && (
                          <span className="block text-xs text-slate-500 mt-0.5">{item.note}</span>
                        )}
                      </td>
                      <td className="border border-slate-300 p-2 text-right">{quantityToDisplay}</td>
                      <td className="border border-slate-300 p-2 text-center text-xs">
                        {isExtra ? "式" : (isRent ? "点/レンタル" : "点/購入")}
                      </td>
                      {type === "請求書" && (
                        <>
                          <td className="border border-slate-300 p-2 text-right">¥{price.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-right">¥{calculatedPrice.toLocaleString()}</td>
                        </>
                      )}
                    </tr>
                  );
                })}

                {/* Empty rows to fill space */}
                {Array.from({ length: Math.max(0, 10 - itemsToRender.length) }).map((_, idx) => (
                  <tr key={`empty-${idx}`} className="border-b border-slate-300">
                    <td className="border border-slate-300 p-2 min-h-[36px]">&nbsp;</td>
                    <td className="border border-slate-300 p-2">&nbsp;</td>
                    <td className="border border-slate-300 p-2">&nbsp;</td>
                    <td className="border border-slate-300 p-2">&nbsp;</td>
                    {type === "請求書" && (
                      <>
                        <td className="border border-slate-300 p-2">&nbsp;</td>
                        <td className="border border-slate-300 p-2">&nbsp;</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {type === "回収書" && order.itemIssues && order.itemIssues.length > 0 && (
              <div className="mb-8 border border-orange-400 p-4 rounded text-sm bg-orange-50/50">
                <h3 className="font-bold text-orange-800 mb-2">確認事項（不足・破損等）</h3>
                <ul className="list-disc list-inside space-y-1 text-orange-900">
                  {order.itemIssues.map((issue: any, idx: number) => {
                    const item = order.items.find((i: any) => i.id === issue.itemId);
                    return (
                      <li key={idx}>
                         {item ? item.name : "不明な品目"} - 
                         <span className="font-bold ml-1">{issue.type === "missing" ? "不足/紛失" : "破損"}</span>
                         （数量: {issue.quantity}）: {issue.notes}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Totals */}
            {type === "請求書" && (
              <div className="flex justify-end">
                <table className="w-64 text-sm border-collapse border border-slate-400">
                  <tbody>
                    <tr>
                      <th className="border border-slate-400 bg-slate-100 p-2 text-left">小計</th>
                      <td className="border border-slate-400 p-2 text-right">¥{subtotal.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <th className="border border-slate-400 bg-slate-100 p-2 text-left">消費税 (10%)</th>
                      <td className="border border-slate-400 p-2 text-right">¥{tax.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <th className="border border-slate-400 bg-slate-100 p-2 text-left font-bold border-b-2">合計</th>
                      <td className="border border-slate-400 p-2 text-right font-bold text-lg border-b-2">¥{total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Bank details for Invoice */}
            {type === "請求書" && (
              <div className="mt-12 text-sm p-4 border border-slate-300 rounded">
                <p className="font-bold mb-2 underline">お振込先</p>
                <p>〇〇銀行 〇〇支店 (普) 1234567</p>
                <p>口座名義：アサヒリース株式会社</p>
                <p className="mt-2 text-red-600 text-xs">※お振込手数料は貴社にてご負担くださいますようお願い申し上げます。</p>
              </div>
            )}

            {/* Signature fields for Delivery Note (納品書) and Collection Note (回収書) */}
            {(type === "納品書" || type === "回収書") && (
              <div className="mt-16 flex justify-end pr-10">
                <div className="flex flex-col items-center min-w-[200px]">
                  <p className="text-xs mb-2">受領印</p>
                  <div className="border-b border-black w-full text-center pb-1 min-h-[80px] flex items-end justify-center">
                    {type === "納品書" && (order.signature || order.deliverySignature) && (
                      <img src={order.signature || order.deliverySignature} alt="Signature" className="max-h-20 object-contain" />
                    )}
                    {type === "回収書" && (order.collectionSignature || order.warehouseSignature) && (
                      <img src={order.collectionSignature || order.warehouseSignature} alt="Signature" className="max-h-20 object-contain" />
                    )}
                  </div>
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
