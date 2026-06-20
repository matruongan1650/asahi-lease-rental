# スタッフアプリの通知（音付き）について

## 実装済み（このAPKに入っている）
- `@capacitor/local-notifications` による**音付きローカル通知**。
- 新しい業務通知（配送予定 / 回収予定 / 持込返却 / 点検要対応 が増えた時）を検知すると、
  端末に音＋ヘッドアップ通知を出す（高重要度チャンネル `staff-alerts`）。
- 実装: `src/lib/staffNotify.ts`（`useStaffNotificationAlerts`）を `StaffDashboard` で使用。
- 初回起動時に通知権限を要求。起動直後の一斉鳴動は抑止（前回表示分は鳴らさない）。

### 動作範囲
- アプリが**起動中** または **バックグラウンド**（ホームに戻った直後など）→ 鳴る。
- アプリを**完全に終了（スワイプで削除）**した状態 → JavaScript が動かないため鳴らない。
  → これには下記の FCM プッシュが必要。

## 完全終了時にも鳴らすには（FCM プッシュ ＝ 要 Firebase）
端末を完全終了していても新着で鳴らすには、サーバー送信型のプッシュ（FCM）が必要です。
これには Google/Firebase 側の資格情報が要るため、こちらでは雛形のみで未設定です。

手順:
1. Firebase プロジェクトを作成し、Android アプリ `online.shuyei.asahi.staff` を登録。
   `google-services.json` を取得して `android/app/` に置く。
2. `npm i @capacitor/push-notifications` し、`npx cap sync android`。
   `android/build.gradle` / `android/app/build.gradle` に google-services プラグインを追加
   （Firebase コンソールの指示どおり）。
3. クライアント: 起動時に `PushNotifications.requestPermissions()` → `register()`、
   `registration` で得たデバイストークンをサーバーへ送る新エンドポイント（例 `/api/push-register.php`）
   に保存。`pushNotificationReceived` を `LocalNotifications` 表示にブリッジ。
4. サーバー: 注文/通知が更新された時（例 `store.php` の orders 更新時）に、保存済みトークンへ
   FCM HTTP v1 でプッシュ送信する処理を追加（FCM サーバーキー／サービスアカウントが必要）。

※ 4 の送信処理を入れるまでは「完全終了時の新着通知」は鳴りません。`google-services.json` 無しで
   `@capacitor/push-notifications` を入れると Android ビルドが失敗するため、本APKには入れていません。
