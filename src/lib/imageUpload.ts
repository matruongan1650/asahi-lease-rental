/**
 * imageUpload.ts — base64 画像（写真・サイン）をサーバーにファイルとしてアップロードし、
 * レコードには URL だけを残すためのヘルパー。
 *
 * これにより注文などのレコードが軽くなり、localStorage 容量超過・同期肥大・
 * 「再起動で画像が消える」問題が根本的に解消する。
 */
import { API_BASE } from "./dataBackend";

// 同一 dataURL の二重アップロード防止（セッション内キャッシュ）。
const _uploaded = new Map<string, string>();

/** data:image/...;base64,... の大きい文字列か（小さいものは無視＝アイコン等）。 */
function isUploadableDataUrl(v: unknown): v is string {
  return typeof v === "string" && v.length > 256 && v.startsWith("data:image");
}

/** 1 件の data URL をアップロードして URL を返す。失敗時は元の data URL を返す（ローカルでは表示継続）。 */
export async function uploadDataUrl(dataUrl: string): Promise<string> {
  const cached = _uploaded.get(dataUrl);
  if (cached) return cached;
  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const json = await res.json();
    if (!json || typeof json.url !== "string") throw new Error("no url in response");
    _uploaded.set(dataUrl, json.url);
    return json.url;
  } catch (e) {
    console.warn("[imageUpload] アップロード失敗。base64 のまま保持します。", e);
    return dataUrl; // フォールバック: 画像を失わない
  }
}

/** レコードを浅くないコピーして、含まれる base64 画像を全て URL に置換する。 */
async function _deepExternalize(value: any): Promise<any> {
  if (isUploadableDataUrl(value)) {
    return await uploadDataUrl(value);
  }
  if (Array.isArray(value)) {
    return await Promise.all(value.map((v) => _deepExternalize(v)));
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      out[k] = await _deepExternalize(value[k]);
    }
    return out;
  }
  return value;
}

/** レコードに base64 画像が含まれるか（高速判定。含まれなければアップロード処理を丸ごとスキップ）。 */
function hasDataUrl(record: unknown): boolean {
  try {
    return JSON.stringify(record).includes('"data:image');
  } catch {
    return false;
  }
}

/**
 * レコード内の base64 画像を全てアップロードし、URL に置換した新しいレコードを返す。
 * 画像が無ければ同一参照をそのまま返す（呼び出し側で「変化なし」を判定できる）。
 */
export async function externalizeImages<T>(record: T): Promise<T> {
  if (!hasDataUrl(record)) return record;
  return (await _deepExternalize(record)) as T;
}
