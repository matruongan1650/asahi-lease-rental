# 機能一覧 / Danh mục chức năng — アサヒリースレンタル・販売

> Tài liệu tham chiếu các **chức năng/tác vụ** của hệ thống, ánh xạ **tính năng → file → luồng → lưu ý (gotcha)**.
> Mục đích: khi **sửa hoặc đọc lại** biết ngay "chức năng này nằm ở đâu, làm gì, dễ sai chỗ nào".
>
> **Cách dùng:** Ctrl-F theo thuật ngữ 日本語 (vd `請求総括表`, `配送フロー`, `在庫台帳`) hoặc tên field/status thật.
> Khi thêm/sửa tính năng lớn, **cập nhật mục tương ứng ở đây**. Tài liệu liên quan: `DB_SCHEMA.md` (cấu trúc bảng `records` + JSON), `AGENTS.md` (quy trình), `docs/BACKEND_SETUP.md`, `docs/STAFF_PUSH_FCM.md`.

---

## 0. Tổng quan & gotcha xuyên suốt (đọc trước khi sửa bất cứ gì)

### Kiến trúc 3 app (chung 1 codebase `src/`)
- **顧客サイト** (khách): store thuê/bán — routes trong `src/App.tsx` (`/`, `/cart`, `/checkout`, `/orders`, `/order/:id`, `/return/*` …).
- **管理画面** (admin): `/admin` (bọc bởi `AdminAuthGate` → `AdminDataProvider` → `AdminDashboard`). 17 trang trong `src/pages/Admin/`.
- **スタッフAPK** (Capacitor Android): entry `src/staff-main.tsx`, build riêng `vite.staff.config.ts`. Màn hình trong `src/pages/Staff/`.

### Đồng bộ dữ liệu — `OrderBus` (⚠️ trục xương sống)
- Mọi dữ liệu (orders, products, users, stockMoves…) đi qua **`src/lib/orderBus.ts`**. `DATA_BACKEND="api"` (`src/lib/dataBackend.ts`) → đồng bộ với VPS PHP+MySQL qua `/api` (`src/lib/backendSync.ts`), **polling `SYNC_POLL_MS=3000ms`**.
- Server lưu 1 bảng `records` (xem `DB_SCHEMA.md`): mỗi record = 1 hàng, dữ liệu ở cột JSON `data`. **Không đổi/xóa key JSON hiện có.**
- Ghi: `OrderBus.push/patch/remove` → hàng đợi → `externalizeImages` (upload ảnh) → `apiUpsert` (có **X-Base-Rev** để khóa lạc quan, 409 = rebase). Đọc: `X-Api-Token`; ghi cần thêm `X-User-Token` (đăng nhập).
- **Ảnh/chữ ký base64 tự động upload lên `/api/upload` → thay bằng URL** (nhẹ record); nếu upload lỗi thì **giữ base64, không mất**.

### 在庫 (kho) — thời điểm xuất/nhập
- **Xuất kho (deduct) tại `受注確定` (status `確認済み`)**, KHÔNG phải lúc giao. **Nhập kho (restock) chỉ sau `最終検品` (再検品) ở kho**, không phải lúc回収. Logic: `src/utils/stockLedger.ts` (`deductOrderStock`, `settleReturnStock`) với cờ chống lặp `stockDeducted`/`stockRestored`.

### 課金・請求 (billing) — quy tắc cốt lõi
- Engine: `src/utils/billing.ts`. **課金開始 = ngày `納品完了`** (`completeDelivery` set `rentalStartDate`=ngày giao + tạo `invoiceBlocks`).
- **`billingEndDate`**: đơn `レンタル中` quá hạn `rentalEndDate` mà chưa trả → **tự gia hạn tới hôm nay** (còn giữ thiết bị thì còn tính) → có thể sinh **block tháng mới**.
- 請求ブロック chia **theo tháng** (`invoiceBlocks[]`, mỗi block 1 `monthPeriod`). Tổng đơn = tổng các block (floor theo từng block).
- **一部返却**: tách đơn; phần trả (hậu tố `-R`) tính tới **ngày一次受付**, không phải最終検品.
- **保証料** `guaranteeFeeFlat`: chỉ tháng đầu; **KHÔNG gộp vào `calculatedPrice`** (đơn giá/point) mà cộng riêng vào `subtotal`.
- 最低課金日数: xe 3 ngày / khác 10 ngày (`getMinDays`, phụ thuộc "đơn có xe không" — `minDaysHasVehicle`). Giảm giá dài hạn từ `LONG_TERM_THRESHOLD_DAYS=17` ngày.

### Chứng từ (帳票) — `DocumentViewer` + `invoiceTemplatesAdmin`
- **請求書 (会社別)**: nút trong `AdminInvoices` → `B2BInvoiceViewer` → `invoiceTemplatesAdmin.ts`: **請求総括表** (liệt kê đơn) + **現場別請求書** (mỗi đơn 1 tờ, lưới `区分/商品名/数量/期間/納品日/日額単価/金額/備考`).
- **請求書 (1 đơn)** trong `DocumentViewer` (nút 表示 / chi tiết đơn khách & staff) **dùng chung `renderOrderInvoicePage`** → giống hệt form công ty.
- **納品書 / 回収書** vẫn là JSX riêng trong `DocumentViewer`.
- **Chữ ký vào đúng file**: 納品書 = `deliverySignature`, 回収書 = `collectionSignature`, 倉庫検品 = `warehouseSignature` (mapping xác nhận đúng ở `DocumentViewer`, `OrderDetail`, `OrderDetailDesktop`).
- **Thông tin công ty & 振込先 = nguồn DUY NHẤT `src/utils/companyInfo.ts`** (`COMPANY`/`BANK`). Sửa 1 chỗ, mọi chứng từ đổi theo.

### Các gotcha khác
- **`SALES_ENABLED=false`** (`src/config/features.ts`) → **レンタル専用**, ẩn mua/bán.
- **Mobile ↔ Desktop**: nhiều trang có 2 bản (`X.tsx` mobile / `desktop/XDesktop.tsx`). **Sửa logic phải đồng bộ CẢ HAI.**
- **IDOR**: xem đơn của người khác bị chặn (`OrderDetail`/`ReturnItems`: chỉ trả đơn khi `userId === currentUser.id`, deny-by-default).
- **ID/orderNumber = mili-giây + random 6** → không rút ngắn (tránh trùng record đã xóa mềm → "hồi sinh").
- **PDF**: `src/utils/pdfMultiPage.ts` (`elementToPdf`/`renderSectionsToPdf`) — A4 794×1123px, html2canvas + jsPDF, tự chia trang.

### Build & Deploy
- **Web** (khách + admin): `npm run build` → `bash deploy_vps.sh` (rsync `dist/` lên VPS `shuyei.online`, giữ `api/config.php` + `api/uploads/`). Verify: `curl https://shuyei.online/api/health.php`.
- **Staff APK**: cần **JDK 21** (`.jdk21/`); `npm run android:apk` (= `android:sync` + `gradlew assembleDebug`) → `android/app/build/outputs/apk/debug/app-debug.apk`. Cài: `adb install -r`. Chi tiết trong memory `staff-apk-build`.
- `npm run lint` = `tsc --noEmit` (chạy trong `build`).

---

---

## Danh sách tài liệu

Chi tiết từng phân hệ ở thư mục [`chuc-nang/`](chuc-nang/):

1. [顧客サイト（お客様向け Web：レンタル/販売ストア）](chuc-nang/01-khach-hang.md)
2. [管理画面：受注・請求・回収・販売](chuc-nang/02-quan-ly-don-hoa-don.md)
3. [管理画面：在庫・倉庫・車両・修理保証・点検](chuc-nang/03-kho-xe-sua-chua.md)
4. [管理画面：マスタ・設定・監査・ダッシュボード](chuc-nang/04-master-cai-dat.md)
5. [スタッフAPK（配送・回収・持込返却・倉庫検品）](chuc-nang/05-staff-apk.md)
6. [課金・請求・在庫台帳エンジン（共通ロジック）](chuc-nang/06-engine-tinh-tien.md)
7. [基盤：データ同期・認証・画像アップロード・バックエンド・デプロイ](chuc-nang/07-ha-tang-dong-bo.md)

> Khi thêm/sửa tính năng lớn: cập nhật file phân hệ tương ứng ở `docs/chuc-nang/`, và nếu đổi hành vi xuyên suốt thì cập nhật §0 ở đây.
