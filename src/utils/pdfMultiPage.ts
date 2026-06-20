// html2canvas-pro: 旧 html2canvas(1.4.1) は Tailwind v4 が出力する oklch()/oklab()/color-mix()
// を解釈できずレンダリングが例外で中断する（= PDF が全サイトで生成失敗）。pro 版は対応済み。
import html2canvas from "html2canvas-pro";
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

/**
 * 改ページで明細行の途中を切らないための「安全な切れ目」を探す。
 * 理想の切断Y(idealY)から上方向へ、背景（ほぼ余白）の横一列を探して、そこで切る。
 * 表のセル間の余白は縦罫線(数本)以外ほぼ無地なので「暗いピクセル比率が極小の行」を境目とみなす。
 * 見つからなければ idealY を返す（巨大な1行など、やむを得ない場合のフォールバック）。
 */
function findSafeCutY(ctx: CanvasRenderingContext2D, width: number, idealY: number, minY: number): number {
  const top = Math.max(0, Math.floor(minY));
  const bottom = Math.floor(idealY);
  const h = bottom - top;
  if (h <= 1) return idealY;
  let band: Uint8ClampedArray;
  try {
    band = ctx.getImageData(0, top, width, h).data;
  } catch {
    return idealY; // CORS 汚染などで読めない場合は従来通り
  }
  const xStep = 4; // 速度のため横方向は間引きサンプリング
  const samplesPerRow = Math.ceil(width / xStep);
  for (let y = h - 1; y >= 0; y--) {
    let dark = 0;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += xStep) {
      const i = rowStart + x * 4;
      const lum = (band[i] + band[i + 1] + band[i + 2]) / 3;
      if (lum < 210) dark++; // 文字・濃い罫線
    }
    // 暗い画素が 2% 未満 = 行間の余白とみなし、ここで切る（行の途中を避ける）。
    if (dark / samplesPerRow < 0.02) return top + y;
  }
  return idealY;
}

function appendCanvasToPdf(pdf: jsPDF, canvas: HTMLCanvasElement, isFirstSection: boolean) {
  const pxPerMm = canvas.width / A4_WIDTH_MM;
  const pageHeightPx = Math.floor(A4_HEIGHT_MM * pxPerMm);
  const totalHeightPx = canvas.height;

  // 端数(～2mm)の余りは新ページを作らない。floor + scale による丸めで1ページ分の
  // セクションが pageHeightPx を僅かに超え、空白の偶数ページが量産される不具合を防ぐ。
  const TAIL_EPSILON_PX = Math.ceil(pxPerMm * 2);
  // 改ページ位置の探索範囲（1ページの約22%まで遡って安全な切れ目を探す）。
  const srcCtx = canvas.getContext("2d");
  const maxSearchBack = Math.floor(pageHeightPx * 0.22);

  let renderedPx = 0;
  let sliceIndex = 0;

  while (totalHeightPx - renderedPx > TAIL_EPSILON_PX) {
    let sliceHeight = Math.min(pageHeightPx, totalHeightPx - renderedPx);

    // まだ後続コンテンツがある（=この下端で実際に切る）場合のみ、行の途中で切らないよう調整する。
    if (srcCtx && renderedPx + sliceHeight < totalHeightPx) {
      const idealCut = renderedPx + sliceHeight;
      const safeCut = findSafeCutY(srcCtx, canvas.width, idealCut, idealCut - maxSearchBack);
      // 安全な切れ目が見つかり、ページが極端に小さくならない範囲なら採用する。
      if (safeCut > renderedPx + TAIL_EPSILON_PX && safeCut < idealCut) {
        sliceHeight = safeCut - renderedPx;
      }
    }

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
 * 単一要素を A4 PDF に出力する共通ヘルパー。
 * - data-URL 画像（署名・写真）のデコード完了を待ってから撮影（空白防止）。
 * - 高さが 1 ページを超える場合は自動でページ分割（以前は 1 枚画像で貼り付けていたため、
 *   明細が多い納品書・回収書・請求書が 1 ページ目で切れていた）。
 * - savePdf によりモバイルでは共有シート、PC ではダウンロードにフォールバック。
 */
export async function elementToPdf(element: HTMLElement, filename: string) {
  if (typeof document !== "undefined" && (document as any).fonts?.ready) {
    try { await (document as any).fonts.ready; } catch { /* ignore */ }
  }
  const imgs = Array.from(element.querySelectorAll("img"));
  await Promise.all(imgs.map(async (img: any) => {
    try {
      if (typeof img.decode === "function") await img.decode();
      else if (!(img.complete && img.naturalWidth > 0)) {
        await new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
      }
    } catch { /* デコード失敗は無視して続行 */ }
  }));
  const pdf = new jsPDF("p", "mm", "a4");
  const canvas = await elementToCanvas(element);
  appendCanvasToPdf(pdf, canvas, true);
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
