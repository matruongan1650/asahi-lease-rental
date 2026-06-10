import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export const A4_PX_WIDTH = 794;
export const A4_PX_HEIGHT = 1123;

async function elementToCanvas(element: HTMLElement) {
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });
}

function appendCanvasToPdf(pdf: jsPDF, canvas: HTMLCanvasElement, isFirstSection: boolean) {
  const pxPerMm = canvas.width / A4_WIDTH_MM;
  const pageHeightPx = Math.floor(A4_HEIGHT_MM * pxPerMm);
  const totalHeightPx = canvas.height;

  let renderedPx = 0;
  let sliceIndex = 0;

  while (renderedPx < totalHeightPx) {
    const sliceHeight = Math.min(pageHeightPx, totalHeightPx - renderedPx);

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeight;
    const ctx = sliceCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0, renderedPx, canvas.width, sliceHeight,
      0, 0, canvas.width, sliceHeight,
    );

    const imgData = sliceCanvas.toDataURL("image/jpeg", 0.95);
    const renderedMm = sliceHeight / pxPerMm;

    if (!(isFirstSection && sliceIndex === 0)) {
      pdf.addPage();
    }
    pdf.addImage(imgData, "JPEG", 0, 0, A4_WIDTH_MM, renderedMm);

    sliceIndex++;
    renderedPx += sliceHeight;
  }
}

async function savePdf(pdf: jsPDF, filename: string) {
  const blob = pdf.output("blob");

  if (typeof navigator !== "undefined" && navigator.canShare && navigator.share) {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch {
      // fall through
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/**
 * 各セクション（1つの要素 = 1人の担当者）をPDFにレンダリングします。高さが297mmを超えるセクションは
 * 自動的に複数ページに分割されます。2つ目以降のセクションは、常に新しいページから開始されます。
 */
export async function renderSectionsToPdf(sections: HTMLElement[], filename: string) {
  if (sections.length === 0) throw new Error("出力対象がありません。");

  // ラスタライズする前にNoto Sans JP (Google Fonts) の読み込み完了を待ちます。
  // フォールバックフォントでのhtml2canvasスナップショットによるレイアウト崩れやページ溢れを防ぐためです。
  if (typeof document !== "undefined" && (document as any).fonts?.ready) {
    try { await (document as any).fonts.ready; } catch { /* ignore */ }
  }

  const pdf = new jsPDF("p", "mm", "a4");

  for (let i = 0; i < sections.length; i++) {
    const canvas = await elementToCanvas(sections[i]);
    appendCanvasToPdf(pdf, canvas, i === 0);
  }

  await savePdf(pdf, filename);
}

/**
 * html2canvasが測定およびキャプチャできるように、一時的にノードをDOM（オフスクリーン）にマウントします。
 */
export function mountOffscreen(nodes: HTMLElement[]): () => void {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.top = "-99999px";
  host.style.left = "-99999px";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  nodes.forEach(n => host.appendChild(n));
  document.body.appendChild(host);
  return () => host.remove();
}
