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
import { PushNotifications } from "@capacitor/push-notifications";
import OrderBus from "./orderBus";
import { getUserToken } from "./dataBackend";
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

// ── FCM プッシュ（アプリ完全終了時も届く）────────────────────────────────
// google-services.json 未組込のビルドでは register() が失敗するだけで害はない（従来のローカル通知は継続）。
let _pushInited = false;
let _fcmToken = "";   // 受領済みの FCM トークン（非空 = FCM 配信が有効な印）
let _pushUserId = ""; // 現在の所有者（同一端末での再ログインで更新される）

/** 文字列の短いハッシュ（トークンごとに決定的なレコードIDを作る。同一端末の再登録は upsert になる）。 */
function tokenHash(s: string): string {
  let x = 5381;
  for (let i = 0; i < s.length; i++) x = (((x << 5) + x) + s.charCodeAt(i)) >>> 0;
  return x.toString(36) + s.length.toString(36);
}

/** トークンレコードをサーバーへ upsert（決定的ID = 同一トークンは1行に集約）。 */
function _upsertTokenRecord(): void {
  if (!_fcmToken || !_pushUserId) return;
  OrderBus.push("pushTokens", {
    id: "pt-" + tokenHash(_fcmToken),
    userId: _pushUserId,
    token: _fcmToken,
    platform: "android",
    updatedAt: new Date().toISOString(),
  });
}

/**
 * FCM 登録: 端末トークンを取得し、サーバーの pushTokens ストアへ保存する。
 * サーバー(store.php)は新しい配送/回収/持込ジョブ発生時に全登録トークンへ送信する。
 * ログイン済みスタッフでのみ呼ぶこと。再ログイン（別ユーザー）では所有者だけ更新する。
 */
export async function initStaffPush(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !userId) return;
  _pushUserId = userId;
  if (_pushInited) {
    _upsertTokenRecord(); // 再ログイン: リスナーは再登録せず、行の所有者(userId)だけ更新
    return;
  }
  _pushInited = true;
  try {
    // 既に許可済みなら再プロンプトしない。LocalNotifications と同じ POST_NOTIFICATIONS 権限のため、
    // 二重リクエストで Android の「2回目で恒久拒否」を無駄に消費しない。
    let state = (await PushNotifications.checkPermissions()).receive;
    if (state === "prompt" || state === "prompt-with-rationale") {
      state = (await PushNotifications.requestPermissions()).receive;
    }
    if (state !== "granted") {
      _pushInited = false; // 後から設定で許可された場合に再試行できるよう戻す
      return;
    }
    await PushNotifications.addListener("registration", (t) => {
      const token = t?.value || "";
      if (!token) return;
      // 端末側でトークンがローテーションした場合、旧行は FCM 送信時の UNREGISTERED 掃除で消える。
      _fcmToken = token;
      _upsertTokenRecord();
    });
    await PushNotifications.addListener("registrationError", (e) => {
      console.warn("[push] registration error", e);
    });
    // ユーザートークン(auth.php)が保存されるまで待ってから register する。login の acquireUserToken は
    // 非同期(fire-and-forget)なため、未保存のまま pushTokens を POST すると X-User-Token 無し→403 になり、
    // OrderBus は 4xx を非リトライで破棄する（＝トークンが永久に未登録になる）。最大 ~10秒待つ。
    for (let i = 0; i < 40 && !getUserToken(); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await PushNotifications.register();
    // フォアグラウンド受信は何もしない: アプリ起動中は既存のローカル通知(useStaffNotificationAlerts)が
    // 同内容を鳴らすため、二重通知を避ける。FCM はバックグラウンド/終了時に OS が通知欄へ表示する。
  } catch (e) {
    console.warn("[push] init failed (google-services 未組込ビルドでは正常)", e);
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
export function useStaffNotificationAlerts(notifications: AppNotification[], ready: boolean = true): void {
  // 署名（id + タイトル）が変わった時だけ effect を走らせる。
  const sig = notifications.map((n) => `${n.id}=${n.title}`).sort().join("|");
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // データ未ロード(sync 未接続)の間は seen マップを読み書きしない。起動直後に空→実データで
    // 全件を「新規」と誤検知し、既存ジョブ全部の音を鳴らし直すのを防ぐ(C20)。
    if (!ready) return;

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

    // FCM 有効かつ画面非表示（バックグラウンド）の間は、サーバーの FCM が通知欄に出すため
    // ローカル通知を重ねない（同一ジョブで2回鳴るのを防止）。フォアグラウンドでは FCM は
    // 表示されない（リスナー未登録）ので、従来どおりローカル通知が担当する。
    if (_fcmToken && typeof document !== "undefined" && document.visibilityState === "hidden") return;

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
  }, [sig, ready]);
}
