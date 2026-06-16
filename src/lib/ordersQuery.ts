/**
 * ordersQuery.ts — サーバー側でフィルタ＋ページングした注文を取得する。
 * 注文が数万件あってもクライアントは 1 ページ分しか保持しない（メモリ・通信を一定に保つ）。
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE } from "./dataBackend";

export interface QueryOpts {
  hasType?: string;       // "rent" | "buy"
  statusIn?: string[];
  q?: string;
  counts?: boolean;
  limit?: number;
  offset?: number;
}
export interface QueryResult {
  rows: any[];
  total: number;
  sumTotal: number;
  statusCounts: Record<string, number>;
}

export async function queryStore(name: string, opts: QueryOpts): Promise<QueryResult> {
  const p = new URLSearchParams();
  p.set("name", name);
  if (opts.hasType) p.set("hasType", opts.hasType);
  if (opts.statusIn && opts.statusIn.length) p.set("statusIn", opts.statusIn.join(","));
  if (opts.q) p.set("q", opts.q);
  p.set("limit", String(opts.limit ?? 50));
  p.set("offset", String(opts.offset ?? 0));
  if (opts.counts) p.set("counts", "1");
  const res = await fetch(`${API_BASE}/query?${p.toString()}`);
  if (!res.ok) throw new Error("query " + res.status);
  const j = await res.json();
  return { rows: Array.isArray(j.rows) ? j.rows : [], total: Number(j.total) || 0, sumTotal: Number(j.sumTotal) || 0, statusCounts: j.statusCounts || {} };
}

/**
 * サーバーページング用フック。フィルタ（hasType/statusIn/q + resetKey）が変わると先頭ページから取得し直す。
 * loadMore で次ページを追記。refresh で再取得（操作後の反映用）。
 */
export function useServerQuery(
  name: string,
  opts: { hasType?: string; statusIn?: string[]; q?: string; counts?: boolean; pageSize?: number; autoRefreshMs?: number },
  resetKey?: unknown,
) {
  const pageSize = opts.pageSize ?? 50;
  const pollMs = opts.autoRefreshMs ?? 8000; // 0 で自動更新オフ
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [sumTotal, setSumTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const filterKey = JSON.stringify({ name, hasType: opts.hasType, statusIn: opts.statusIn, q: opts.q, resetKey, tick });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    queryStore(name, { hasType: opts.hasType, statusIn: opts.statusIn, q: opts.q, counts: opts.counts, limit: pageSize, offset: 0 })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
        setSumTotal(r.sumTotal);
        setStatusCounts(r.statusCounts);
      })
      .catch(() => { if (!cancelled) { setRows([]); setTotal(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMore = useCallback(() => {
    setLoading(true);
    queryStore(name, { hasType: opts.hasType, statusIn: opts.statusIn, q: opts.q, limit: pageSize, offset: rows.length })
      .then((r) => setRows((prev) => [...prev, ...r.rows]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, opts.hasType, JSON.stringify(opts.statusIn), opts.q, rows.length, pageSize]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // 自動更新（near-realtime）: 現在表示中の範囲を一定間隔で再取得する。
  // 他端末・スタッフの変更や新規注文が反映される。ページング状態（読込済み件数）は維持。
  const liveRef = useRef({ name, opts, loaded: pageSize });
  liveRef.current = { name, opts, loaded: rows.length || pageSize };
  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return; // 非表示タブでは更新しない
      const { name: n, opts: o, loaded } = liveRef.current;
      queryStore(n, { hasType: o.hasType, statusIn: o.statusIn, q: o.q, counts: o.counts, limit: Math.max(pageSize, loaded), offset: 0 })
        .then((r) => { setRows(r.rows); setTotal(r.total); setSumTotal(r.sumTotal); setStatusCounts(r.statusCounts); })
        .catch(() => {});
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, pageSize]);

  return { rows, total, sumTotal, statusCounts, hasMore: rows.length < total, loading, loadMore, refresh };
}
