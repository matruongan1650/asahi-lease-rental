import React, { useRef, useState, useEffect } from "react";
import { alertDialog } from "./AppDialog";
import { elementToPdf } from "../utils/pdfMultiPage"; // 複数ページ分割 + モバイル共有フォールバック
import { isVehicleCategory } from "../utils/productUtils";
import { calculateMonthlyInvoice, getOrGenerateInvoiceBlocks, ensureMonthlyBreakdowns, getTaxRate } from "../utils/billing";

interface DocumentViewerProps {
  order: any;
  type: "納品書" | "請求書" | "回収書";
  blockId?: string;
  onClose: () => void;
}

// A4 (210mm) の CSS ピクセル幅（96dpi 換算）。スマホでの縮小率計算に使用。
const A4_PX_WIDTH = 794;
const formatYen = (value: number) => Math.round(Number(value) || 0).toLocaleString("ja-JP");

export default function DocumentViewer({ order, type, blockId, onClose }: DocumentViewerProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  // スマホ表示の縮小(zoom)は撮影対象の外側ラッパーに掛ける。
  // 撮影される documentRef 自体は常に等倍の固定 A4(794px)を保ち、見積書PDFと同じ条件で出力する。
  const fitRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 画面サイズに応じた表示倍率:
  //  - スマホ（お客様・スタッフ）: A4 を画面幅にフィットさせる（横スクロール不要）
  //  - PC（admin）: 等倍の A4 プレビュー
  const [docScale, setDocScale] = useState(1);
  const isMobile = docScale < 1;
  useEffect(() => {
    const compute = () => {
      const vw = window.innerWidth;
      if (vw < A4_PX_WIDTH + 64) {
        // 左右の余白ぶんを引いて A4 がぴったり収まる倍率に
        setDocScale(Math.max(0.3, Math.round(((vw - 16) / A4_PX_WIDTH) * 100) / 100));
      } else {
        setDocScale(1);
      }
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const handleDownloadPdf = async () => {
    if (!documentRef.current) return;
    setIsGenerating(true);
    const element = documentRef.current;
    // PDF は常に等倍の A4 でキャプチャする。スマホ表示の縮小はラッパー(fitRef)の zoom で行うため、
    // 撮影中だけラッパーの zoom を解除して documentRef の実寸(794px)を確保する（縮小されたまま撮ると小さく粗い PDF になる）。
    const fit = fitRef.current;
    const prevZoom = fit ? (fit.style as any).zoom : undefined;
    if (fit) (fit.style as any).zoom = "1";
    try {
      // elementToPdf が「画像デコード待ち → 等倍キャプチャ → 複数ページ分割 → 保存（モバイルは共有）」を行う。
      await elementToPdf(element, `${type}_${order.orderNumber || "document"}.pdf`);
    } catch (err) {
      console.error("PDF生成エラー:", err);
      void alertDialog("PDFの生成中にエラーが発生しました。");
    } finally {
      if (fit) (fit.style as any).zoom = prevZoom || "";
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

  // 注文に invoiceBlocks が保存されていない場合でも生成して参照する。
  // （保存されていないと per-month 請求書がブロックを見つけられず、注文全体の合計に
  //  フォールバックして月別の金額がずれる）
  const allBlocks = getOrGenerateInvoiceBlocks(order);
  const block = blockId ? allBlocks.find((b: any) => b.id === blockId) : null;

  // Totals to display.
  // 全体合計(block 無し)の請求書は、order.subtotal/total（弁償費・燃料費・配送料が反映されない
  // 古い値になり得る）ではなく、生成済みブロック allBlocks の合計を使う。これで印字明細(下で
  // allBlocks の extraCosts を行追加)と総額が一致する。
  const blocksTotal = (allBlocks || []).reduce(
    (a: any, b: any) => ({ subtotal: a.subtotal + (Number(b.subtotal) || 0), tax: a.tax + (Number(b.tax) || 0), total: a.total + (Number(b.total) || 0) }),
    { subtotal: 0, tax: 0, total: 0 },
  );
  const useBlockSum = !block && type === "請求書" && allBlocks.length > 0;
  const subtotal = block ? block.subtotal : (useBlockSum ? blocksTotal.subtotal : order.subtotal);
  const tax = block ? block.tax : (useBlockSum ? blocksTotal.tax : order.tax);
  const total = block ? block.total : (useBlockSum ? blocksTotal.total : order.total);

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
      // calculateMonthlyInvoice は rent/buy とも単価を item.price で返す（buy は calculatedPrice ?? buyPrice）。
      // 以前は buy で存在しない item.buyPrice を読み単価列が ¥0 になっていた。
      price: item.price,
      calculatedPrice: item.type === 'rent' ? item.rentalFee : item.total,
      guaranteeFeeFlat: item.guaranteeFee
    }));
    if (block.extraCosts) {
      block.extraCosts.forEach((cost: any) => {
        itemsToRender.push({
          name: cost.itemName || cost.note || "追加費用",
          isExtraCost: true,
          quantity: 1,
          price: cost.amount,
          calculatedPrice: cost.amount,
          note: cost.note
        });
      });
    }
  } else {
    // 全体合計請求書の明細は、合計(blocksTotal)と同じ ensureMonthlyBreakdowns 由来の値を使う。
    // raw order.items の古い calculatedPrice を使うと、期限超過の自動延長で 金額列が小計と食い違う。
    itemsToRender = ensureMonthlyBreakdowns(order).map((item: any) => {
      const qty = Number(item.quantity) || 1;
      // calculatedPrice は全注文ソースで「単価」（Checkout/AdminOrderDrawer 共通の規約）。
      // items 欠落で map クラッシュ→ErrorBoundary 落ちを防ぐ。単価未設定でも NaN にしない。
      const perUnit = item.calculatedPrice ?? (item.type === 'rent' ? ((item.rentPrice || 0) * (item.rentalDays || 1)) : (item.buyPrice || 0));
      return {
        ...item,
        // 金額列は明細合計（単価×数量）にする。block 無しフォールバックで単価のまま出すと、
        // 数量2以上のとき金額列の合計が小計(order.subtotal=単価×数量)に一致しなかった。
        calculatedPrice: perUnit * qty,
      };
    });
    if (type === "請求書") {
      // 生成済みブロック(allBlocks)の追加費用を行に出す。order.invoiceBlocks（弁償費を剥がした
      // 保存値など）ではなく canonical な allBlocks を使い、上の合計(blocksTotal)と一致させる。
      allBlocks.forEach((b: any) => {
        if (b.extraCosts) {
          b.extraCosts.forEach((cost: any) => {
            itemsToRender.push({
              name: cost.itemName || cost.note || "追加費用",
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

  // 請求書では保証料(初回準備・保証料)を「商品ごと」に独立した明細行として明示する。
  // 各レンタル明細の直後に、その商品の保証料を1行追加する（どの商品にいくら掛かっているか
  // admin・お客様の双方が一目で確認できる。明細金額の合計も小計と一致する）。
  const totalGuaranteeFee = type === "請求書"
    ? itemsToRender.reduce((sum: number, it: any) => sum + (Number(it.guaranteeFeeFlat) || 0), 0)
    : 0;
  if (type === "請求書" && totalGuaranteeFee > 0) {
    const interleaved: any[] = [];
    for (const it of itemsToRender) {
      interleaved.push(it);
      const g = Number(it.guaranteeFeeFlat) || 0;
      if (!it.isExtraCost && !it.isGuarantee && g > 0) {
        interleaved.push({
          name: `初回準備・保証料（${it.name}）`,
          isGuarantee: true,
          quantity: 1,
          price: g,
          calculatedPrice: g,
        });
      }
    }
    itemsToRender = interleaved;
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
    <div className={`fixed inset-0 z-[180] flex items-center justify-center bg-black/60 ${isMobile ? "p-0" : "p-4"}`}>
      <div className={`bg-white shadow-2xl flex flex-col w-full overflow-hidden ${isMobile ? "h-full max-h-full rounded-none" : "rounded-xl max-w-4xl max-h-[90vh]"}`}>

        {/* Header toolbar（スマホはコンパクト表示） */}
        <div className={`flex justify-between items-center border-b border-slate-200 ${isMobile ? "p-3" : "p-4"}`}>
          <h2 className={`font-bold ${isMobile ? "text-base" : "text-lg"}`}>{type} プレビュー</h2>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className={`flex items-center gap-1.5 bg-primary text-white rounded-lg font-bold hover:bg-blue-600 transition-colors disabled:opacity-50 ${isMobile ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm gap-2"}`}
            >
              <span className="material-symbols-outlined text-sm">download</span>
              {isGenerating ? "生成中..." : isMobile ? "PDF" : "PDFダウンロード"}
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
        <div className={`flex-1 overflow-auto bg-slate-100 flex justify-center items-start ${isMobile ? "p-2" : "p-4 md:p-8"}`}>

          {/* 表示フィット用ラッパー: スマホでは zoom で画面幅に縮小（PDF 撮影時のみ等倍へ戻す）。
              撮影対象の documentRef 自体は常に固定 A4(794px) を保ち、見積書PDFと同一条件で出力する。 */}
          <div ref={fitRef} style={{ zoom: docScale } as React.CSSProperties}>
          {/* A4 Document Container（固定 794×1123px・等倍・白背景）— 見積書PDFと同じ方式。 */}
          <div
            ref={documentRef}
            className="bg-white shadow-sm"
            style={{
               width: "794px",
               minHeight: "1123px",
               padding: "76px 57px",
               fontFamily: "'Noto Sans JP', sans-serif",
               backgroundColor: "#ffffff",
               color: "#333",
               boxSizing: "border-box",
            } as React.CSSProperties}
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
                    <h2 className="font-bold text-xl mb-1 mt-4">ご請求金額： ¥{formatYen(total)} -</h2>
                    <p className="text-xs text-slate-500">(消費税 {Math.round(getTaxRate() * 100)}% ¥{formatYen(tax)} を含む)</p>
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
                  const quantityToDisplay = type === "回収書" ? (item.returnedQuantity ?? item.quantity ?? 1) : (item.quantity ?? 1);
                  const isRent = item.type === 'rent';
                  const isExtra = item.isExtraCost;

                  return (
                    <tr key={idx} className={`border-b border-slate-300 ${(isExtra || item.isGuarantee) ? 'bg-amber-50/20' : ''}`}>
                      <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
                      <td className="border border-slate-300 p-2">
                        {item.name}
                        {isRent && item.rentalDays && (
                          <span className="block text-xs text-slate-500 mt-0.5">{item.rentalDays}日間 (レンタル)</span>
                        )}
                        {item.isGuarantee && (
                          <span className="block text-[10px] text-slate-400 mt-0.5">※初回のみ</span>
                        )}
                        {item.note && (
                          <span className="block text-xs text-slate-500 mt-0.5">{item.note}</span>
                        )}
                      </td>
                      <td className="border border-slate-300 p-2 text-right">{quantityToDisplay}</td>
                      <td className="border border-slate-300 p-2 text-center text-xs">
                        {(isExtra || item.isGuarantee) ? "式" : (isRent ? "点/レンタル" : "点/購入")}
                      </td>
                      {type === "請求書" && (
                        <>
                          <td className="border border-slate-300 p-2 text-right">¥{formatYen(price)}</td>
                          <td className="border border-slate-300 p-2 text-right">¥{formatYen(calculatedPrice)}</td>
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
                    const item = (order.items || []).find((i: any) => i.id === issue.itemId);
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
                      <td className="border border-slate-400 p-2 text-right">¥{formatYen(subtotal)}</td>
                    </tr>
                    {totalGuaranteeFee > 0 && (
                      <tr>
                        <th className="border border-slate-400 bg-slate-100 p-2 text-left text-xs text-slate-500 font-normal">（うち初回保証料）</th>
                        <td className="border border-slate-400 p-2 text-right text-xs text-slate-500">¥{formatYen(totalGuaranteeFee)}</td>
                      </tr>
                    )}
                    <tr>
                      <th className="border border-slate-400 bg-slate-100 p-2 text-left">消費税 ({Math.round(getTaxRate() * 100)}%)</th>
                      <td className="border border-slate-400 p-2 text-right">¥{formatYen(tax)}</td>
                    </tr>
                    <tr>
                      <th className="border border-slate-400 bg-slate-100 p-2 text-left font-bold border-b-2">合計</th>
                      <td className="border border-slate-400 p-2 text-right font-bold text-lg border-b-2">¥{formatYen(total)}</td>
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
    </div>
  );
}
