/**
 * flowDraft.ts — 現場フロー（配送/回収/持込返却）の進捗をローカルに退避する。
 *
 * フィールド用 APK は、カメラ/地図アプリへの切替や省メモリで WebView が破棄されると
 * 入力中の手順・数量・報告が全て失われ、訪問をやり直す羽目になる。
 * 進捗（手順位置・数量・報告・メモ等の構造化データ）を localStorage に保存し、
 * 同じ注文のフローを開き直したときに復元する。
 *
 * 写真・サインの base64 は容量(quota)対策のため保存しない（キャッシュ間引きと同方針）。
 * 保存対象は「やり直しが最も手間な」構造化データに限定する。
 */
const PREFIX = "asahi.flowDraft.";

/** 保存済みドラフトを読み、fallback にマージして返す（無ければ fallback そのまま）。 */
export function loadDraft<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return { ...fallback, ...parsed };
  } catch { /* 破損・quota は無視 */ }
  return fallback;
}

/** 進捗を保存する（quota 超過などは握りつぶす — 保存失敗でフローを止めない）。 */
export function saveDraft(key: string, data: Record<string, unknown>): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch { /* quota 等は無視 */ }
}

/** ドラフトを破棄する（完了 or 明示中止時）。 */
export function clearDraft(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}
