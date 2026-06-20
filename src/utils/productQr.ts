import type { Product } from "../types";

export const PRODUCT_QR_PREFIX = "ASAHI-PRODUCT";

function cleanId(id: string) {
  return String(id || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getProductQrCode(product: Pick<Product, "id"> & Partial<Product>) {
  const existing = String((product as any).qrCode || "").trim();
  if (existing) return existing;
  return `AS-${cleanId(product.id).toUpperCase()}`;
}

export function getProductQrPayload(product: Pick<Product, "id"> & Partial<Product>) {
  const existing = String((product as any).qrPayload || "").trim();
  if (existing) return existing;
  return `${PRODUCT_QR_PREFIX}:${cleanId(product.id)}`;
}

export function makeProductQrFields(product: Pick<Product, "id"> & Partial<Product>) {
  return {
    qrCode: getProductQrCode(product),
    qrPayload: getProductQrPayload(product),
    qrUpdatedAt: new Date().toISOString(),
  };
}

export function extractProductIdFromQr(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return String(parsed.productId || parsed.id || parsed.sku || "").trim();
    }
  } catch {
    // Plain QR payloads are expected. JSON is optional.
  }

  if (value.startsWith(`${PRODUCT_QR_PREFIX}:`)) {
    return value.slice(PRODUCT_QR_PREFIX.length + 1).trim();
  }

  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("productId") || url.searchParams.get("id") || "";
    if (fromQuery) return fromQuery.trim();
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last) return last.trim();
  } catch {
    // Not a URL.
  }

  if (value.startsWith("AS-")) return value.slice(3).trim();
  return value;
}

function qrCandidates(product: any) {
  const id = String(product?.id || product?.firestoreId || "").trim();
  const qrCode = getProductQrCode({ id, ...(product || {}) });
  const qrPayload = getProductQrPayload({ id, ...(product || {}) });
  return [id, qrCode, qrPayload, String(product?.qr || "").trim()].filter(Boolean);
}

/** 厳密一致（区切り文字を保持したままの完全一致）。 */
export function matchesProductQrStrict(product: any, raw: string) {
  const value = String(raw || "").trim();
  const extracted = extractProductIdFromQr(value);
  const norm = (input: string) => String(input || "").trim().toUpperCase();
  const value2 = norm(value), extracted2 = norm(extracted);
  return qrCandidates(product).some(candidate => {
    const c = norm(candidate);
    const cNoAs = norm(String(candidate).replace(/^AS-/, ""));
    return c === value2 || c === extracted2 || cNoAs === extracted2;
  });
}

/**
 * 緩い一致（ハイフン/アンダースコア/空白を除去した比較）。印字で区切りが落ちる端末向けの救済。
 * ただし短いキー(<4)は別商品を誤読し得るため、4文字以上の一致のみ許可する。
 */
export function matchesProductQrLoose(product: any, raw: string) {
  const value = String(raw || "").trim();
  const extracted = extractProductIdFromQr(value);
  const loose = (input: string) => String(input || "").trim().toUpperCase().replace(/[-_\s]/g, "");
  const valueL = loose(value), extractedL = loose(extracted);
  const okLen = (a: string, b: string) => a.length >= 4 && a === b;
  return qrCandidates(product).some(candidate => {
    const cl = loose(candidate);
    const clNoAs = loose(String(candidate).replace(/^AS-/, ""));
    return okLen(cl, valueL) || okLen(cl, extractedL) || okLen(clNoAs, extractedL);
  });
}

/** 互換: 厳密 or 緩い いずれかで一致。 */
export function matchesProductQr(product: any, raw: string) {
  return matchesProductQrStrict(product, raw) || matchesProductQrLoose(product, raw);
}

export function findProductByQr<T extends Record<string, any>>(products: T[], raw: string) {
  const list = products || [];
  // 厳密一致を優先（別商品を緩い一致で誤読しないため）。無ければ緩い一致にフォールバック。
  return list.find(p => matchesProductQrStrict(p, raw))
    || list.find(p => matchesProductQrLoose(p, raw))
    || null;
}
