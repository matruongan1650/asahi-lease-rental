import { useSyncExternalStore } from "react";

/**
 * useIsDesktop — PC（大画面）かどうかを返す。
 * お客様サイトは「スマホ＝従来のモバイル Web アプリ / PC＝専用デスクトップサイト」で出し分ける。
 * 1024px 以上をデスクトップとみなす（スマホ・タブレット縦は従来アプリ）。
 */
const QUERY = "(min-width: 1024px)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  // Safari 旧版は addEventListener 非対応 → addListener にフォールバック。
  if (mq.addEventListener) mq.addEventListener("change", callback);
  else mq.addListener(callback);
  return () => {
    if (mq.removeEventListener) mq.removeEventListener("change", callback);
    else mq.removeListener(callback);
  };
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY).matches : false),
    () => false,
  );
}
