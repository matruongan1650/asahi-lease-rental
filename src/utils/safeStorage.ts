/**
 * safeStorage.ts — localStorage への安全な書き込み。
 *
 * 写真・サインの base64 などで容量(QuotaExceededError)を超えると setItem は例外を投げる。
 * 未捕捉だと React の effect 内などで画面全体がクラッシュするため、必ず握りつぶす。
 * 容量超過時は重い base64(data: URL)を間引いた軽量版で再試行する。
 * サーバー(MySQL)が正本なので、間引いた画像は次回ポーリングで取り直せる。
 */
function _slimReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "string" && value.length > 256 && value.startsWith("data:")) {
    return undefined;
  }
  return value;
}

/** 任意の値を JSON 化して安全に保存する。失敗してもクラッシュさせない。 */
export function safeSetJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    try {
      localStorage.setItem(key, JSON.stringify(value, _slimReplacer));
    } catch {
      // それでも入らなければ保存を諦める（メモリ上の値は保持され、表示・同期は継続）。
    }
  }
}

/** 文字列をそのまま安全に保存する（容量超過でもクラッシュさせない）。 */
export function safeSetString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota error
  }
}
