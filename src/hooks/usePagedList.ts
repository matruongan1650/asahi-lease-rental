import { useState, useEffect } from "react";

/**
 * usePagedList — 大量データのリストを段階表示し、一度に描画する DOM 量を抑える。
 * 注文・取引などが増えても 3 サイト（顧客 / スタッフ / 管理）が重くならないようにする。
 *
 *   const { shown, hasMore, remaining, showMore } = usePagedList(filtered, 50, [tab, query]);
 *   shown.map(...)            // 表示する分だけ
 *   {hasMore && <button onClick={showMore}>さらに表示（残り {remaining}）</button>}
 *
 * resetKey が変わると先頭ページに戻る（タブ・検索切替時など）。
 */
export function usePagedList<T>(items: T[], pageSize = 50, resetKey?: unknown) {
  const [visible, setVisible] = useState(pageSize);
  useEffect(() => {
    setVisible(pageSize);
    // resetKey は依存配列の比較用。JSON 化して安定比較する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(resetKey), pageSize]);

  return {
    shown: items.slice(0, visible),
    hasMore: items.length > visible,
    remaining: Math.max(0, items.length - visible),
    showMore: () => setVisible((v) => v + pageSize),
  };
}
