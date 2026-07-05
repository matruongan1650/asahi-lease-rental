import React, { useRef, useState, useMemo, useEffect } from "react";
import { alertDialog } from "./AppDialog";
import { groupOrdersByCompany } from "../utils/rentalInvoiceGrouping";
import {
  buildCompanySummary,
  buildCompanyInvoice,
  issueCompanyInvoice
} from "../utils/invoiceTemplatesAdmin";
import { renderSectionsToPdf, mountOffscreen } from "../utils/pdfMultiPage";

interface B2BInvoiceViewerProps {
  companyName: string;
  monthPeriod: string; // YYYY-MM
  type: "summary" | "detailed";
  orders: any[];
  onClose: () => void;
}

function HTMLElementWrapper({ element }: { element: HTMLElement }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    container.appendChild(element);
  }, [element]);
  
  return <div ref={containerRef} />;
}

export default function B2BInvoiceViewer({
  companyName,
  monthPeriod,
  type,
  orders,
  onClose
}: B2BInvoiceViewerProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  // Get matching company group
  const group = useMemo(() => {
    const groups = groupOrdersByCompany(orders, { monthPeriod, companyName });
    return groups.find(g => g.companyName.trim() === companyName.trim()) || null;
  }, [orders, monthPeriod, companyName]);

  // Generate pages dynamically
  const pages = useMemo(() => {
    if (!group) return [];

    // 総合＝請求総括表（会社の全注文一覧・複数ページ）。内訳＝総括表＋現場別請求書一式。
    try {
      if (type === "summary") {
        return buildCompanySummary(group, monthPeriod);
      }
      return buildCompanyInvoice(group, monthPeriod).nodes;
    } catch (err) {
      console.error("invoice preview build error:", err);
      return [];
    }
  }, [group, type, monthPeriod]);

  const handleDownloadPdf = async () => {
    if (!group) return;
    setIsGenerating(true);
    try {
      if (type === "summary") {
        const summaryNodes = buildCompanySummary(group, monthPeriod);
        const cleanup = mountOffscreen(summaryNodes);
        try {
          await renderSectionsToPdf(summaryNodes, `請求総括表_${companyName}_${monthPeriod}.pdf`);
        } finally {
          cleanup();
        }
      } else {
        await issueCompanyInvoice(group, monthPeriod);
      }
    } catch (err) {
      console.error("PDF export error:", err);
      void alertDialog("PDFの生成中にエラーが発生しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden">
        
        {/* Header Toolbar */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <h2 className="font-bold text-lg">
            {type === "summary" ? "請求総括表" : "請求書（総括＋現場別）"} プレビュー
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isGenerating || pages.length === 0}
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

        {/* Scrollable Document Area with stacked pages */}
        <div className="flex-1 overflow-auto p-4 md:p-8 bg-slate-100 flex justify-center items-start">
          {pages.length === 0 ? (
            <div className="bg-white shadow-sm p-12 rounded-xl text-center text-slate-500 w-full max-w-xl">
              <span className="material-symbols-outlined text-slate-300 text-6xl mb-4">folder_open</span>
              <p className="font-bold text-base">対象月の請求データが存在しません</p>
              <p className="text-xs text-slate-400 mt-1">選択された期間内に {companyName} のアクティブなレンタル・販売はありません。</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 py-4 w-full">
              {pages.map((pageEl, idx) => (
                <div 
                  key={idx} 
                  className="bg-white shadow-lg border border-slate-200 overflow-hidden shrink-0 rounded-md"
                  style={{ width: "794px", height: "1123px" }}
                >
                  <HTMLElementWrapper element={pageEl} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
