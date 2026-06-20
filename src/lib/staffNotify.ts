/**
 * staffNotify.ts — スタッフ APK 向けのローカル通知（音付き）。
 *
 * 新しい業務通知（配送/回収/持込/点検）を検知したら、端末の通知（音・ヘッドアップ）を出す。
 * アプリ起動中／バックグラウンド中はこれで鳴る。完全にアプリを終了（スワイプ削除）した状態での
 * 配信には FCM プッシュが必要（Firebase プロジェクト + google-services.json + サーバー送信）。
 * Web では何もしない（Capacitor ネイティブ時のみ動作）。
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { AppNotification } from "../utils/notifications";

const CHANNEL_ID = "staff-alerts";
// v2: 件数(数値)で記録するように変更（旧 v1 はタイトル文字列だった）。初回は鳴らさないため移行は無害。
const SEEN_KEY = "asahi.staff_notif_seen_v2";
let _inited = false;

/** 通知権限の要求 + 音付き高重要度チャンネルの作成（端末ごとに一度）。チャンネル作成完了後に解決する。 */
export async function initStaffNotify(): Promise<void> {
  if (_inited || !Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.requestPermissions();
    // importance 5 (MAX) = 音 + ヘッドアップ表示。Android のチャンネル既定音を使う。
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "業務通知",
      description: "新しい配送・回収・持込返却・点検の通知",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    // チャンネル作成が完了してから初期化済みフラグを立てる（作成前 schedule の競合を防ぐ）。
    _inited = true;
  } catch {
    /* 権限拒否・非対応端末は無視 */
  }
}

function readSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; }
}

/** タイトルから件数を抽出（"配送予定 3件" → 3）。数値が無ければ 0。 */
function countOf(title: string): number {
  const m = String(title || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * 通知リストの変化を監視し、本当に「増えた」通知（新しい id、または件数が増加）だけ音付きで鳴らす。
 * 件数が減った場合（タスク完了など）は記録だけ更新して鳴らさない。
 * 初回（未記録）は鳴らさず現状を記録するだけ（起動時の一斉鳴動を防ぐ）。
 */
export function useStaffNotificationAlerts(notifications: AppNotification[]): void {
  // 署名（id + タイトル）が変わった時だけ effect を走らせる。
  const sig = notifications.map((n) => `${n.id}=${n.title}`).sort().join("|");
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const isFirst = localStorage.getItem(SEEN_KEY) === null;
    const seen = readSeen();
    const current: Record<string, number> = {};
    notifications.forEach((n) => { current[n.id] = countOf(n.title); });

    // 新規 = 未知の id、または件数が「増加」したもの（減少・同数では鳴らさない）。
    const fresh = notifications.filter((n) => {
      const prev = seen[n.id];
      return prev === undefined || countOf(n.title) > prev;
    });

    // 記録は毎回更新（減少時も seen を下げておき、次の増加を正しく検知する）。
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(current)); } catch { /* ignore */ }

    if (isFirst || fresh.length === 0) return;

    // チャンネル作成完了後にスケジュール（既定チャンネルへの無音配信を防ぐ）。
    void initStaffNotify().then(() => {
      const base = Date.now() % 100000;
      return LocalNotifications.schedule({
        notifications: fresh.slice(0, 5).map((n, i) => ({
          id: base + i,
          title: n.title,
          body: n.body,
          channelId: CHANNEL_ID,
        })),
      });
    }).catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
