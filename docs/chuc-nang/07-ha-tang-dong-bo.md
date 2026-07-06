# 基盤：データ同期・認証・画像アップロード・バックエンド・デプロイ

> [← Danh mục chức năng](../CHUC_NANG.md)

Phân hệ nền tảng chung cho cả 3 app (顧客サイト / 管理画面 / スタッフAPK). Mọi dữ liệu đọc/ghi đều đi qua `OrderBus` → HTTP `/api` (PHP + MariaDB), đồng bộ đa client bằng **polling** `SYNC_POLL_MS = 3000ms`. Model lưu trữ là KV/document tổng quát: bảng `records(store, id, data, deleted, rev, updated_at)`.

## OrderBus（クロスタブ + サーバー同期の中核）
- **Làm gì**: Singleton quản lý toàn bộ store dữ liệu client-side; đọc/ghi cục bộ (memory + localStorage), phát tán cross-tab (BroadcastChannel/storage event) và write-through lên `/api`.
- **File**: `src/lib/orderBus.ts` (`OrderBus`, `subscribe/getAll/push/patch/remove/setAll/seedIfEmpty/clear/pendingCount/retryPending/flush/onSyncError`); provider `OrderBusProvider` + hook `useOrderBus`.
- **Luồng / dữ liệu**:
  - Chính bản (正本) đầy đủ (kèm base64 ảnh/chữ ký) nằm trong `_mem[store]`. `localStorage` chỉ là bootstrap khi cold-start và bị lược base64 (`_slimReplacer`) khi vượt quota.
  - `subscribe()` bắn ngay data hiện có rồi khởi động `_startApiPoller()` (1 lần, mọi store dùng chung).
  - Ghi: `push` (thêm mới, prepend, tự sinh `id`=`_generateId()` + `createdAt`), `patch` (merge theo `id` hoặc `firestoreId`, set `updatedAt`), `remove`, `setAll`. Sau ghi cục bộ, nếu `DATA_BACKEND==="api"` và không đang `_applyingRemote` thì gọi `_upsertExternalized(store, id)`.
  - `BusStore` là union type liệt kê ~26 store hợp lệ (`orders`, `products`, `users`, `walkinReturns`, `returnInspections`, `pushTokens`, `auditLogs`, `systemSettings`…).
- **⚠️ Lưu ý**:
  - `_read()` ưu tiên `_mem`; nếu sửa data đừng mutate mảng `_mem` trực tiếp — mọi ghi phải tạo mảng mới (bất biến), nếu không sync sẽ hỏng.
  - `_write()` bỏ qua notify/broadcast khi serialize không đổi (`_lastSerialized`) để chống vòng lặp vô hạn khi callback gọi lại `setAll`.
  - `seedIfEmpty` **luôn trả 0 khi backend = "api"** (server là nguồn chân lý duy nhất, không seed demo lên server chung).
  - `clear()` phải xóa cả `_mem[store]` và `_lastSerialized`, nếu không store "đã xóa" sẽ hồi sinh khi đọc lại.

## サーバー同期ポーリング（_apiTick / rev カーソル）
- **Làm gì**: Vòng lặp poll `/api/sync?since=rev` mỗi 3s để lấy thay đổi tăng dần (incremental) rồi merge vào các store, đồng thời retry các ghi chưa gửi.
- **File**: `src/lib/orderBus.ts` (`_apiTick`, `_startApiPoller`, `_applyRemoteChanges`, `_reloadAuthoritativeSnapshot`); `src/lib/backendSync.ts` (`apiSync/apiList/apiUpsert/apiRemove`); server `public/api/sync.php`.
- **Luồng / dữ liệu**:
  - `_lastRev` là con trỏ; lưu ở `localStorage` key `asahi._rev`. `sync.php` trả `{rev, changes[]}` với mỗi change có `rev` riêng theo record.
  - Nếu `res.rev < _lastRev` → server bị reset/rollback → gọi `_reloadAuthoritativeSnapshot()` (full resync `since=0`).
  - Full resync: `apiList(store)` từng store, **giữ lại** record local đang `pending` mà server chưa có (`_pendingUpserts`), và overlay `_patchUpdates` của mình lên record server để không bị cuộn ngược.
  - `sync.php` giới hạn `LIMIT 5000`; **con trỏ trả về là `maxReturnedRev` thực tế** (không phải MAX toàn server), nếu không sẽ nhảy cóc mất dữ liệu vĩnh viễn.
- **⚠️ Lưu ý**:
  - Trong `_applyRemoteChanges`, change của record đang `_pendingUpserts` bị **skip** (và không advance `_revs`) để "echo trạng thái cũ của server" không đè lên chỉnh sửa local đang bay.
  - Cờ `asahi._synced_v1` = "đã sync lần đầu"; `asahi._cache_slimmed_v1` = "đã lược ảnh do quota" → lần khởi động sau ép `since=0` full resync để lấy lại ảnh, rồi tự xóa cờ khi thành công.

## 楽観的排他（X-Base-Rev / 409 再ベース）
- **Làm gì**: Chống "last-write-wins xóa sạch" khi 2 client sửa cùng record (C29): gửi `X-Base-Rev`; server 409 nếu rev lệch, client re-base "chỉ field mình đổi" lên bản mới nhất của server rồi gửi lại.
- **File**: `src/lib/orderBus.ts` (`_upsertExternalized`, `_patchUpdates`, `_revs`, `_persistRevs`); `src/lib/backendSync.ts` (`ConflictError`, `apiUpsert(...,baseRev)`); server `public/api/store.php` (khối `HTTP_X_BASE_REV`).
- **Luồng / dữ liệu**:
  - `patch()` tích lũy field đã đổi vào `_patchUpdates[pk]`. Chỉ upsert do `patch` (có accumulated patch) + `_revs[pk]` đã biết mới gắn `baseRev`. `push()` cố ý **không** gắn baseRev (ghi đè toàn bộ có chủ đích).
  - Server so `curRev` với `baseRev`; lệch → trả 409 `{rev, deleted, current}`. Client `ConflictError` → merge `{...current, ...mine}` rồi retry trong cùng vòng lặp (tối đa 4 lần), **giữ nguyên in-flight** để không sinh upsert song song.
  - 409 với `deleted=true`/không có `current` → bỏ patch local và xóa record để hội tụ.
  - `_revs` lưu ở `asahi._revs_v1` (debounce 500ms).
- **⚠️ Lưu ý**: Ghi lên **tombstone** (đã soft-delete) kèm baseRev luôn bị coi là conflict kể cả rev khớp — hồi sinh record chỉ được phép qua `push` (ghi đè không baseRev). Lỗi 4xx (quyền) → bỏ luôn pending + `_patchUpdates` để không retry vĩnh viễn; 5xx/mạng → giữ pending để tick sau gửi lại.

## 未送信キューとオフライン再送（pending / flush）
- **Làm gì**: Theo dõi các ghi chưa được server xác nhận để không mất dữ liệu hiện trường khi offline; cho phép app hiện trường chờ đồng bộ xong trước khi đóng job.
- **File**: `src/lib/orderBus.ts` (`_pendingUpserts`, `_inFlightUpserts`, `_retryPendingUpserts`, `pendingCount`, `retryPending`, `flush`, `onSyncError`/`_emitSyncError`).
- **Luồng / dữ liệu**:
  - `_pendingUpserts` (Set key = `store\u0000id`) = ghi chưa xác nhận; `_inFlightUpserts` chống double-send cùng record (retry storm trên mạng chậm).
  - Mỗi tick sync thành công gọi `_retryPendingUpserts()` (chỉ gửi lại record còn tồn tại local).
  - `flush(timeoutMs=8000)` snapshot **chỉ các key pending tại thời điểm gọi**, resolve `true` khi các key này drain, `false` khi có sync error trên chính chúng hoặc timeout.
- **⚠️ Lưu ý**: `flush` phải watch tập con đã snapshot, không xét pending/error toàn cục — nếu không, một `fieldReport` lỗi vô can sẽ làm job vừa hoàn thành bị báo "gửi thất bại".

## 画像・サインの外部化アップロード（externalizeImages / upload.php）
- **Làm gì**: Tách base64 ảnh/chữ ký ra khỏi record, upload thành file lấy URL; record chỉ giữ URL → tránh vỡ quota localStorage, phình sync, "restart mất ảnh".
- **File**: `src/lib/imageUpload.ts` (`externalizeImages`, `uploadDataUrl`, `_deepExternalize`, `hasDataUrl`); server `public/api/upload.php` (+ `public/api/r2.php` dual-write Cloudflare R2).
- **Luồng / dữ liệu**:
  - `_upsertExternalized` gọi `externalizeImages(record)` trước khi upsert; nếu record không đổi (không có ảnh) trả về cùng reference (fast-path, không ghi lại local).
  - `uploadDataUrl` POST `/api/upload` `{dataUrl}` → server whitelist MIME (png/jpg/webp/gif/bmp + pdf/csv/xls/xlsx/doc/docx), đặt tên file = `sha1(bytes).ext` (content-addressed, dedup), trả `{url}`. Có cache `_uploaded` trong phiên chống upload trùng.
  - Server dual-write R2 nếu `r2_config()` có; URL public trả về là R2 khi PUT thành công, ngược lại fallback URL local (`/api/uploads/...`). Host bị fix cứng vào whitelist `shuyei.online` (chống Host header spoof).
- **⚠️ Lưu ý**: `image/svg+xml` và HTML bị **cố ý loại** (chống stored-XSS vì phục vụ cùng origin). Upload lỗi → giữ nguyên base64 (không mất ảnh, chỉ nặng hơn). Giới hạn 20MB.

## バックエンド選択スイッチ・API 設定・トークン注入
- **Làm gì**: Chọn backend đồng bộ và cấu hình endpoint/token cho fetch. Cung cấp helper token và acquire user-token khi login.
- **File**: `src/lib/dataBackend.ts` (`DATA_BACKEND`, `SYNC_POLL_MS`, `API_BASE`, `API_TOKEN`, `apiHeaders`, `getUserToken/setUserToken`, `acquireUserToken`).
- **Luồng / dữ liệu**:
  - `DATA_BACKEND = "api"` (mặc định; các giá trị khác: `"local"` chỉ localStorage). `API_BASE` = `VITE_API_BASE` hoặc `/api` (staff APK inject URL tuyệt đối XServer/VPS lúc build).
  - `apiHeaders()` gắn `X-Api-Token` (=`VITE_API_TOKEN`, shared token cho toàn bundle) và `X-User-Token` (token ký của user, key `asahi.userToken`).
  - `acquireUserToken(loginId,password)` POST `/api/auth.php` khi đăng nhập; **không throw** khi thất bại (fallback tương thích ngược, chạy không token).
- **⚠️ Lưu ý**: `API_TOKEN` nằm trong bundle → có thể trích xuất, nên **không được** dùng làm khóa ký user-token (xem `auth_secret`). Nếu `VITE_API_TOKEN` rỗng thì client không gửi (giả định server cũng tắt xác thực).

## サーバー側 REST 規約（store.php / db.php）
- **Làm gì**: Endpoint dữ liệu chính: GET (list theo store, rev DESC), POST (upsert 1 record), DELETE (soft-delete), PUT bị vô hiệu. Sinh `rev` toàn cục atomic trong transaction.
- **File**: `public/api/store.php`, `public/api/db.php` (`db`, `ensure_schema`, `next_rev`, `require_api_token`, `valid_store`, `json_out`).
- **Luồng / dữ liệu**:
  - `records(store,id,data LONGTEXT,deleted,rev,updated_at)` + `rev_counter`; schema tự tạo lần đầu (`ensure_schema`). `next_rev` dùng `UPDATE ... LAST_INSERT_ID(val+1)`.
  - POST: `INSERT ... ON DUPLICATE KEY UPDATE` với `data=VALUES(data), deleted=0`; DELETE: `UPDATE deleted=1`. **Cả hai bọc trong transaction** cùng lượt `next_rev` để thứ tự commit khớp thứ tự rev (nếu không con trỏ sync có thể nhảy sót).
  - `PUT` (full replace / `apiSetAll`) trả **405 — disabled** (nguy hiểm: chỉ cần shared token là xóa sạch 1 store).
- **⚠️ Lưu ý**: `setAll` phía client **chỉ gửi diff** (upsert record đổi + remove record client này đã xóa), tuyệt đối không full-replace — client khác vừa thêm record sẽ bị xóa oan. Store `orders` bị loại khỏi đường `setAll` (đi qua `push/patch` riêng).

## 認証・ユーザートークン（auth.php / current_user / fail-closed）
- **Làm gì**: Xác thực credentials và phát token ký HMAC để server tin cậy `uid/role` của caller; scope dữ liệu nhạy cảm về đúng chủ sở hữu.
- **File**: `public/api/auth.php`, `public/api/db.php` (`current_user`, `auth_secret`, `is_privileged_role`, `enforce_user_token_enabled`, `is_sensitive_store`, `hash_passwords_enabled`).
- **Luồng / dữ liệu**:
  - `auth.php` khớp `loginId` (email hoặc id, lowercase) phải **đúng 1 record**; verify password (`password_verify` cho bcrypt/argon2, `hash_equals` cho plaintext migration); phát token `base64url(payload).HMAC-SHA256`, payload `{uid, role, exp}` (30 ngày).
  - `current_user()` verify chữ ký bằng `auth_secret()` (config `auth_secret`, chỉ fallback về `api_token` khi chưa set), check `exp`.
  - `store.php`/`sync.php` scope: non-privileged (`customer`/`customer_staff`) chỉ đọc/ghi `orders` của mình (`userId===uid`) và `users` của mình; `returnInspections`/`walkinReturns` chỉ record thuộc order mình sở hữu.
- **⚠️ Lưu ý**:
  - **Bắt buộc set `auth_secret` khác `api_token`** ở production — `api_token` nằm trong bundle, nếu dùng làm khóa ký thì ai có app cũng giả được token `role=admin`.
  - `enforce_user_token` và `hash_passwords` mặc định **false** (fail-open tương thích ngược). Chỉ bật **sau khi** mọi client (web reload + APK mới) đều gửi `X-User-Token` / đã bỏ so sánh plaintext phía client — bật sớm sẽ khóa client cũ. Xoay `auth_secret` buộc mọi người login lại.
  - Ghi `orders`: server **ép** `userId = uid` của người gọi, chặn nâng quyền `role=admin/staff` khi customer sửa `users`. Store `pushTokens`/`auditLogs` luôn fail-closed (chỉ privileged), bất kể cờ.

## 管理画面ゲート（AdminAuthGate）
- **Làm gì**: Bảo vệ lối vào `/admin` bằng 2 lớp: mã truy cập tĩnh → đăng nhập admin (`role==="admin"`).
- **File**: `src/components/AdminAuthGate.tsx` (`AdminAuthGate`, `AccessCodeScreen`, `AdminLoginScreen`); dùng `useUser()` từ `src/context/UserContext`.
- **Luồng / dữ liệu**:
  - Lớp 1: `ADMIN_GATE_CODE` (=`VITE_ADMIN_GATE_CODE`, mặc định `"asahi-admin-2026"`); pass → set `sessionStorage["asahi.admin_gate_v1"]="1"`.
  - Lớp 2: `handleLogin` khớp user theo email/id/`employeeCode`, chặn `inactive`, chặn non-admin, so `password` plaintext rồi gọi `login(target.id, ...)` (đăng nhập bằng `id` duy nhất để tránh fail-closed khi email trùng).
  - `canUseAdmin = currentUser && status!=="inactive" && role==="admin"`. Có auto-restore phiên admin sau khi "代理ログイン" (customer) quay lại `/admin` qua `localStorage["asahi.adminReturnId"]`.
- **⚠️ Lưu ý**: Khi có session (`asahi.sessionUserId`) nhưng `usersLoaded` chưa xong → hiện `AdminLoadingScreen`, **không** đá về màn login (tránh hiểu nhầm "đã logout" khi reload). Login screen vẫn so password plaintext phía client — đây là lý do chưa bật `hash_passwords`.

## AdminDataContext（管理画面のデータ集約と KPI 導出）
- **Làm gì**: Provider subscribe toàn bộ store qua OrderBus cho admin, tính KPI dashboard (doanh thu thuê/bán) từ orders thô.
- **File**: `src/context/AdminDataContext.tsx` (`AdminDataProvider`, `useAdminData`, `useAdminCollection`, `useAdminOrders`); logic KPI ở `src/lib/orderBus.ts` (`deriveAdminData`).
- **Luồng / dữ liệu**:
  - Subscribe `orders` → `raw` + `connected=true`; subscribe mảng `COLLECTIONS` → `cols[name]`. `derived = deriveAdminData(raw)` mỗi khi `raw` đổi.
  - `deriveAdminData`: map ra `DerivedOrder`, sort `byOrderDateDesc`, tách `rentals`/`sales` theo `items[].type` (`rent`/`buy`), tính `rentalSales`/`productSales` **bỏ qua** đơn `キャンセル` và `処理中` (chưa 受注確定).
  - `useAdminOrders` map status hiển thị: giữ nguyên các status vòng đời thuê (`レンタル中`, `一部返却`, `検品待ち`…) thay vì để `staffStatus` (vd `配送完了`) ghi đè.
- **⚠️ Lưu ý**:
  - Seed tự động **đã tắt** (`seedAll` chỉ seed collections phụ qua `seedIfEmpty`, luôn skip khi backend="api"; orders không seed). `getCol` không fallback mock — không có data thật thì hiện rỗng.
  - Trong KPI, `calculatedPrice` là "tổng kỳ hạn cho 1 đơn vị" nên **phải nhân `quantity`**, nếu không doanh thu bị thiếu với qty>1.

## 税率同期（taxSync）
- **Làm gì**: Áp `systemSettings.taxRate` (cấu hình ở admin) vào công cụ tính thuế của module billing.
- **File**: `src/lib/taxSync.ts` (`applyTaxRateFromSettings`); ghi vào `src/utils/billing.ts` (`setTaxRate`). Nạp bằng side-effect import ở `main.tsx`/`staff-main.tsx`.
- **Luồng / dữ liệu**: Đọc record `systemSettings` có `id==="global"`, lấy `taxRate` (số phần trăm), `setTaxRate(pct/100)`. Subscribe `systemSettings` để theo dõi cả thay đổi đến từ server sync.
- **⚠️ Lưu ý**: Chỉ áp khi `0 < pct < 100`; không có/không hợp lệ → giữ mặc định 10% (hành vi không đổi).

## 監査ログ（サーバー記録・audit.php）
- **Làm gì**: Ghi log thao tác bất biến phía server cho các store nghiệp vụ quan trọng; client không ghi/sửa được.
- **File**: `public/api/audit.php` (`audit_log`, `is_audited_store`, `audit_diff`, `audit_label`, `AUDIT_STORES`, `AUDIT_SKIP_KEYS`); gọi từ `store.php` (POST=create/update, DELETE=delete).
- **Luồng / dữ liệu**:
  - Ghi vào store `auditLogs`; **chỉ log khi `user.role==='admin'`** (bỏ qua thao tác của customer/staff). `AUDIT_STORES` = 14 store trọng yếu (orders, products, users, vehicles, roles, systemSettings…).
  - Entry: `{id, store, recordId, recordLabel, action, userId, userRole, changes[], ts}`; `changes` chỉ diff scalar (mảng/object chỉ ghi "（変更）"), bỏ qua `AUDIT_SKIP_KEYS` (ảnh, chữ ký, items…). Update không có diff thực → không ghi (chống noise).
- **⚠️ Lưu ý**: Client POST/DELETE trực tiếp `auditLogs` bị **403** (nội bộ server). Đọc `auditLogs`/`pushTokens` luôn fail-closed (chỉ admin/staff) ở cả `store.php` và `sync.php`. Giữ 90 ngày (cron xóa vật lý — không nằm trong các file này).

## スタッフ APK への FCM プッシュ（fcm.php）
- **Làm gì**: Đẩy thông báo có âm thanh tới staff APK ngay cả khi app bị đóng hẳn, khi phát sinh job mới (配送予定/回収予定/持込返却).
- **File**: `public/api/fcm.php` (`fcm_notify_staff`, `fcm_access_token`, `fcm_load_tokens`, `fcm_remove_token`, `fcm_enabled`); trigger trong `store.php` (khối POST orders/walkinReturns); doc `docs/STAFF_PUSH_FCM.md`. Client-side local notification: `src/lib/staffNotify.ts` (`useStaffNotificationAlerts`, channel `staff-alerts`).
- **Luồng / dữ liệu**:
  - `fcm_enabled()` = có service-account JSON (mặc định `/var/www/shuyei-secrets/fcm-service-account.json`, override qua `config.php['fcm']['service_account']`); không có → **toàn bộ no-op**.
  - Trong POST `orders`: đọc `staffStatus` trước (FOR UPDATE) so với mới — chỉ push khi **chuyển sang** `配送予定`/`回収予定` (không rung mỗi lần edit). `walkinReturns`: chỉ push khi record mới (không phải khi staff cập nhật stage).
  - Response trả về client **trước** rồi mới gửi FCM (`fastcgi_finish_request`/flush) để không làm chậm lượt lưu. Token đích lấy từ store `pushTokens`.
  - OAuth2 access token: JWT RS256 → `oauth2.googleapis.com/token`, cache 55 phút (file per service-account, 0600, atomic rename). 401 → refresh + resend 1 lần.
- **⚠️ Lưu ý**: Chỉ xóa token khi `UNREGISTERED`/HTTP 404 — **không** xóa khi `INVALID_ARGUMENT` (lỗi 400 do payload trả về cho mọi token, sẽ xóa nhầm toàn bộ). `data` phải gửi dạng object (`(object)$dataStr`) vì `[]` → 400. APK khi đóng hẳn chỉ nhận được nhờ FCM này; khi đang chạy/background thì `staffNotify.ts` (local notification) đã xử lý.

## ビルド・デプロイ（Vite scripts / deploy_vps.sh）
- **Làm gì**: Build web (admin+customer) và staff APK, deploy dist lên VPS bằng rsync.
- **File**: `package.json` (scripts), `deploy_vps.sh`, `docs/BACKEND_SETUP.md`; config server `public/api/config.php` (từ `config.sample.php`).
- **Luồng / dữ liệu**:
  - `npm run build` = `tsc --noEmit` (lint) + `vite build` → `dist/` gồm `index.html` + `assets/` + `api/*.php` + `.htaccess` (copy từ `public/`).
  - `npm run deploy` = clean + build + `deploy_vps.sh`; script đọc `.env.deploy` (`VPS_HOST/USER/PATH/PORT`, mặc định path `/var/www/shuyei`) và `rsync -avz --delete`.
  - Staff APK: `build:staff` (vite `vite.staff.config.ts` + đổi tên `index.staff.html`→`index.html`), `android:apk` = sync + `gradlew assembleDebug`. Capacitor app id: `online.shuyei.asahi.staff`.
- **⚠️ Lưu ý**:
  - `deploy_vps.sh` `--exclude 'api/config.php'` và `'api/uploads/'` — **tuyệt đối không** để rsync `--delete` xóa credential DB/secret token và ảnh thật của khách/staff.
  - `config.php` là git-ignored; phải đặt trực tiếp trên server. Health check: `GET /api/health` → `{"ok":true}`. Đặt ở root domain; nếu đặt subdir phải chỉnh `RewriteBase` (`.htaccess`) và `API_BASE`.

---

Ghi chú tương thích ngược quan trọng xuyên suốt phân hệ: nhiều cơ chế bảo mật (`enforce_user_token`, `hash_passwords`) đang **tắt (false)** để không phá client cũ; thứ tự cutover là "cập nhật hết client → mới bật cờ". `auth_secret` phải tách khỏi `api_token` trước khi tin cậy `role` từ token. File tham chiếu chính: `src/lib/orderBus.ts` (client core), `public/api/store.php` + `db.php` + `sync.php` (server core), `public/api/auth.php` (auth), `public/api/upload.php` + `imageUpload.ts` (ảnh), `public/api/fcm.php` + `audit.php` (push/log).
