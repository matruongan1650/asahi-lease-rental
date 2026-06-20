import React, { useEffect, useRef, useState } from "react";
import { alertDialog } from "./AppDialog";

/**
 * 請求書プレビュー兼ダウンロードモーダル。
 *
 * - 表示: buildXxx が返す A4 ノード(HTMLElement)を画面に表示。ページ数が多い内訳請求書でも
 *   固まらないよう IntersectionObserver で「画面に入ったページだけ」DOM へマウントする（遅延描画）。
 * - ダウンロード: onDownload（= issueXxx）が PDF を再生成して保存する。表示用ノードとは独立に
 *   オフスクリーンでラスタライズするため、遅延描画で未マウントのページがあっても全ページ出力される。
 */
function LazyPage({
  element,
  root,
  eager,
}: {
  element: HTMLElement;
  root: React.RefObject<HTMLDivElement>;
  eager: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(eager);

  // 画面（スクロールコンテナ）に近づいたらマウント対象にする。
  useEffect(() => {
    if (show) return;
    const box = boxRef.current;
    if (!box) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { root: root.current || null, rootMargin: "1000px 0px" },
    );
    io.observe(box);
    return () => io.disconnect();
  }, [show, root]);

  // 実ノードを box に差し込む（モーダルを閉じたら取り外す）。
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !show) return;
    if (element.parentNode !== box) {
      box.innerHTML = "";
      box.appendChild(element);
    }
    return () => {
      try {
        if (element.parentNode === box) box.removeChild(element);
      } catch {
        /* ignore */
      }
    };
  }, [show, element]);

  return (
    <div
      ref={boxRef}
      className="bg-white shadow-lg border border-slate-200 overflow-hidden shrink-0 rounded-md"
      style={{ width: "794px", height: "1123px" }}
    />
  );
}

export default function InvoicePreviewModal({
  title,
  pages,
  onDownload,
  onClose,
}: {
  title: string;
  pages: HTMLElement[];
  onDownload: () => Promise<void>;
  onClose: () => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (isGenerating || pages.length === 0) return;
    setIsGenerating(true);
    try {
      await onDownload();
    } catch (e: any) {
      console.error("PDF export error:", e);
      void alertDialog("PDFの生成中にエラーが発生しました。" + (e?.message ? `\n${e.message}` : ""));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-4xl max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ツールバー */}
        <div className="flex justify-between items-center gap-3 p-4 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-slate-800 truncate">{title} プレビュー</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">全 {pages.length} ページ</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleDownload}
              disabled={isGenerating || pages.length === 0}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">{isGenerating ? "hourglass_top" : "download"}</span>
              {isGenerating ? "生成中…" : "PDFをダウンロード"}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              aria-label="閉じる"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* ページ表示（遅延描画） */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 md:p-8 bg-slate-100 flex justify-center items-start">
          {pages.length === 0 ? (
            <div className="bg-white shadow-sm p-12 rounded-xl text-center text-slate-500 w-full max-w-xl">
              <span className="material-symbols-outlined text-slate-300 text-6xl mb-4">folder_open</span>
              <p className="font-bold text-base">表示できる請求データがありません。</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 py-2">
              {pages.map((el, idx) => (
                <LazyPage key={idx} element={el} root={scrollRef} eager={idx < 2} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
