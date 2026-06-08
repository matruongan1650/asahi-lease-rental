import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { getOrGenerateInvoiceBlocks } from "../utils/billing";

interface B2BInvoiceViewerProps {
  companyName: string;
  monthPeriod: string; // YYYY-MM
  type: "summary" | "detailed";
  orders: any[];
  onClose: () => void;
}

export default function B2BInvoiceViewer({
  companyName,
  monthPeriod,
  type,
  orders,
  onClose
}: B2BInvoiceViewerProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 1. Filter company orders
  const companyOrders = orders.filter(
    (o) => o.companyName && o.companyName.trim() === companyName.trim()
  );

  // 2. Map matching blocks for the selected calendar month
  const matchingData = companyOrders
    .map((o) => {
      const blocks = getOrGenerateInvoiceBlocks(o);
      const block = blocks.find((b) => b.monthPeriod === monthPeriod);
      return block ? { order: o, block } : null;
    })
    .filter(Boolean) as { order: any; block: any }[];

  const handleDownloadPdf = async () => {
    if (!documentRef.current) return;
    setIsGenerating(true);
    try {
      const element = documentRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`B2B_Invoice_${type === "summary" ? "Summary" : "Details"}_${monthPeriod}_${companyName}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("PDFの生成中にエラーが発生しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Totals
  const subtotal = matchingData.reduce((sum, item) => sum + item.block.subtotal, 0);
  const tax = matchingData.reduce((sum, item) => sum + item.block.tax, 0);
  const total = matchingData.reduce((sum, item) => sum + item.block.total, 0);

  // 4. Issue Date (Last day of the month)
  const [year, month] = monthPeriod.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const issueDate = `${year}/${String(month).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}`;

  // 5. Group by Employee
  const groupedByEmployee: Record<string, typeof matchingData> = {};
  matchingData.forEach((item) => {
    const empName = item.order.personName || "一般担当";
    if (!groupedByEmployee[empName]) {
      groupedByEmployee[empName] = [];
    }
    groupedByEmployee[empName].push(item);
  });

  const docNo = `INV-B2B-${monthPeriod.replace("-", "")}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden">
        
        {/* Header Toolbar */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <h2 className="font-bold text-lg">
            {type === "summary" ? "総合請求書" : "内訳請求書"} プレビュー
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isGenerating || matchingData.length === 0}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              {isGenerating ? "生成中..." : "PDFダウンロード"}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Document Area */}
        <div className="flex-1 overflow-auto p-4 md:p-8 bg-slate-100 flex justify-center items-start">
          
          {matchingData.length === 0 ? (
            <div className="bg-white shadow-sm p-12 rounded-xl text-center text-slate-500 w-full max-w-xl">
              <span className="material-symbols-outlined text-slate-300 text-6xl mb-4">folder_open</span>
              <p className="font-bold text-base">対象月の請求データが存在しません</p>
              <p className="text-xs text-slate-400 mt-1">選択された期間内に {companyName} のアクティブなレンタル・販売はありません。</p>
            </div>
          ) : (
            /* A4 Document Container */
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
                <div className="flex flex-col whitespace-pre-wrap text-lg leading-relaxed font-bold text-slate-800">
                  {companyName} 御中
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p className="mb-1">請求締め日: {issueDate}</p>
                  <p>請求書番号: {docNo}</p>
                </div>
              </div>

              {/* Title */}
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold tracking-[0.3em] ml-[0.3em] border-b-2 border-black inline-block pb-1.5">
                  {type === "summary" ? "月次総合請求書" : "月次内訳請求書"}
                </h1>
                <p className="text-xs text-slate-400 font-medium mt-2">対象期間: {monthPeriod}分 (月末締め)</p>
              </div>

              {/* Summary Total Block */}
              <div className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6">
                <div>
                  <p className="text-sm text-slate-600 mb-2">下記の通りご請求申し上げます。</p>
                  <h2 className="font-extrabold text-2xl text-slate-900 tracking-tight">
                    ご請求金額： ¥{total.toLocaleString()} -
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1">
                    (内消費税 10% ¥{tax.toLocaleString()} | 小計 ¥{subtotal.toLocaleString()})
                  </p>
                </div>
                
                <div className="text-right text-[11px] text-slate-600 leading-normal">
                  <p className="font-bold text-sm text-slate-800 mb-1 tracking-wider">アサヒリース 株式会社</p>
                  <p>〒194-0021</p>
                  <p>東京都町田市中町1-30-8 菅井町田ビル3-Ｄ</p>
                  <p>TEL: 042-709-3221 | FAX: 042-709-3222</p>
                  <p>登録番号: T1234567890123</p>
                </div>
              </div>

              {/* Summary Invoice Layout */}
              {type === "summary" && (
                <div className="mt-6">
                  <table className="w-full text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-50 font-bold border border-slate-300">
                        <th className="border border-slate-300 p-2.5 text-left w-24">受注日付</th>
                        <th className="border border-slate-300 p-2.5 text-left w-28">伝票番号</th>
                        <th className="border border-slate-300 p-2.5 text-left">現場名 / 工事名</th>
                        <th className="border border-slate-300 p-2.5 text-right w-24">小計</th>
                        <th className="border border-slate-300 p-2.5 text-right w-20">消費税</th>
                        <th className="border border-slate-300 p-2.5 text-right w-28">合計金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingData.map(({ order, block }) => (
                        <tr key={block.id} className="border border-slate-200">
                          <td className="border border-slate-300 p-2 font-mono">{order.date?.split("•")[0]?.trim() || "—"}</td>
                          <td className="border border-slate-300 p-2 font-mono font-bold text-blue-700">{order.orderNumber}</td>
                          <td className="border border-slate-300 p-2">
                            <div className="font-bold text-slate-800">{order.siteName || "—"}</div>
                            {order.constructionNumber && (
                              <div className="text-[10px] text-slate-400 mt-0.5">工事No: {order.constructionNumber}</div>
                            )}
                          </td>
                          <td className="border border-slate-300 p-2 text-right font-mono">¥{block.subtotal.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-right font-mono">¥{block.tax.toLocaleString()}</td>
                          <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-800">¥{block.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Summary Totals Table */}
                  <div className="flex justify-end mt-8">
                    <table className="w-72 text-xs border-collapse border border-slate-300">
                      <tbody>
                        <tr className="border border-slate-300">
                          <th className="bg-slate-50 p-2.5 text-left border border-slate-300 font-bold">小計 (税抜)</th>
                          <td className="p-2.5 text-right font-mono font-semibold border border-slate-300">¥{subtotal.toLocaleString()}</td>
                        </tr>
                        <tr className="border border-slate-300">
                          <th className="bg-slate-50 p-2.5 text-left border border-slate-300 font-bold">消費税 (10%)</th>
                          <td className="p-2.5 text-right font-mono font-semibold border border-slate-300">¥{tax.toLocaleString()}</td>
                        </tr>
                        <tr className="border border-slate-300 bg-slate-50/50">
                          <th className="bg-slate-50 p-2.5 text-left border border-slate-300 font-extrabold text-sm">合計請求金額</th>
                          <td className="p-2.5 text-right font-mono font-extrabold text-base text-blue-700 border border-slate-300">¥{total.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detailed Breakdown Invoice Layout */}
              {type === "detailed" && (
                <div className="mt-6 space-y-8">
                  {Object.entries(groupedByEmployee).map(([employeeName, items]) => (
                    <div key={employeeName} className="border border-slate-200 rounded-lg p-4 bg-slate-50/20">
                      {/* Employee header */}
                      <div className="flex items-center gap-2 border-b-2 border-slate-300 pb-1.5 mb-4 bg-slate-100/50 px-2 py-1 rounded">
                        <span className="material-symbols-outlined text-[16px] text-slate-500">person</span>
                        <h3 className="font-extrabold text-slate-800 text-sm">
                          発注担当者: {employeeName} 様
                        </h3>
                        <span className="ml-auto text-[10px] text-slate-400 font-medium">注文数: {items.length}件</span>
                      </div>

                      {/* Orders under this employee */}
                      <div className="space-y-6">
                        {items.map(({ order, block }) => (
                          <div key={block.id} className="bg-white border border-slate-200 rounded-md overflow-hidden">
                            {/* Order sub-header */}
                            <div className="bg-slate-50 px-3 py-2 text-xs flex flex-wrap justify-between border-b border-slate-200 font-bold text-slate-700">
                              <span>伝票番号: {order.orderNumber}</span>
                              <span>現場: {order.siteName || "—"} {order.constructionNumber ? `(工事No: ${order.constructionNumber})` : ""}</span>
                            </div>

                            {/* Item details list */}
                            <div className="divide-y divide-slate-100 text-xs">
                              {order.items.map((item: any, idx: number) => {
                                if (item.type === "rent") {
                                  const breakdown = item.monthlyBreakdown?.find((b: any) => b.monthStr === monthPeriod);
                                  if (!breakdown) return null;
                                  const isFirstMonth = item.monthlyBreakdown?.[0]?.monthStr === monthPeriod;
                                  const guarantee = isFirstMonth ? (item.guaranteeFeeFlat || 0) : 0;
                                  const dailyRate = breakdown.price / breakdown.days;
                                  const rentalPrice = breakdown.price * item.quantity;
                                  return (
                                    <div key={idx} className="px-3 py-2 flex items-center justify-between animate-fadeIn" style={{ flexWrap: 'wrap' }}>
                                      <div className="flex-1">
                                        <span className="font-bold text-slate-800">{item.name}</span>
                                        <span className="ml-2 text-[10px] text-slate-400 font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">レンタル</span>
                                      </div>
                                      <div className="text-right text-slate-600 w-52 flex justify-between font-mono">
                                        <span>¥{Math.round(dailyRate).toLocaleString()} × {breakdown.days}日 × {item.quantity}点</span>
                                        <span className="font-bold text-slate-800">¥{rentalPrice.toLocaleString()}</span>
                                      </div>
                                      {guarantee > 0 && (
                                        <div className="w-full text-right text-[10px] text-slate-400 pr-0.5 mt-0.5 flex justify-between">
                                          <span>※初回保証料 (保証料 × {item.quantity}点)</span>
                                          <span className="font-bold text-slate-500">¥{guarantee.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                } else {
                                  // Buy items
                                  const orderDateClean = order.date?.split("•")[0]?.trim() || "";
                                  const orderMonth = orderDateClean.replace(/\//g, "-").slice(0, 7);
                                  if (monthPeriod !== orderMonth) return null;
                                  const sub = (item.buyPrice || 0) * item.quantity;
                                  return (
                                    <div key={idx} className="px-3 py-2 flex items-center justify-between">
                                      <div className="flex-1">
                                        <span className="font-bold text-slate-800">{item.name}</span>
                                        <span className="ml-2 text-[10px] text-slate-400 font-bold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">販売</span>
                                      </div>
                                      <div className="text-right text-slate-600 w-52 flex justify-between font-mono">
                                        <span>¥{(item.buyPrice || 0).toLocaleString()} × {item.quantity}点</span>
                                        <span className="font-bold text-slate-800">¥{sub.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  );
                                }
                              })}

                              {/* Extra costs list */}
                              {block.extraCosts && block.extraCosts.map((cost: any) => (
                                <div key={cost.id} className="px-3 py-2 flex items-center justify-between bg-amber-50/20">
                                  <div className="flex-1">
                                    <span className="font-bold text-slate-700">{cost.itemName}</span>
                                    {cost.note && <span className="text-[10px] text-slate-400 ml-2">({cost.note})</span>}
                                    <span className="ml-2 text-[10px] text-slate-400 font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">追加費用</span>
                                  </div>
                                  <div className="text-right text-slate-600 w-52 flex justify-between font-mono">
                                    <span>{cost.isTaxable ? '課税' : '非課税'}</span>
                                    <span className="font-bold text-slate-800">¥{cost.amount.toLocaleString()}</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Order block sub-total */}
                            <div className="bg-slate-50/50 px-3 py-2 border-t border-slate-100 flex justify-end gap-4 font-bold text-[11px] text-slate-500 font-mono">
                              <span>小計: ¥{block.subtotal.toLocaleString()}</span>
                              <span>消費税: ¥{block.tax.toLocaleString()}</span>
                              <span className="text-slate-800 text-xs">合計: ¥{block.total.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bank Transfer Details */}
              <div className="mt-10 text-[10px] p-4 border border-slate-300 rounded leading-relaxed">
                <p className="font-bold mb-1.5 underline">お振込先</p>
                <p>〇〇銀行 〇〇支店 (普) 1234567</p>
                <p>口座名義：アサヒリース株式会社</p>
                <p className="mt-1.5 text-red-600 text-[9px]">※お振込手数料 is to be paid by customer.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
