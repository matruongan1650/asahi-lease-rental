import { useCallback, useEffect, useState } from "react";
import type { AppNotification } from "../utils/notifications";

/**
 * 通知の既読状態を管理する共通フック（admin / staff / customer 共通）。
 *
 * 通知は実データから毎回計算される（永続レコードではない）。各通知は安定した id を持ち、
 * 内容（件数など）が変わると body も変わる。そこで「id + body」を既読キーにすることで、
 * 「同じ通知を既読にしたら消える」かつ「件数が変化したら未読として再表示される」を両立する。
 * 既読キー集合は localStorage に scope（サイト + ユーザー）ごとに保存する。
 */
export function notifKey(n: AppNotification): string {
  // 件数は title（例「新規注文 3件」）に入るため、title を必ずキーに含める。
  // 以前は body 優先だったが、件数が body に無い通知では件数が増えても再表示されなかった。
  return n.id + "|" + (n.title || "") + "|" + (n.body || "");
}

function storageKey(scope: string): string {
  return `asahi.notifRead.${scope}`;
}

function load(scope: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function save(scope: string, set: Set<string>): void {
  try {
    // 無制限肥大を防ぐため直近 300 件のみ保持（古い既読は捨ててもUI上の害はない）。
    localStorage.setItem(storageKey(scope), JSON.stringify([...set].slice(-300)));
  } catch {
    /* ignore quota */
  }
}

export function useNotificationReads(scope: string) {
  const [readSet, setReadSet] = useState<Set<string>>(() => load(scope));

  // scope（ログインユーザー）が変わったら既読集合を読み直す。
  useEffect(() => {
    setReadSet(load(scope));
  }, [scope]);

  const isRead = useCallback((n: AppNotification) => readSet.has(notifKey(n)), [readSet]);

  const markRead = useCallback(
    (ns: AppNotification[]) => {
      setReadSet((prev) => {
        const next = new Set(prev);
        ns.forEach((n) => next.add(notifKey(n)));
        save(scope, next);
        return next;
      });
    },
    [scope],
  );

  const unreadCount = useCallback(
    (ns: AppNotification[]) => ns.reduce((c, n) => c + (readSet.has(notifKey(n)) ? 0 : 1), 0),
    [readSet],
  );

  return { isRead, markRead, unreadCount };
}
