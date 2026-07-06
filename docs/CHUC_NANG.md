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
## Mục lục

1. 1. 顧客サイト（お客様向け Web：レンタル/販売ストア）
2. 2. 管理画面：受注・請求・回収・販売
3. 3. 管理画面：在庫・倉庫・車両・修理保証・点検
4. 4. 管理画面：マスタ・設定・監査・ダッシュボード
5. 5. スタッフAPK（配送・回収・持込返却・倉庫検品）
6. 6. 課金・請求・在庫台帳エンジン（共通ロジック）
7. 7. 基盤：データ同期・認証・画像アップロード・バックエンド・デプロイ

---

## 1. 顧客サイト（お客様向け Web：レンタル/販売ストア）

> 全ページが `useIsDesktop()` で PC/スマホを分岐する（`Home` → `HomeMobile` / `HomeDesktop` 等）。以下は主にモバイル実装を基準に記述。デスクトップ版は `src/pages/desktop/*Desktop.tsx` にロジックの対応版がある。データ層（Cart/Order/User の各 Context・`OrderBus`）は共通なので、**ロジックを直す時は必ず両方（mobile と desktop）を同期して直すこと**。
> `SALES_ENABLED = false`（`src/config/features.ts`）で運用中＝**レンタル専用**。購入トグル・販売価格・「今すぐ購入」は全ページで非表示。カートに入る `type` は `(!SALES_ENABLED || product.rentPrice) ? 'rent' : 'buy'` で実質常に `'rent'`。

### 商品閲覧・検索（ホーム / カテゴリー / 商品一覧 / 商品詳細）
- **Làm gì**: 商品をカテゴリ・グループ・検索・注目商品で絞って表示し、数量を選んでカートに入れる。商品詳細では日数を入れて概算料金を即時プレビュー。
- **File**: `src/pages/Home.tsx`(`HomeMobile`), `Categories.tsx`(`CategoriesMobile`), `ProductList.tsx`(`ProductListMobile`), `ProductDetail.tsx`(`ProductDetailMobile`); 補助 `src/utils/productUtils.ts`(`getSupplyCategories`,`getCategoryIcon`,`isVehicleCategory`), `src/context/ProductContext.tsx`, `FeaturedContext.tsx`。
- **Luồng / dữ liệu**:
  - `ProductList` は URL クエリで表示内容を切替: `?category=`, `?featured=true`, `?search=`, `?group=supplies`(車両以外) / `?group=vehicles`(車両)。`isVehicleCategory(p.category)` で supplies/vehicles を判定。
  - 保安車両カテゴリは固定5種（`軽トラック`/`軽バン`/`2tノーマル`/`2tロング`/`2t Wキャブノーマル`）をコードにハードコード。保安用品カテゴリは `getSupplyCategories(products)` で商品から動的に生成。
  - `ProductDetail` の料金プレビューは `calculateRentalPrice(rentPrice, start, end, isVeh, isVeh, rentPriceLongTerm)` を使い、`getMinDays(isVeh)` で最低日数（車両3日 / それ以外10日、内部の閾値は billing 側）に切り上げた `totalBilledDays` を表示。長期割引の閾値は `LONG_TERM_THRESHOLD_DAYS = 17`。
- **⚠️ Lưu ý**:
  - 数量入力は `Math.min(stock, ...)` で在庫クランプ。**在庫0のレンタル品はカート不可**（`ProductDetail` の `outOfStockRent`、`ProductList` の `在庫なし` 表示）。ただしカート投入時の `type` はレンタル固定。
  - `ProductDetail` は全フックの後で `if (!product)` 早期 return する（商品リスト未ロード＝クラウド同期前は「読み込み中」、ロード済みで該当なしのみ「見つかりません」。**削除済み/誤URL で先頭商品にフォールバックしない**）。
  - 各一覧ページの「カートに追加」は非ブロッキングの `triggerToast`（連続追加を妨げない）。`rentalDays:1` を仮で入れるが実日数は Checkout で上書きされる。

### カート（Cart / CartContext）
- **Làm gì**: 選択商品を保持し、数量変更・削除・概算合計（税込）を表示。会計へ進む前段。
- **File**: `src/pages/Cart.tsx`(`CartMobile`,`CartItemView`), `src/context/CartContext.tsx`(`CartProvider`,`useCart`)。
- **Luồng / dữ liệu**:
  - `CartItem` は `id/name/image/rentPrice/rentPriceLongTerm/buyPrice/quantity/type/category/unit` 等。`localStorage["cart_v3"]` に永続化（`safeSetJSON`）。`products` 変化時に最新価格を再ハイドレート。
  - 保証料 `guaranteeFeeFlat` はカート表示時に商品マスタの `isGuarantee`/`guaranteeType`(`'flat'`)/`guaranteeRate`/`guaranteeFees.range1〜6`（数量帯 ≤50/≤100/…/≤250/超）から算出し、item に付与。
  - 概算: `totalRentalPrice + totalBuyPrice + totalGuaranteeFee = subtotal`、`tax = Math.floor(subtotal * getTaxRate())`（10%）。カートには**日付がない**ため `calculateRentalPrice` を日付 undefined で呼び、最低日数分の暫定額。
- **⚠️ Lưu ý**:
  - **アカウント切替/ログアウトでカートを空にする**（`CartContext` の `prevUserIdRef` ロジック）。初回マウント（リロード）と `null→実ユーザー`（ユーザーキャッシュ遅延ハイドレーション）は切替扱いにしない。共有端末での誤発注防止なので**安易に消さないよう条件を崩さないこと**。
  - `addToCart`/`updateQuantity`/`setQuantityAmount` は在庫上限クランプ（在庫5に10入れても5に丸め）。StrictMode 二重呼び出しでの二重加算を避けるため mutate せず新オブジェクトで置換。
  - カートの合計は「概算」。**確定額は Checkout の日付選択後**。文言「実際の料金はご利用日数で確定」を消さない。

### チェックアウト（注文情報入力・見積書発行）
- **Làm gì**: 現場情報と各種日付を入力し、日数から確定料金を計算して注文内容を確認画面へ渡す。御見積書PDFも発行できる。
- **File**: `src/pages/Checkout.tsx`(`CheckoutMobile`); 補助 `src/utils/billing.ts`(`calculateRentalPrice`,`getTaxRate`), `src/utils/jpHolidays.ts`(`isBusinessDay`,`nextBusinessDay`,`nonBusinessDayReason`), `src/utils/pdfMultiPage.ts`(`elementToPdf`)。
- **Luồng / dữ liệu**:
  - 入力: `siteName`(現場名/必須), `constructionNumber`(工事番号/必須), `rentalStartDate`, `rentalEndDate`, `deliveryDate`(納品希望日/必須), `deliveryLocation`(必須), `notes`。会社名・担当者名は `profile` から**読み取り専用**（変更不可）。
  - 各明細に `calculateRentalPrice(...)` の結果を格納: `monthlyBreakdown`(月別分割), `calculatedPrice`(1点単価・保証料は含めない), `rentalDays=totalActualDays`, `billedDays=totalBilledDays`。合計は `subtotal(=レンタル+購入+保証料) → tax → total`。
  - `earliestDeliveryDate`: 当日14:00以降は翌営業日から。全日付は営業日（土日祝不可）チェック（`pickBusinessDate`）。`isDateRangeValid` は「開始≤終了」「納品≤開始」「各日付が最短以降＆営業日」を要求。
  - 「注文を確定する」→ `setProfile({...address:deliveryLocation})` 後 `navigate("/checkout-confirm", {state:{orderData}})`。`orderData` に `userId/userEmail/userPhone`(発注アカウント)を同梱。
- **⚠️ Lưu ý**:
  - `isFormValid` は `items` ではなく **`updatedItems`（数量1以上）** で判定（数量0行だけの ¥0 注文の作成防止）。
  - **料金計算・見積PDF は Checkout で完結**。`calculatedPrice` は「1点あたり」なので表示は `× quantity`。**保証料は `calculatedPrice` に含めず `subtotal` に別途加算**（他画面での二重計上に注意）。
  - 見積書PDFは非表示の `estimateRef` テンプレを `elementToPdf` でA4・複数ページ分割。発行前に `isFormValid` を要求。

### 注文確認・確定（CheckoutConfirm / OrderConfirmation / OrderContext.addOrder）
- **Làm gì**: 内容を最終確認して発注を確定し、注文番号を採番して完了画面を表示。
- **File**: `src/pages/CheckoutConfirm.tsx`(`CheckoutConfirmMobile`,`handleOrderConfirm`), `OrderConfirmation.tsx`(`OrderConfirmationMobile`), `src/context/OrderContext.tsx`(`addOrder`,`useOrders`)。
- **Luồng / dữ liệu**:
  - `CheckoutConfirm` は `location.state.orderData` が無ければ `<Navigate to="/cart">`。`addOrder(orderData)` → `clearCart()` → `navigate("/order-confirmation",{state:{order},replace:true})`。
  - `addOrder` が採番: `id = id-<Date.now()>-<rand6>`、`orderNumber = #ORD-<年>-<Date.now()下6桁>`、`date`(ja-JP)、`status="処理中"`。`setOrders` に前置し `OrderBus.push("orders", newOrder)` で **admin/staff へブロードキャスト**。
  - `OrderConfirmation` は `state.order` が無ければ `/orders` へリダイレクト（リロードで空¥0画面を出さない）。
- **⚠️ Lưu ý**:
  - `handleOrderConfirm` に `isSubmitting` 連打ガード（二重注文防止）。失敗時はスピナー解除＋再試行案内。
  - **ID/注文番号はミリ秒＋乱数で採番**（短い乱数だとソフト削除レコードと衝突し `ON DUPLICATE KEY` で「復活」する事故が起きるため。**桁を短くしないこと**）。
  - `OrderConfirmation` の明細は `calculatedPrice` 優先、無ければ最低請求日数（車両3/他10）でフォールバック計算。保証料は `subtotal` に内包されるので別行で明示（`items.reduce(guaranteeFeeFlat)`）。

### 注文履歴（OrderHistory）
- **Làm gì**: 本人の注文を「処理中 / 履歴」タブと検索で表示。ステータスに応じた進捗バーとラベルを描画。
- **File**: `src/pages/OrderHistory.tsx`(`OrderHistoryMobile`,`OrderCard`,`getOrderDisplayProps`); 補助 `src/utils/orderStatus.ts`(`isClosedOrder`), `returnLabels.ts`(`formatStatusWithReturnRequest`), `orderSort.ts`(`byOrderDateDesc`)。
- **Luồng / dữ liệu**:
  - **アカウント分離**: `orders.filter(o => currentUser && o.userId === currentUser.id)`（同一会社の別ユーザーの注文は出さない）。
  - タブ振り分け: 「処理中」= `!isClosedOrder(status) && status!=="一部返却"`；「履歴」= `isClosedOrder(status) || status==="一部返却"`。
  - `PAGE=30` の段階表示（`visibleCount`、「もっと見る」）。ステータスラベルは `formatStatusWithReturnRequest(status, returnRequestType)`（例「検品待ち 一括返却」）。
- **⚠️ Lưu ý**:
  - 完了/キャンセルが「処理中」に残る不具合の対策として**必ず `isClosedOrder` を使う**（`isFullyReturned` は完了/キャンセルを含まないため単独では不十分）。`一部返却` は履歴側に置く特例。

### 注文詳細・期間延長・帳票閲覧（OrderDetail）
- **Làm gì**: 1注文のステータス進捗・基本情報・明細・月別請求内訳・現場/検品写真を表示。レンタル操作（期間延長・返却手続き）と帳票（納品書/請求書/回収書）閲覧の起点。
- **File**: `src/pages/OrderDetail.tsx`(`OrderDetailMobile`,`OrderItem`); 補助 `src/utils/billing.ts`(`getOrGenerateInvoiceBlocks`,`computeExtension`), `extendRental.ts`(`canExtendOrder`,`validateExtensionDate`,`extensionMinDate`,`computeExtension`), `orderStatus.ts`(`isFullyReturned`,`isReturnEligible`), `components/DocumentViewer.tsx`。
- **Luồng / dữ liệu**:
  - **IDOR 対策（重要）**: `isPrivileged = role in {admin,staff}`。非特権は `!!currentUser?.id && !!found.userId && found.userId === currentUser.id` の時のみ `order` を返す（deny-by-default。`undefined===undefined` の素通りを防ぐ）。`ReturnItems` も同一ロジック。
  - ステッパー: `statuses=["ご注文","準備中","配送中","レンタル中","返却・完了"]`、`activeStep`/`statusColor` を status から算出。`isRentalActive`(キャンセル/返却済/完了以外) かつ `hasRentItems` の時のみ「レンタル操作」表示。
  - 期間延長: モーダルで `newEndDate` を入力→`extensionPreview`(useMemo, `computeExtension` で確定と同一計算)→`handleConfirmExtension` が `canExtendOrder`＋`validateExtensionDate` を検証し `updateOrder` で `rentalEndDate/items/subtotal/tax/total/invoiceBlocks` を更新。
  - 返却手続きボタンの表示条件 `canStartReturn = isReturnEligible(status) || status==="検品待ち" || status==="回収中"`（未納品を検品待ちへ送れないように）。
  - 帳票: 納品書は `activeStep>=3` から。請求書は返却済/一部返却/完了 または `blocks.length>0` で表示、複数期あれば月選択モーダル。回収書は返却後のみ。倉庫検品記録は `OrderBus.subscribe("returnInspections")` を購読し、`orderId`/`orderNumber`/`baseNum`(=orderNumber の `-R-` 前) で自注文分を照合表示。
- **⚠️ Lưu ý**:
  - **延長プレビューと確定額は必ず `computeExtension` で同一計算**（ズレ根絶／手動単価按分・入金済み印/手動費用の引き継ぎ込み）。返却手続き中（回収中/検品待ち等）は `canExtendOrder=false` で延長不可（返却中の再課金防止）。
  - 明細行合計は `calculatedPrice × qty`（無い旧注文は `monthlyBreakdown` 合計→`rentPrice×日数` の順でフォールバック）。
  - `月別請求内訳` の block は `getOrGenerateInvoiceBlocks(order)`。`status`=`accumulating/pending/paid`、単価は `Price_A`(通常)/`Price_B`(長期割引)。

### レンタル品返却フロー（ReturnOrders → ReturnItems → ReturnShipping → ReturnConfirmation）
- **Làm gì**: 返却対象注文の選択→返却品目/数量の選択（一括/一部）→返却方法・日付・写真→最終確認→送信。持込は倉庫検品キューへ、集荷はスタッフの回収タスクへ登録する。
- **File**: `src/pages/ReturnOrders.tsx`, `ReturnItems.tsx`, `ReturnShipping.tsx`, `ReturnConfirmation.tsx`(各 `*Mobile`); 補助 `orderStatus.ts`(`isReturnEligible`), `billing.ts`(`calculateRentalPrice`,`getTaxRate`), `lib/orderBus.ts`。
- **Luồng / dữ liệu**:
  - `ReturnOrders`: 本人（`o.userId===currentUser.id`）かつ `isReturnEligible(status)` かつ **未返却レンタル品が残る**(`item.type==='rent' && (returnedQuantity||0) < quantity`)注文のみ列挙。
  - `ReturnItems`: `returnType` = `all`(一括) / `partial`(一部)。`returnQuantities`(item.id→数量) を管理。一部返却は空欄を `-1` センチネルで保持し、`次へ` で `Math.max(0,...)` に正規化して渡す（合計の負値化・+1水増しを防ぐ）。**一部返却は「直接持ち込み」のみ**（業者集荷不可）と明記。
  - `ReturnShipping`: `method` = `direct`(持込) / `pickup`(集荷)。`returnType==="partial"` なら `direct` 固定・pickup ラジオ非表示。返却日レンジは `[rentalStartDate, max(rentalEndDate, 今日)]`（延滞でも本日まで選択可）。状態写真は最大5枚、`readImageAsDataUrl`(base64)で `Promise.allSettled`（1枚失敗で全滅させない）。
  - `ReturnConfirmation.handleSubmit`（核心）:
    - `actualReturnDate = pickupDate || 今日`。各 item を「返却分」「残存分」に割り、返却分は `calculateRentalPrice(..., start, actualReturnDate, ...)`、残存分は `..., start, rentalEndDate, ...` で再計算。
    - **全量返却判定は `totalRemainingQty === 0`（数量ベース）**。価格0品目をリストから落とす実装だと `length` では誤判定するため。
    - `usePickupFlow = (method==="pickup" && returningEverything)` → `updateOrder(status:"回収中", staffStatus:"回収予定", requestedReturn, rentalEndDate:pickupDate, notes に回収リクエスト)`。
    - それ以外（**持込＝全量・一部いずれも**）→ `OrderBus.push("walkinReturns", {... stage:"reception", returningEverything ...})` で倉庫の2段階検品キューへ、注文は `status:"検品待ち"`。
    - 最後に `OrderBus.flush(8000)` でサーバー反映を確認してから成功/送信待ちを出し `/orders` へ。
- **⚠️ Lưu ý**:
  - **返却時点では確定・請求分割しない**。持込は倉庫スタッフの最終検品（`StaffDashboard.completeReturn → finalizePartialReturn`）で確定する。ここで金額を確定させないこと。
  - `walkinReturns` の ID は決定的 `WIN-<英数字化した order.id>`（同時/二重送信を upsert で1件に集約、幽霊伝票・二重 `-R` 注文防止）。**削除→push の順にすると HTTP 競合で新チケットが消える**ため、既存同ID行は push の upsert に任せる。
  - 倉庫が既に一次受付済み（`stage==="recheck"` or `receptionAt` あり）のチケットは、お客様の再提出で上書きさせない（検品結果保護、アラート出して離脱）。
  - `pickup→walkin` / `walkin→pickup` 切替時に旧タスク残渣を掃除する分岐がある（`staffStatus`/`requestedReturn` のクリア、旧 walkin 行の削除）。

### マイページ・個人情報・認証（Profile / PersonalInfo / UserContext）
- **Làm gì**: プロフィール表示とメニュー起点、登録情報（会社名/氏名/メール/電話/住所/アバター）の編集、ログイン/ログアウト。
- **File**: `src/pages/Profile.tsx`(`ProfileMobile`,`ProfileMenuLink`), `PersonalInfo.tsx`(`PersonalInfoMobile`,`handleSave`), `src/context/UserContext.tsx`(`login`,`logout`,`setProfile`,`isEmailTaken`,`addUser`)。
- **Luồng / dữ liệu**:
  - `Profile` メニュー: 個人情報→`/personal-info`、注文履歴→`/orders`、レンタル品返却→`/return`。ロールバッジは `customer`→「企業代表者」、それ以外（`customer_staff`）→「注文担当者」。設定/ヘルプは準備中アラート。
  - `PersonalInfo.handleSave`: 姓名必須、メール形式チェック、`isEmailTaken(email, profile.id)` で重複拒否（重複メールは `login` が fail-closed になり自分がログイン不能になるため）。`customer_staff`(=`isSubUser`)は**会社名を変更不可**（会社マスタ共有項目の破壊防止）。保存後 `OrderBus.flush(8000)` で同期待ちを明示。
  - `UserContext`: users マスタは `OrderBus` の `"users"` ストアが正。セッションは `localStorage["asahi.sessionUserId"]`。`login(loginId,password,allowedRoles?)` は **一致が1件でない（0件/複数）と fail-closed**、空パスワード不可、`inactive` 不可、role 制限。成功時 `acquireUserToken` で署名付きトークン取得。
- **⚠️ Lưu ý**:
  - `profile` はログイン中なら `currentUser`、未ログインは `fallbackProfile`（admin 画面など認証ゲート外を壊さないため）。`setProfile` は既存ユーザーなら `OrderBus.patch("users")` ＋セッション張り直し（Checkout の連絡先更新もこの経路）。
  - **顧客サイトのログインは `customer`/`customer_staff` のみ許可**の想定（`login` の `allowedRoles` は呼び出し側＝認証ゲートで指定）。social/共有プレースホルダメール（`contact@example.com` 等）は `addUser` で一意な `usr-<id>@asahi.local` に置換される。
  - `logout` は次ユーザーへトークンが引き継がれないよう `setUserToken(null)` を必ず呼ぶ。

補足（データ層の共通ゴタチャ、修正時に踏みやすい点）:
- `OrderContext` は `localStorage["order_history_v3"]` へベストエフォート保存。容量超過時は `data:` 大文字列を除いた軽量版で再試行し、それでも失敗すればキャッシュを諦める（**サーバー(MySQL)が正本**、画像は次回ポーリングで再取得）。`setItem` 例外を握りつぶさないと画面全体がクラッシュする。
- `addCustomOrder` は呼び出し側が安定IDを与えればそれを使う（返却分 `-R` 注文は請求ブロックIDを id 基準で発番するため、ここで作り直すと `block-<id>` と `order.id` が食い違い消込が混線する）。返却分も `OrderBus.push("orders")` する（しないと admin 側で `-R` 注文が見えなくなる）。
- ファイルパス（すべて repo-relative）: 上記各 `src/pages/*.tsx` と `src/pages/desktop/*Desktop.tsx`、`src/context/{Order,User,Cart,Product,Featured}Context.tsx`、`src/utils/{billing,orderStatus,returnLabels,productUtils,extendRental,jpHolidays,orderSort,pdfMultiPage}.ts`、`src/lib/orderBus.ts`、`src/config/features.ts`。

---

## 2. 管理画面：受注・請求・回収・販売

Phân hệ admin quản lý toàn bộ vòng đời đơn hàng thuê/bán: nhận đơn → xuất kho → giao/thu hồi → kiểm phẩm → tính tiền theo tháng → phát hành chứng từ (請求書/納品書/回収書). Tất cả dùng chung một engine tính tiền (`billing.ts`) và một sổ tồn kho (`stockLedger.ts`) qua `OrderBus` + `AdminDataContext`.

### 受注・レンタル一覧（4キュー：受注待ち/手配中/稼働中/完了・取消）
- **Làm gì**: Màn hình chính quản lý đơn thuê, chia đơn thành 4 hàng đợi theo `status` và cho phép 受注確定 / 却下 / 稼働開始.
- **File**: `src/pages/Admin/AdminRental.tsx` (`AdminRental`, `handleAccept`, `handleReject`, `handleMoveToActive`, `handleRentalContractCreate`; map `QUEUE_STATUS`, `queueFor`, `toRentalRow`).
- **Luồng / dữ liệu**:
  - Dữ liệu lấy qua `useServerQuery("orders", { hasType:"rent", statusIn: QUEUE_STATUS[queue], q, counts:true, pageSize:50 })` — server filter + paging, không load toàn bộ. Search có debounce 280ms (`searchInput`→`searchQuery`).
  - 受注確定 (`handleAccept`): confirm → resolve đơn live từ `OrderBus.getAll("orders")` → `deductOrderStock(raw)` (xuất kho) → `patchOrder(id, { status:"確認済み", staffStatus:"配送予定", ...flags })`. `staffStatus:"配送予定"` mới đẩy task xuống スタッフAPK.
  - 却下 (`handleReject`): nếu `raw.stockDeducted` thì `settleReturnStock(raw,"キャンセル")` để hoàn kho; nếu chưa xuất thì không động kho. `patch { status:"キャンセル", staffStatus:"" }`.
  - 稼働開始 (`handleMoveToActive`): `status:"レンタル中", staffStatus:"配送完了", deliveryConfirmedAt`. Nếu đơn `確認済み` chưa có `total` (chưa sinh block) thì generate `invoiceBlocks` + tính lại subtotal/tax/total tại đây.
- **⚠️ Lưu ý**:
  - Luôn resolve đơn từ `OrderBus.getAll` trước khi thao tác kho — row trong table có thể stale, dùng row cũ sẽ tính sai flag kho/明細.
  - KHÔNG dùng `staffStatus:"完了"` khi chuyển sang稼働中: nó loại đơn khỏi số "貸出中" của kho ⇒ tồn kho bị thổi phồng. Phải là `"配送完了"`.
  - `queueFor` (dùng để gom badge count từ `statusCounts`) và `QUEUE_STATUS` (dùng để query) phải khớp nhau; sai lệch làm số badge và list không ăn khớp.

### レンタル契約登録（既存・進行中の契約を管理対象に追加）
- **Làm gì**: Modal đăng ký hợp đồng thuê "đầy đủ" (kể cả hợp đồng đã/đang chạy, hoặc bản ghi quá khứ) như một đơn hàng thật.
- **File**: `src/components/AdminRentalRegisterModal.tsx` (tạo draft) → `AdminRental.handleRentalContractCreate` (persist).
- **Luồng / dữ liệu**:
  - Modal liên kết `client_company` users + product master, tự tính `calculateRentalPrice` + `computeGuaranteeFeeFlat` cho từng dòng, trả draft (`items` đã có `calculatedPrice/monthlyBreakdown/guaranteeFeeFlat`).
  - `handleRentalContractCreate`: sinh `orderNumber` (`RN-YYYY-<6 số>`, đảm bảo không trùng với set hiện có) và `orderId` ổn định (`RN-<base36>-<rand>`).
  - Ứng xử kho theo `status`: `返却済/返却済み/完了` = bản ghi quá khứ → KHÔNG động kho, chỉ set `stockDeducted+stockRestored`; `検品待ち` = đã thu hồi chờ kiểm; còn lại `deductOrderStock` (xuất kho). `delivered = status !== "確認済み"`.
  - Chỉ sinh `invoiceBlocks` khi `shouldBill = delivered || isClosedReg`. `確認済み` (chưa giao) KHÔNG tính tiền trước (tránh tính dư trong AR).
- **⚠️ Lưu ý**:
  - `orderId` bắt buộc ổn định/duy nhất: nếu thiếu, `getOrGenerateInvoiceBlocks` phát ID block dạng `block-undefined-YYYY-MM` → đụng độ giữa các đơn cùng tháng ⇒ 一括消込 (bulk消込) lẫn lộn.
  - Kiểm tồn kho trong modal: nếu tổng qty theo product vượt `product.stock` (và status không phải bản ghi quá khứ) thì chặn 登録 (`hasStockShortage`).

### 請求管理（月別請求ブロック一覧・入金消込）
- **Làm gì**: Danh sách từng "block请求 theo tháng" của mọi đơn, cho lọc/sort, đánh dấu 入金済/未入金 (kể cả bulk), theo dõi 延滞.
- **File**: `src/pages/Admin/AdminInvoices.tsx` (`AdminInvoices`, `makeRows`, `updateBlockStatus`, `bulkMarkPaid`, `blockOverdue`, `blockDueDate`, `statusKey`).
- **Luồng / dữ liệu**:
  - Mỗi row = 1 `InvoiceBlock` (đơn nhiều tháng → nhiều row). `makeRows` gọi `getOrGenerateInvoiceBlocks(order)` và **lọc bỏ block có `total===0`**.
  - Đơn `キャンセル`: chỉ giữ block `paid` (đã thu tiền rồi mới hủy) — để không mất bản ghi doanh thu đã thu; các block chưa thu bị loại khỏi AR/延滞.
  - Đánh dấu入金: `updateBlockStatus` sinh lại blocks qua `getOrGenerateInvoiceBlocks(order)`, set `status:"paid"/`"pending"` + `paidAt`, rồi `patchOrder(id, { invoiceBlocks: next })`. Bulk (`bulkMarkPaid`) gom theo `order` và **patch 1 lần/đơn**.
  - 延滞 (`blockOverdue`): chỉ với block `pending` và quá `blockDueDate` = cuối tháng KẾ tiếp của `monthPeriod` (月末締め翌月末払い).
  - Sort header toggle asc→desc→huỷ (`toggleSort`); paging `usePagedList(...,50,...)`.
- **⚠️ Lưu ý**:
  - Ghi入金 luôn phải regenerate blocks từ `getOrGenerateInvoiceBlocks` rồi map, KHÔNG sửa trực tiếp block trong row (row có thể là bản canonical đã inject phí tự động).
  - Checkbox 全選択 chỉ chọn block đang hiển thị (`paged.shown`) và chưa `paid`; đổi filter/paging sẽ clear selection (effect theo `query/company/month/statusFilter`).
  - `payingId` là guard chống double-submit (kể cả `"__bulk__"`); undo入金 (paid→pending) là thao tác phá hủy消込 nên có confirm.

### 請求総括表 / 請求書（総括＋現場別）B2B PDF
- **Làm gì**: Preview + xuất PDF gộp theo công ty cho 1 tháng: 総括表 (bảng tổng hợp mọi đơn), hoặc 内訳 (総括 + từng 現場).
- **File**: `src/components/B2BInvoiceViewer.tsx`; dựng nội dung ở `src/utils/invoiceTemplatesAdmin.ts` (`buildCompanySummary`, `buildCompanyInvoice`, `issueCompanyInvoice`) + `rentalInvoiceGrouping.groupOrdersByCompany`; render PDF `pdfMultiPage` (`renderSectionsToPdf`, `mountOffscreen`).
- **Luồng / dữ liệu**: `AdminInvoices.openB2B` yêu cầu chọn **cả** `selectedCompany` và `selectedMonth` (nếu không có → toast cảnh báo, nút disabled). `type:"summary"` → `buildCompanySummary`; `type:"detailed"` → `buildCompanyInvoice(...).nodes`. Mỗi page render vào element cố định 794×1123px (A4) qua `HTMLElementWrapper`.
- **⚠️ Lưu ý**: `group` được tìm bằng `companyName.trim()` — trùng khoảng trắng/全角 sẽ không match. Build trong `try/catch`; lỗi → `pages=[]` và hiện "対象月の請求データが存在しません".

### レンタル請求書（会社・担当者別）発行セクション
- **Làm gì**: Panel phát hành hóa đơn PDF theo cấp độ: cả công ty / theo担当者 / theo từng đơn / 内訳請求書 (aggregated).
- **File**: `src/components/AdminRentalInvoiceSection.tsx` (`AdminRentalInvoiceSection`, `openPreview`, `RenterRow`); build/issue ở `invoiceTemplatesAdmin.ts`; preview qua `InvoicePreviewModal`.
- **Luồng / dữ liệu**: Group đơn bằng `groupOrdersByCompany(orders, { monthPeriod, companyName })`. Mỗi nút → `openPreview(key,title,build,download)`: set busy → `setTimeout(...,0)` để render "準備中" trước rồi build nặng ở frame sau; download PDF thực hiện trong modal. `RenterRow.amountFor`: có `monthPeriod` thì lấy block đúng tháng, không thì cộng tất cả block (fallback `order.total`).
- **⚠️ Lưu ý**: `busyRef` (useRef) chống double-click — không chỉ dựa `busy` state vì React batch render. Được nhúng cuối `AdminInvoices`, nhận `invoiceOrders` (đơn có items) + filter company/month đang chọn.

### 注文詳細ドロワー（編集・追加費用・帳票）
- **Làm gì**: Drawer xem/sửa 1 đơn: thông tin KH/現場/期間, 明細, 月別請求内訳, 現場記録 (ảnh/chữ ký), nhập/xóa 追加費用, và mở 帳票 PDF.
- **File**: `src/components/AdminOrderDrawer.tsx` (`AdminOrderDrawer`, `handleAddCost`, `handleDeleteCost`, `handleSaveEdit`, `recalcEditDraftTotals`). Dùng chung bởi AdminRental/AdminInvoices/AdminRecovery/AdminSales qua props `onUpdateStatus` / `onUpdateOrder`.
- **Luồng / dữ liệu**:
  - 追加費用: thêm vào `block.extraCosts` rồi `recalculateInvoiceBlock`, ghi lại `invoiceBlocks` + subtotal/tax/total tổng. Xóa phí tự động thì set flag chặn tái tạo: `compensation-charge`→`compensationDismissed`, `delivery-fee`→`deliveryDismissed`, `fuel-refill`→`fuelDismissed`.
  - Sửa đơn (`handleSaveEdit`): chuẩn hóa items (đổi单价 thủ công → gắn `priceOverride`); cấm lưu 0 品目. Tính `billingChanged` theo (期間/actualReturnDate/delivery/chữ ký billing của item). Nếu đổi & đã có blocks → generate `fresh` (với status ép về "一部返却" nếu đơn đã closed) rồi `regenerateBlocksPreservingState` để giữ入金 & 手動追加費用; nếu chưa có blocks (chưa giao) → không chốt `invoiceBlocks`, chỉ tính tổng.
  - Đổi status: **KHÔNG** patch `status` qua `onUpdateOrder`; tách ra `onUpdateStatus` (delegate) để đi qua sổ kho.
  - Email/điện thoại/tên/công ty hiển thị readonly, lấy từ customer master (`order.userId`), fallback snapshot đơn.
- **⚠️ Lưu ý**:
  - Drawer luôn mounted (kể cả order=null) → mọi hook đặt TRƯỚC `if(!order) return null`; state reset theo `order.firestoreId/id/open`.
  - Thứ tự khi đổi status rất quan trọng: nếu patch `status` thành closed TRƯỚC, `resolveLiveOrder` trong `settleReturnStock` thấy "đã closed" ⇒ bỏ lỡ救済入庫 (không hoàn kho). Vì vậy status được delegate riêng.
  - Khi 課金項目 không đổi, tổng phải lấy lại từ block (`getOrGenerateInvoiceBlocks`) vì `recalcEditDraftTotals` bỏ qua `extraCosts` → nếu dùng thẳng sẽ thiếu tiền phí phụ.

### 回収・返却管理（回収手配 / 一部返却 / 一括返却 / 検品履歴）
- **Làm gì**: Quản lý thu hồi và trả hàng, chia 4 view; nút 一括回収完了 chuyển đơn sang chờ kiểm phẩm kho.
- **File**: `src/pages/Admin/AdminRecovery.tsx` (`AdminRecovery`, `handleProcessRecovery`, `isFullReturn`, `isPartialReturn`, `returnedOrders`).
- **Luồng / dữ liệu**:
  - `schedule`: đơn `status ∈ {レンタル中, 進行中, 延滞}` (từ `rentals`).
  - `returnedOrders`: đơn thuê có item qty>0 và có "return signal" (`returnRequestType/actualReturnDate/collectionSignature/collectionPhotos/inspectedByWarehouse/itemIssues` hoặc status thu hồi). `partial` = `returnRequestType==="partial"` hoặc status "一部返却"; `full` = full return & !partial.
  - `検品履歴`: đọc collection `returnInspections` (sort theo `createdAt` desc).
  - 一括回収完了 (`handleProcessRecovery`): guard theo đơn live (chống bấm 2 lần/nhiều máy); set `status:"検品待ち", staffStatus:"回収完了", returnRequestType` (giữ "partial" nếu đang partial) → đơn vào queue 倉庫最終検品 của staff.
- **⚠️ Lưu ý**:
  - **KHÔNG hoàn kho ở bước 回収完了** — theo yêu cầu nghiệp vụ, kho chỉ được cộng lại (良品分) khi 最終検品 hoàn tất (`restoreOrderStock`).
  - Drawer `onUpdateStatus` ở đây luôn dùng `settleReturnStock(raw,status)` với `raw` lấy từ `OrderBus.getAll` (không dùng snapshot render, tránh sót qty/itemIssues).

### 販売受注（確認・出庫準備・書類）
- **Làm gì**: Màn hình đơn bán (`hasType:"buy"`), 4 view (すべて/受注待ち/出庫準備/完了); 受注確定 xuất kho, 却下, tạo 販売契約 & 請求書.
- **File**: `src/pages/Admin/AdminSales.tsx` (`AdminSales`, `handleConfirm`, `handleReject`, `handleDocCreate`; map `SALES_VIEW_STATUS`, `viewFor`, `toSalesRow`).
- **Luồng / dữ liệu**:
  - Query `useServerQuery("orders", { hasType:"buy", statusIn: view==="all"?undefined:SALES_VIEW_STATUS[view], ... })`.
  - 受注確定 (`handleConfirm`): `deductOrderStock(raw)` + `patch { status:"確認済み", staffStatus:"出庫予定", ...flags }` (bán dùng `出庫予定`, khác thuê là `配送予定`).
  - 販売契約作成 (`handleDocCreate` kind `sale-contract`): dựng orderRecord (`items type:"buy"`, `buyPrice`, subtotal/tax bằng `getTaxRate()`), `deductOrderStock` rồi `OrderBus.push("orders", ...)`. `sale-invoice`: `OrderBus.push("issuedInvoices", ...)` (chỉ lưu chứng từ, không tạo đơn).
- **⚠️ Lưu ý**:
  - `SALES_ENABLED=false` (MEMORY) — hệ thống đang chạy レンタル専用; màn này tồn tại nhưng tính năng bán tạm OFF.
  - Drawer `onUpdateStatus`: `"確認済み"`→`deductOrderStock`, còn lại `settleReturnStock` (để đơn hỗn hợp rent/buy vẫn hoàn kho phần thuê khi cancel/return, thống nhất với các màn khác).

### 帳票プレビュー・PDF（納品書 / 回収書 / 請求書）
- **Làm gì**: Xem và tải PDF chứng từ của 1 đơn; đơn thuê nhiều tháng có nhiều 請求書 (mỗi tháng 1 file).
- **File**: `src/components/DocumentViewer.tsx` (`DocumentViewer`, `getInvoiceIssueDate`); 請求書 render bằng `renderOrderInvoicePage` (invoiceTemplatesAdmin) để khớp với B2B PDF; 納品書/回収書 dùng JSX `documentRef` + `elementToPdf`.
- **Luồng / dữ liệu**:
  - `blockId` có → hiển thị đúng tháng đó (`invoiceMonthPeriod=block.monthPeriod`); không có → toàn kỳ. Tổng: có block dùng block; không block & là 請求書 dùng tổng của `allBlocks` (`getOrGenerateInvoiceBlocks`); ngược lại dùng `order.*`.
  - 明細: có block → `calculateMonthlyInvoice(order, block.monthPeriod).items` + `extraCosts` của block; không block → `ensureMonthlyBreakdowns(order)` + extraCosts của `allBlocks`. 保証料 được xen thành dòng riêng ngay sau mỗi item (`初回準備・保証料（...）`).
  - Mobile: scale A4 bằng `zoom` (`fitRef`), nhưng khi chụp PDF trả về等倍 794px để giống điều kiện xuất.
- **⚠️ Lưu ý**:
  - Với 請求書 toàn kỳ (không block), phải dùng tổng của `allBlocks` chứ không phải `order.subtotal/total` — giá trị đó có thể cũ (chưa gồm弁償費/燃料費/配送料 hoặc gia hạn tự động) ⇒ 明細 và 総額 lệch.
  - `getInvoiceIssueDate` = cuối tháng của `actualReturnDate ?? rentalEndDate ?? order.date`.

### レンタル請求書ドキュメント作成ドロワー（AdminDocDrawer）
- **Làm gì**: Drawer form tạo chứng từ generic (販売契約/請求書/納品書/修理 v.v.) với `LineItems`.
- **File**: `src/components/AdminDocDrawer.tsx` (`AdminDocDrawer`, `LineItems`, map `DOC_META`). Chỉ AdminSales dùng (kind `sale-contract`/`sale-invoice`), tính tiền bằng `getTaxRate()`.
- **Luồng / dữ liệu**: `docNo` chỉ đánh **một lần** khi mở (mã `<code>-<6 số cuối timestamp>`); danh sách 顧客 = users `companyType==="client_company"` (store `"customers"` không tồn tại). `submit` chặn 0 品目 (trừ 修理); gọi `onCreate({ id:docNo, kind, lineItems, status, ... })`.
- **⚠️ Lưu ý**: KHÔNG tính `docNo` trong render (trước đây `Math.random()` re-render đổi số → trùng 3-digit → onCreate ghi đè đơn). `LineItem` ở đây là type nội bộ (`{id,name,qty,price}`), khác `items` của order.

### 共通の在庫連動（受注確定=出庫 / 最終検品=入庫）
- **Làm gì**: Mọi thao tác đổi status ở 4 màn đều đi qua sổ tồn kho để giữ nhất quán 現物在庫.
- **File**: `src/utils/stockLedger.ts` (`deductOrderStock`, `restoreOrderStock`, `settleReturnStock`, `resolveLiveOrder`); dùng chung `src/utils/billing.ts` (`getOrGenerateInvoiceBlocks`, `ensureMonthlyBreakdowns`, `calculateMonthlyInvoice`, `regenerateBlocksPreservingState`).
- **Luồng / dữ liệu**:
  - Xuất kho (`deductOrderStock`) chỉ khi 受注確定 (`status→"確認済み"`); idempotent qua flag `stockDeducted` (và `deliveryConfirmedAt` cho data cũ); ghi伝票 `stockOut`, lưu `stockDeductedQty` thực xuất/item.
  - Nhập kho (`restoreOrderStock`): chỉ hoàn 良品 (trừ `itemIssues`), chỉ rent (bán không hoàn), trần hoàn = `stockDeductedQty`; idempotent qua `stockRestored`.
  - `settleReturnStock(order, nextStatus)`: chỉ chạy khi `isClosedOrder(nextStatus)`; chặn closed→closed; **không tự hoàn kho khi cancel đơn đã giao** (`deliveryConfirmedAt`), nhưng pre-delivery cancel thì hoàn cả buy (`includeBuy`).
- **⚠️ Lưu ý**:
  - `getOrGenerateInvoiceBlocks` dùng `order.invoiceBlocks` làm cache (frozen) khi đã có; block đã cache KHÔNG bị tính lại (giữ入金/手動費用/单价 override). Chỉ inject phí tự động (弁償/配送/燃料) nếu chưa có & chưa bị dismiss, và auto append tháng mới cho đơn chưa closed (`appendRolledForwardMonths`, chỉ tới tháng hiện tại).
  - Tính tiền theo tháng dựa `monthlyBreakdown`; 保証料 chỉ tính 1 lần ở tháng đầu; 長期割引 (`Price_B`) khi累計 ≥ `LONG_TERM_THRESHOLD_DAYS` (17 ngày); min charge 車両=3 / 非車両=10 ngày chỉ áp tháng đầu.

Đường dẫn các file chính (absolute):
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/pages/Admin/AdminRental.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/pages/Admin/AdminInvoices.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/pages/Admin/AdminRecovery.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/pages/Admin/AdminSales.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/components/AdminOrderDrawer.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/components/B2BInvoiceViewer.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/components/AdminRentalInvoiceSection.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/components/DocumentViewer.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/components/AdminDocDrawer.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/components/AdminRentalRegisterModal.tsx`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/utils/billing.ts`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/src/utils/stockLedger.ts`

---

## 3. 管理画面：在庫・倉庫・車両・修理保証・点検

> 共通前提: 在庫の唯一の正は **`products.stock`（現物在庫）**。「台帳（ledger）モデル」で管理し、受注確定で減算・倉庫最終検品で加算する（`src/utils/stockLedger.ts`）。全書き込みは `OrderBus`（`src/lib/orderBus.ts`, localStorage + BroadcastChannel + /api sync）経由でクロスタブ同期される。車両連動商品（`vehicleId` 付き / カテゴリが `isVehicleCategory`）は保安用品在庫から必ず除外し二重計上を防ぐ。日時はほぼ全画面で `Date.now() + 9h` して JST 壁時計を得る（`toISOString()` の UTC ずれ対策）。

### 入庫管理（AdminStockIn）
- **Làm gì**: Ghi nhận nhập kho (mua mới / thu hồi trả lại / điều chỉnh) và cộng vào tồn kho thực của sản phẩm.
- **File**: `src/pages/Admin/AdminStockIn.tsx` (component `AdminStockIn`, hàm `saveStockIn(keepOpen)`).
- **Luồng / dữ liệu**: chọn `itemSelect` (từ `supplyProducts` = products đã lọc bỏ vehicle) hoặc `その他 (直接入力)` → nhập `qty`/`type`(`新規購入`/`回収戻し`/`その他`)/`src`(伝票参照)/`staff`. Khi lưu: `OrderBus.push("stockIn", {id:"IN-…", item, qty, date, src, type, staff, seq, icon:"boxIn"})`. Nếu khớp product theo `name` → đọc lại tồn mới nhất (`OrderBus.getAll("products")`) và `patch("products", id, { stock: base + qty })`. Nút「保存して続ける」= `keepOpen=true`.
- **⚠️ Lưu ý**: Khớp product **theo tên (`p.name === itemName`)**, không theo ID — trùng tên sẽ cộng nhầm; item không có trong master (直接入力) chỉ ghi lịch sử, **không** điều chỉnh tồn. `savingRef` chặn double-submit 800ms. Đọc lại tồn "fresh" trước khi ghi để tránh ghi đè lost-update từ tab/thiết bị khác. StatCard `todayCount` tính theo ngày JST.

### 出庫管理（AdminStockOut）
- **Làm gì**: Ghi nhận xuất kho (レンタル/販売) và trừ tồn kho thực; có chặn oversell.
- **File**: `src/pages/Admin/AdminStockOut.tsx` (component `AdminStockOut`, hàm `saveStockOut(keepOpen)`, `handleOpenModal(kind)`).
- **Luồng / dữ liệu**: `actionKind` = `"レンタル"|"販売"` (chọn qua 2 nút). Khi lưu: tìm `match` theo tên → đọc `fresh` stock → nếu `onHand < qty` báo `在庫不足`. Ghi `OrderBus.push("stockOut", {id:"OUT-…", item, qty, date, dst, type:actionKind, staff, icon:"boxOut"})` rồi `patch("products", id, { stock: Math.max(0, onHand - qty) })`. `availableTotal` = tổng `stock` các supplyProducts.
- **⚠️ Lưu ý**: Kiểm tra và trừ tồn dựa trên **`fresh` stock** (không dùng snapshot render `match.stock`) để tránh oversell khi có xung đột với 受注確定. Không có option `その他` cho item (chỉ chọn từ master). `savingRef` chặn double-submit.

### 棚卸（AdminStocktake）
- **Làm gì**: Kiểm kê định kỳ 保安用品 + 保安車両: nhập số thực đếm, so với sổ sách, rồi chốt để ghi đè tồn theo số thực.
- **File**: `src/pages/Admin/AdminStocktake.tsx` (component `AdminStocktake`; `finalizeStocktake()`, `exportCsv()`, `importCsv()`, `handlePhotoUpload/handleFileUpload`).
- **Luồng / dữ liệu**: `baseRows` gộp supply rows (từ products, key = `p.id`) và vehicle rows (key = `vehicle:${v.id}`, system = `v.stock ?? linkedProduct.stock ?? 1`). `countDraft[key]` lưu số thực nhập; `state` = `未確認`(chưa nhập)/`差異なし`/`差異あり`. Khi chốt (`finalizeStocktake`): `OrderBus.push("stocktake", {…items, photos, files, diffItems…})`, rồi với mỗi diffRow: nếu là vehicle → `updateVehicle(vehicleId, { stock })`; nếu supply → `OrderBus.patch("products", productId, { stock })`; luôn `OrderBus.push("stockMoves", {type:"棚卸調整", qty: diff, stocktakeId})`. Tab `history` đọc collection `stocktake`.
- **⚠️ Lưu ý**: Row vehicle **chỉ cập nhật `vehicles.stock`, KHÔNG** ghi vào `products.stock` (nhiều xe cùng trỏ 1 product sẽ phá tồn). Số thực luôn bị sanitize `Math.max(0, Math.trunc())` cả ở nhập tay lẫn `importCsv`. `finalizingRef` chặn double-finalize. Import CSV khớp theo **cột ID = cột 2, cột thực = cột 7 (index 6)**, đối xứng với `exportCsv` (BOM UTF-8 + CRLF). File đính kèm được upload qua `uploadDataUrl` lấy URL (không nhúng base64) để tránh phình record; ảnh `photos` vẫn giữ dataURL (đã resize ≤1280px).

### 倉庫管理（AdminWarehouse）
- **Làm gì**: Tổng quan kho: tồn kho + số đang cho thuê (rented) theo品目/ゾーン/カテゴリ, thao tác nhập/xuất/di chuyển kệ/đặt bổ sung, và quản lý trạng thái xe nhanh.
- **File**: `src/pages/Admin/AdminWarehouse.tsx` (component `AdminWarehouse`; `handleSaveSupplyAction`, `isOutOnRental`, `handleVehicleStatusChange`, `handleSaveItem`).
- **Luồng / dữ liệu**: Tabs `overview/supplies/vehicles/alerts`. `rentedCounts` tính từ `orders`: chỉ đơn thoả `isOutOnRental` (đã `stockDeducted`, chưa `stockRestored`, staffStatus≠完了, status không thuộc `CLOSED_ORDER_STATUSES`) và item `type==="rent"`, qty = `quantity - returnedQuantity`. Mỗi SupplyRow: `available = onHand(=stock)`, `total = onHand + rented`, `status` từ `stockStatus()` (在庫なし/要補充≤3/高稼働≥80%/正常). Thao tác qua `handleSaveSupplyAction(kind)`: `stockIn`/`stockOut` (patch stock + push stockIn/stockOut, type `倉庫入庫`/`倉庫出庫`), `move` (patch `location` + push stockMoves `棚移動`), `reorder` (push stockMoves `補充手配` status `予定`). Thêm品目 mới `handleSaveItem` → push products id `P-<base36>-<rand>`. Drawer đơn hàng dùng `AdminOrderDrawer`; `onUpdateStatus` gọi `deductOrderStock` (khi →`確認済み`) hoặc `settleReturnStock`.
- **⚠️ Lưu ý**: `rented`/`total` là **tính động từ orders**, không lưu — sửa đơn hàng sẽ đổi con số này. Mọi ghi tồn đọc lại `freshProduct` trước để tránh lost-update. `reorder` chặn trùng nếu đã có `補充手配` status `予定`; `handleVehicleStatusChange("整備中")` chặn tạo trùng bản ghi `maintenance` status `予定` (C22). ID product mới dùng high-entropy để tránh đè product cũ. `stockOut` có guard `available` nhưng kiểm tra dựa trên snapshot supply, còn ghi thì dựa `currentStock` fresh.

### 車両管理（AdminVehicles）
- **Làm gì**: CRUD xe bảo an, cảnh báo/cập nhật xe kiểm định (車検), ghi điểm kiểm tra/sửa chữa, đồng bộ product liên kết.
- **File**: `src/pages/Admin/AdminVehicles.tsx` (component `AdminVehicles`; `handleSaveItem`, `handleUpdateVehicle`, `handleSaveVehicleAction`, `handleSetStatus`, `syncLinkedProduct`, `daysUntil`, `makeInspectionAlerts`). Dữ liệu qua `useVehicles()` (`src/context/VehicleContext`).
- **Luồng / dữ liệu**: `vehiclesLive` **tính lại `inspectionDaysRemaining = daysUntil(inspectionDate)` mỗi render** (giá trị lưu không dùng). `stats`: total/inUse/idle/maintenance/`inspectionSoon`(≤30 & ≥0)/`inspectionOverdue`(<0). Thêm xe → `addVehicle` + `syncLinkedProduct` tạo product `P-<id>` (`productId`). Action modal 3 loại (`handleOpenAction`): `maintenance` (push `maintenance` status `完了`, thêm `maintenanceHistory`, **không đổi status vận hành**), `repair` (đặt status `整備中`, push `repairs` status `修理待ち`, thêm `repairHistory`), `inspection` (cập nhật `inspectionDate` + alerts, **không** đụng `insuranceDate`). `handleSetStatus("整備中")` cũng push `maintenance` `予定` (có chặn trùng C22).
- **⚠️ Lưu ý**: `syncLinkedProduct` **KHÔNG BAO GIỜ ghi đè `stock` của product đang tồn tại** (chỉ set stock khi tạo product mới); `vehicle.stock` là mirror cũ, để nó ghi đè sẽ tạo幽霊在庫. `車検` (`inspectionDate`) và `自賠責` (`insuranceDate`) là 2 trường độc lập — cập nhật車検 không được đè保険. Ngưỡng cảnh báo ≤30 ngày dùng thống nhất ở filter/KPI/alert/cột bảng. `handleSaveVehicleAction` chặn lưu nếu `actionDate` trống (tránh auto về hôm nay → false alert). Xoá xe cũng `OrderBus.remove("products", productId)`.

### 定期点検（AdminMaintenance）
- **Làm gì**: Quản lý lịch kiểm tra định kỳ thiết bị: đăng ký, thực hiện điểm kiểm (tự tính ngày kế tiếp), và tự sinh yêu cầu sửa nếu 要修理.
- **File**: `src/pages/Admin/AdminMaintenance.tsx` (component `AdminMaintenance`; `submitInspect`, `handleSaveNew`, `addCycle`, `daysBetween`, `parseSlashDate`). Collection `maintenance`.
- **Luồng / dữ liệu**: `rowsWithDays` tính lại `days = daysBetween(today, next)` mỗi render; `status` = `超過`(days<0)/`期限間近`(≤7)/`正常`/`要修理`/`予定`. Đăng ký (`handleSaveNew`): push `maintenance` với `cycle` (`2週間/1ヶ月/3ヶ月/6ヶ月/1年`), status `予定`. Thực hiện (`submitInspect`): `next = addCycle(doneDate, cycle)`, `patch("maintenance", {last, next, days, status, history})` (history unshift bản ghi `合格`/`要修理`); nếu `要修理` → `OrderBus.push("repairs", {status:"修理待ち", sourceInspectionId})` và toast kèm số RP.
- **⚠️ Lưu ý**: `status` **luôn ưu tiên `days` tính lại**, không short-circuit theo status đã lưu (nếu không, quá hạn vẫn xanh "正常" và bị đếm trùng cả 超過 lẫn 正常). `addCycle` với cycle lạ (`臨時`/`記録` do bên車両 tạo) mặc định +3 tháng để không thành "超過" ngay. Liên kết ngược với repairs qua `sourceInspectionId` (được AdminRepairWarranty đóng lại thành `修理完了`).

### 修理・保証（AdminRepairWarranty）
- **Làm gì**: Quản lý vòng đời yêu cầu sửa chữa (修理待ち→修理中→完了), đăng ký báo giá/nhà thầu, và cập nhật ngược nguồn gốc (現場報告/定期点検).
- **File**: `src/pages/Admin/AdminRepairWarranty.tsx` (component `AdminRepairWarranty`; `submitEstimate`, `submitComplete`, `handleCreateRepair`). Collections `repairs`, `vendors`; drawer `AdminDocDrawer` (kind `repair`).
- **Luồng / dữ liệu**: `REPAIR_STATES` = `修理待ち/見積中/修理中/完了`. `submitEstimate`: bắt buộc `vendor` + cost>0 → `patch("repairs", {vendor, cost, status:"修理中", estimatedAt})`. `submitComplete`: cost≥0 → `patch("repairs", {status:"完了", cost, completedAt, completionNote})`; nếu `sourceReportId` → `patch("fieldReports", {status:"対応済"})`; nếu `sourceInspectionId` → `patch("maintenance", {status:"正常"})` + thêm history `修理完了`. `handleCreateRepair(doc)`: map `doc.customer→asset`, `doc.site→vendor`, `warranty:true`. `totalCostThisMonth` lọc `完了` có `completedAt` bắt đầu bằng `YYYY/MM` (JST) hiện tại.
- **⚠️ Lưu ý**: Trong `handleCreateRepair`, **`customer` = tên tài sản, `site` = tên nhà thầu** (tái dụng form doc, không phải nghĩa gốc). Nút thao tác chỉ hiện khi status≠`完了`. Hoàn tất một repair có nguồn点検 sẽ tự chuyển bản ghi maintenance về `正常` — nếu logic maintenance đổi, phải kiểm tra lại `sourceInspectionId`. Search debounce 280ms (`searchInput`→`searchQuery`).

**File phụ trợ liên quan (không thuộc phân hệ nhưng load-bearing)**: `src/utils/stockLedger.ts` (`deductOrderStock`/`restoreOrderStock`/`settleReturnStock`, cờ `stockDeducted`/`stockRestored`/`stockDeductedQty`), `src/utils/productUtils.ts` (`isVehicleCategory`, `VEHICLE_CATEGORIES`, `getSupplyCategories`, `getCategoryIcon`), `src/context/VehicleContext.tsx` (`useVehicles`, type `VehicleDetail`), `src/context/MobileLiveContext.tsx` (`daysUntil` dùng ở AdminWarehouse).

---

## 4. 管理画面：マスタ・設定・監査・ダッシュボード

### AdminDashboard シェル（タブ制御・権限ゲート・通知）
- **Làm gì**: Khung chính của 管理画面 — sidebar + header + vùng nội dung, điều phối chuyển tab, gate quyền theo role, và popover 通知.
- **File**: `src/pages/Admin/AdminDashboard.tsx` (component `AdminDashboard`), `src/components/AdminSidebar.tsx` (`AdminSidebar`, `menuGroups`, type `AdminTab`).
- **Luồng / dữ liệu**:
  - Tab hiện tại lấy từ URL `?tab=...` qua `useSearchParams` (không phải state) → nút "戻る" của trình duyệt quay lại tab trước; `dashboard` = URL trống. `setActiveTab` gọi `setSearchParams`.
  - `allowedTabs`: tính từ role. `permissionRoleId` (hoặc fallback `admin`/`viewer`) → tìm trong `roleRows` (hoặc `INITIAL_ROLES`) → mảng `perms` 6 phần tử theo `PERM_MODULES` `["概要","保安品・在庫","取引","修理・保証","マスタ","設定"]`; `can(i) = perms[i] !== "なし"`. Map index→tabs qua các lệnh `add(can(0..5), [...])`.
  - Tab yêu cầu không nằm trong `allowedTabs` → fallback về `dashboard` (hoặc tab đầu tiên được phép, `replace: true`).
  - `badgeCounts` (đỏ trên sidebar): `collection`=số đơn quá hạn chưa đóng, `field_report`=報告 chưa xử lý + đơn có `itemIssues`, `vehicles`=xe 車検 quá hạn (tính lại từ `inspectionDate`, không dùng `inspectionDaysRemaining` đã lưu — C25).
  - 通知: `buildAdminNotifications(...)` lọc theo `systemSettings.notify*`; đọc/chưa đọc qua `useNotificationReads("admin")`; click điều hướng qua map `NOTIF_TAB`.
  - ⌘K / Ctrl+K mở `AdminCommandPalette`.
- **⚠️ Lưu ý**: Router-based tabs — đừng thêm state tab song song. `security_goods` là placeholder rỗng (chỉ dẫn sang 商品管理). Thứ tự map quyền trong `add(...)` là load-bearing: sửa một index sẽ đổi quyền của cả nhóm tab.

### 概要ダッシュボード (AdminDashboardHome)
- **Làm gì**: Trang tổng quan: KPI doanh thu/tồn kho/稼働率, lịch làm việc hôm nay, cảnh báo, biểu đồ xu hướng & donut, danh sách chưa thu hồi, so sánh tháng, xếp hạng.
- **File**: `src/components/AdminDashboardHome.tsx` (`AdminDashboardHome`, helpers `splitOrderRevenue`, `itemLineSubtotal`, `parseOrderDate`, `normalizeDateKey`, `isClosedOrder`, `percentChange`).
- **Luồng / dữ liệu**:
  - KPI (`kpis` useMemo): doanh thu loại trừ `status === "キャンセル"`. `splitOrderRevenue` chia total thành `rental`/`sales` theo tỉ trọng subtotal; nếu subtotal=0 thì按分 theo số lượng dòng (rent+buy hỗn hợp → theo count).
  - `activeRentQty`/稼働率: **loại `処理中` và `注文確認中`** (chưa xuất kho, chưa trừ tồn) để tránh đếm 2 lần với tồn kho (C27). `utilizationRate = activeRentQty / (totalStock + activeRentQty)`.
  - `trendData`: 30 điểm ngày / 12 tuần / 6 tháng (`trendRange`), key ngày từ `parseOrderDate`, loại キャンセル.
  - `donutData` (メンテナンス状況): 稼働中 / 点検中 / 修理待ち / 空き在庫; `repairPct` tính trực tiếp từ `repairCount` (không phải phần dư — sửa lỗi hút空き在庫).
  - `todaySchedule`: 配送/回収 chia `Pending`/`Done` bằng các Set `DELIVERY_DONE`/`RECOVERY_DONE`; báo cáo = `fieldReports` chưa xử lý + đơn có `itemIssues`.
  - `alerts`: 延滞レンタル (so `rentalEndDate` với t0 = nửa đêm hôm nay), 現場報告未対応, 在庫不足 (`stock<=3 && >0`), 車検 (`inspectionDate` tính lại `<=30` ngày), メンテ (`days<=7`).
  - Mọi card/alert đều `onNavigate(tab)` sang tab tương ứng.
- **⚠️ Lưu ý**: So sánh ngày luôn dùng mốc nửa đêm (`t0`) + chuẩn hóa `/`→`-` + `T00:00:00`, đừng để lệch ±1 ngày. `isClosedOrder` ở đây định nghĩa cục bộ (`返却済/返却済み/完了/キャンセル`), khác import ở nơi khác — kiểm tra khi đổi status.

### 仕入先管理 (AdminSuppliers)
- **Làm gì**: Quản lý nhà cung cấp (仕入先), tạo đơn đặt hàng mua (発注/purchaseOrders), theo dõi 買掛金 và tài sản mua.
- **File**: `src/pages/Admin/AdminSuppliers.tsx` (`AdminSuppliers`; export dùng chung `KV`, `DetailHead`). Ghi qua `OrderBus`.
- **Luồng / dữ liệu**:
  - `useAdminCollection("suppliers" | "purchaseOrders" | "products")`.
  - **買掛金 là dẫn xuất, KHÔNG lưu tay**: `payableBySupplier` tổng `po.total` các PO **chưa `受領済`**, key theo `supplierId || supplierName`. `supplier.payable` nhập tay bị bỏ qua ở KPI để tránh đếm đôi.
  - 購入資産数 (`assetQtyBySupplier`) cũng cộng từ `po.items[].qty` thực, không dùng `r.assets` tĩnh.
  - Tạo 発注 (`handleCreatePO`): id = `PO-<Date.now() 7 số>-<3 số random>` (tránh trùng làm hỏng KPI); `date` shift +9h (JST); push store `purchaseOrders` với `status:"発注済"`. Không cộng vào `supplier.payable`.
  - Thêm/sửa 仕入先 (`handleSaveSupplier`): id mới `SP-<base36>-<random>`; edit dùng `OrderBus.patch`.
  - Tabs chi tiết: 仕入先情報 / 発注履歴 / 買掛金 (mỗi PO 1 dòng AP) / 購入資産一覧 / 資産保証履歴 — 買掛金・資産 sinh động từ PO, mock đã bỏ.
- **⚠️ Lưu ý**: PO `受領済` được loại khỏi 買掛金 nhưng vẫn tính vào 購入資産. Đừng khôi phục logic cộng `payable` tay. `payableOf`/`assetQtyOf` fallback theo cả `id` lẫn `name`.

### 修理業者管理 (AdminVendors)
- **Làm gì**: Quản lý nhà thầu sửa chữa (vendors) và tạo yêu cầu sửa (repairs) từ trang vendor.
- **File**: `src/pages/Admin/AdminVendors.tsx` (`AdminVendors`; dùng lại `KV`/`DetailHead` từ AdminSuppliers).
- **Luồng / dữ liệu**:
  - `useAdminCollection("vendors" | "repairs")`; số liệu 進行中/累計/保証 tính từ `repairs` lọc theo `r.vendor === sel.name || r.vendorId === sel.id`.
  - Thêm/sửa (`handleSaveVendor`): id mới `V-<Date.now() 5 số cuối>`; edit `OrderBus.patch`.
  - Nút "修理を依頼": thực sự push `repairs` `{ id:"RP-<...>", status:"修理待ち", req: JST local date (sv-SE), warranty:false, ... }` (trước đây chỉ toast, không lưu).
  - Tabs: 修理業者情報 / 修理担当者 / 修理先住所 / 修理履歴 / 修理・保証情報.
- **⚠️ Lưu ý**: 進行中 = `status !== "完了"`. `req` dùng `toLocaleDateString("sv-SE")` (JST local) — không dùng `toISOString()` (lệch ngày ban đêm). Chi tiết resource của repair phải sửa ở tab 修理依頼.

### 設定・権限 (AdminSettings)
- **Làm gì**: 4 tab thiết lập hệ thống: quyền tài khoản, ロール, thiết lập chung (thuế/thông báo/棚卸/công ty), và データ連携 (seed).
- **File**: `src/pages/Admin/AdminSettings.tsx` (`AdminSettings`; sub: `AddUserModal`, `RolePermModal`, `DataSyncTab`, `ToggleRow`, `PermPill`). Hằng `DEFAULT_SETTINGS`, `PERM_MODULES`, `ROLES`.
- **Luồng / dữ liệu**:
  - **アカウント権限** (tab `users`): `systemUsers` = user `companyType==="our_company"` hoặc role `admin`/`staff`. Gán ロール qua dropdown → `updateUser(id,{permissionRoleId})`. `handleToggleUserStatus` bật/tắt `status` `active`/`inactive`. `AddUserModal` tạo social account (`handleAddUser`, mật khẩu auto nếu trống, gán `permissionRoleId` `admin`/`driver`).
  - **ロール設定** (tab `roles`): `roleRows` từ `OrderBus.getAll("roles")` + subscribe; `normalizeRoles` fallback về `INITIAL_ROLES`. `RolePermModal` sửa `perms[]` (`編集`/`閲覧`/`なし`) theo `PERM_MODULES`; lưu `OrderBus.patch/push("roles", ...)`.
  - **一般設定** (tab `general`): `settingsDraft` (từ `DEFAULT_SETTINGS` merge record `id==="global"`); nút 保存 (`handleSaveSettings`) ghi `systemSettings` id `global` qua patch/push. Các cờ: `taxRate`, `invoiceDue`, `notifyVehicle/notifyOverdue/notifyFieldReport`, `requireStaffSignature`, `stocktakeCycle/Tolerance`, `flagStocktakeDiff`, `allowSameDayBefore14`.
  - **データ連携** (`DataSyncTab`): hiển thị đếm store; nút "初期データを投入" gọi `ctx.seedAll()` (chỉ seed store trống).
- **⚠️ Lưu ý**: Có 4 nút 保存 riêng — sửa settings phải bấm 保存 ở panel 会社情報 (nút save nằm ở đó). `perms` là mảng vị trí theo `PERM_MODULES`, index phải khớp `allowedTabs` ở AdminDashboard. `roleUserCount` đếm theo `userPermissionRoleId(u)` (có fallback theo `user.role`).

### 顧客管理 (AdminCustomerManagement)
- **Làm gì**: Quản lý khách hàng B2B: gom user theo công ty, chi tiết công ty (thông tin/ユーザ/工事/レンタル・購入・検品履歴), hợp đồng, đại lý đăng nhập, xuất CSV.
- **File**: `src/components/AdminCustomerManagement.tsx` (`AdminCustomerManagement`; helpers `loadContracts`/`saveContracts`, `showCredentials`).
- **Luồng / dữ liệu**:
  - `customersData`: gom `users` `companyType==="client_company"` theo `companyName` (bỏ tên rỗng), **sort ổn định theo tên** rồi mới đánh `code` `C-100<idx+1>`. **Selection key = `mainUser.id`** (không phải `code`) để đổi tên công ty không làm chọn/sửa/xóa/đại lý đăng nhập trúng nhầm công ty khác.
  - Ghép đơn: chỉ theo `userId` khớp hoặc `companyName` khớp tuyệt đối (đã bỏ fallback trùng tên người để tránh rò rỉ dữ liệu công ty khác).
  - `status`="要確認" nếu `uncollected>0` (đơn rent quá `rentalEndDate` chưa đóng), ngược lại "取引中". `annualTotal`/現場 loại キャンセル.
  - 契約書ファイル: store `contracts` (`useOrderBusStore`), lọc theo `company === selectedCompanyName`; upload giới hạn 10MB, đọc base64 → push; có migration 1 lần từ localStorage cũ theo key công ty.
  - Tabs chi tiết: 会社情報 / ユーザ (thêm 1/一括, reset PW, sửa/xóa) / 工事一覧 (gom theo site, click sang レンタル履歴 lọc sẵn) / レンタル履歴 (filter+CSV) / 購入履歴 / 検品履歴 (từ `itemIssues`: missing/broken).
  - 代理ログイン (`handleLoginAsCustomer`): lưu `asahi.adminReturnId` = admin id vào localStorage rồi `setProfile(mainUser)` + navigate `/` → về `/admin` tự khôi phục admin.
  - Xóa công ty: chặn nếu còn 進行中/未回収; xóa toàn bộ user + 契約書.
  - CSV: BOM `﻿` + chống CSV injection (prefix `'` cho ký tự `=+-@`).
- **⚠️ Lưu ý**: `code` chỉ để hiển thị; đừng dùng làm key logic. Migration契約書 dùng `c.code` cũ nên đổi thứ tự sort có thể ảnh hưởng migration (chỉ chạy 1 lần/thiết bị). Email trùng bị chặn (`isEmailTaken`) vì gây trùng login ID. File này ~2160 dòng — phần đọc ở trên là các tab; các modal add/edit nằm cuối file.

### カレンダー (AdminCalendar)
- **Làm gì**: Lịch tháng tổng hợp lịch 納品/レンタル/返却/点検/車検 từ đơn & tài sản, cộng lịch tùy chỉnh; click sự kiện đơn mở AdminOrderDrawer.
- **File**: `src/pages/Admin/AdminCalendar.tsx` (`AdminCalendar`; helpers `normalizeDateParts`, `dateKey`). Loại lịch: `CAL_TYPES` (delivery/rental/maint/stock/warranty) trong `adminMockData.ts`.
- **Luồng / dữ liệu**:
  - Sự kiện tự sinh: mỗi order → `deliveryDate`(delivery), nếu có item `type==="rent"` thì `rentalStartDate`/`rentalEndDate`(rental) và `actualReturnDate` nếu khác `rentalEndDate`. **Bỏ order `status==="キャンセル"`** (C26 — tránh điều xe cho lịch không tồn tại). Thêm `maintenance`(点検), `vehicles`(車検).
  - Lịch tùy chỉnh: store `calendarEvents` (`useOrderBusStore`, đồng bộ server); `handleAddEvent` push `{date,t,x}`; xóa qua `OrderBus.remove` (chỉ sự kiện `isCustom`). Có migration 1 lần từ localStorage `asahi.custom_calendar_events_v2`.
  - Grid tuần bắt đầu Thứ Hai (`padLeft`), highlight hôm nay. Panel bên phải "今後の予定" (8 mục, từ `startDayForUpcoming`).
  - Modal chi tiết: sự kiện đơn có nút "注文詳細を開く" → `AdminOrderDrawer`. Cập nhật status trong drawer đi qua 在庫台帳: `status==="確認済み"` → `deductOrderStock` (xuất kho), status返却系 → `settleReturnStock` (nhập kho).
- **⚠️ Lưu ý**: Custom event chỉ hiển thị khi thuộc đúng tháng đang xem (so `y/m`). Cập nhật đơn từ calendar **phải** qua stockLedger (`deductOrderStock`/`settleReturnStock`) như AdminRental/AdminWarehouse — đừng patch status thẳng.

### 操作ログ (監査) (AdminAuditLog)
- **Làm gì**: Xem log kiểm toán chỉ-đọc: ai/khi nào/thay đổi gì trên 管理画面; lọc theo store/hành động/từ khóa.
- **File**: `src/pages/Admin/AdminAuditLog.tsx` (`AdminAuditLog`; map `STORE_LABEL`, `FIELD_LABEL`, `ACTION_META`, `fmtJst`).
- **Luồng / dữ liệu**:
  - `useAdminCollection("auditLogs")` — **server (store.php/audit.php) ghi mọi write, chỉ phát cho admin, client không ghi được** → không thể sót/sửa.
  - Record fields: `ts`, `userId` (map sang tên qua `users`), `userRole`, `store`, `action` (`create`/`update`/`delete`), `recordLabel`, `recordId`, `changes[]` (`{field, from, to}`).
  - Filter: `storeFilter` (chỉ list store có mặt), `actionFilter`, `q` (tìm trong label/id/user/changes). Sort mới→cũ theo `ts`. Phân trang client `limit` +200. Cột 変更内容 chỉ hiện với `action==="update"`.
- **⚠️ Lưu ý**: Read-only — không có write ở client. Giữ 90 ngày. `store`/`field` lạ sẽ hiển thị key gốc (map không đủ) — bổ sung vào `STORE_LABEL`/`FIELD_LABEL` khi thêm store/field mới. Chỉ admin nhận được store này.

---
Ghi chú chung cho phân hệ:
- Ghi dữ liệu master/settings/calendar/contracts đều qua `OrderBus` (`push`/`patch`/`remove`, đồng bộ server records), đọc qua `useAdminCollection`/`useOrderBusStore`; đừng lưu localStorage cục bộ (các store đã migrate rời localStorage).
- File chính đọc: `src/pages/Admin/{AdminSuppliers,AdminVendors,AdminSettings,AdminCalendar,AdminAuditLog,AdminDashboard}.tsx`, `src/components/{AdminCustomerManagement,AdminSidebar,AdminDashboardHome}.tsx`; hằng dùng chung: `src/data/adminMockData.ts` (`CAL_TYPES`, `PERM_MODULES`, `ROLES`, `FMT`).

---

## 5. スタッフAPK（配送・回収・持込返却・倉庫検品）

スタッフ用モバイルアプリ（Capacitor APK / Web スタンドアロン）。エントリは `src/staff-main.tsx` → `StaffAuthGate` → `StaffStandaloneApp`（`StaffDashboard.tsx`）。全画面は `MobileLiveProvider`（`src/context/MobileLiveContext.tsx`）配下で、注文/商品/車両などのライブデータを `OrderBus` 経由で購読する。データ層（在庫・請求・返却確定）は共通ユーティリティ（`stockLedger.ts` / `billing.ts` / `returnProcessing.ts`）に委譲する。

### 認証・ルーティング（StaffAuthGate / StaffRoot）
- **Làm gì**: Đăng nhập nhân viên và định tuyến toàn app; chỉ role `staff`/`admin` không bị `inactive` mới vào được. Mọi URL lạ redirect về `/staff`.
- **File**: `src/staff-main.tsx`（`StaffRoot`）, `src/components/staff/StaffAuthGate.tsx`（`StaffAuthGate`, `StaffLoginScreen`）
- **Luồng / dữ liệu**: login bằng email / `id` / `employeeCode` (đối chiếu lowercase). `canUseStaffApp = currentUser && status!=="inactive" && (role==="staff"||"admin")`. `handleLogin` gọi `login(target.id, password)` **bằng `id` duy nhất** (không dùng email).
- **⚠️ Lưu ý**: Khi `usersLoaded` chưa xong, trả "読み込み中" thay vì "アカウントが見つかりません" (tránh false negative lúc khởi động). Dùng `target.id` chứ không phải email để tránh fail-closed khi email trùng. Các màn orphan (StaffJobList/StaffJobDetail/StaffVehicleDetail) đã bị gỡ khỏi route — URL trực tiếp bị `*` redirect về `/staff`.

### MobileLiveContext（ライブデータ層 / job claim）
- **Làm gì**: Provider trung tâm: dẫn xuất danh sách phối/thu hồi từ orders thật, và cung cấp toàn bộ hàm ghi dữ liệu (hoàn tất phối, thu hồi, kho, xe).
- **File**: `src/context/MobileLiveContext.tsx`（`MobileLiveProvider`, `useMobileLive`, `completeDelivery`, `completeRecovery`, `undoRecovery`, `adjustStock`, `setStock`, `addStockMove`, `pushFieldReportsLocal`, `daysUntil`）
- **Luồng / dữ liệu**:
  - `liveDeliveries` (useMemo): chỉ order đã 受注確定 — `status` ∈ `DELIVERY_CONFIRMED_STATUS`(確認済み/準備中/配送予定/配送中) hoặc `staffStatus` ∈ 配送予定/配送中/割当済み; loại `DELIVERY_EXCLUDED_STATUS`.
  - `liveRecoveries` (useMemo): cần `rentalEndDate`, đã giao (`deliveryConfirmedAt` hoặc staffStatus/status sau giao), còn hàng rent chưa trả (`quantity - returnedQuantity > 0`, lọc theo `requestedReturn`), và `daysLeft <= 7` hoặc `staffStatus==="回収予定"`.
  - `isClaimedByOther(o, myId)`: ẩn job đã bị nhân viên khác claim (`claimedBy` ≠ myId) trừ khi quá `CLAIM_TTL_MS`(10h) → hiện lại cho mọi người.
- **⚠️ Lưu ý**: `myId = currentUser?.id` — claim owner PHẢI khớp `currentUser.id`, không dùng `staff.id`/`employeeCode`. `completeDelivery`/`completeRecovery` có guard chống double (kiểm `staffStatus`/`completedDeliveryIdsRef`). `daysUntil` tính theo local nửa đêm (tránh lệch ±1 ngày với admin). Xe/maintenance/walkin chỉ dùng data thật (không seed mock). Các hằng `STAFF`/`DELIVERIES`/`RECOVERIES`/`STOCK_MOVES` chỉ là mock fallback tên (STAFF.souko.name làm reporter mặc định).

### 配送フロー（DeliveryFlow）
- **Làm gì**: 5 bước giao hàng tại công trường: 確認→移動→写真→サイン→完了; ghi chữ ký người nhận, ảnh hiện trường, báo cáo hư/thiếu, và checkout xe bảo an.
- **File**: `src/pages/Staff/DeliveryFlow.tsx`（`DeliveryFlow`, `buildExtra`, `finishDelivery`, `pushDeliveryReports`）
- **Luồng / dữ liệu**: `DLV_STEPS=["確認","移動","写真","サイン","完了"]`. Step 2 bắt buộc `photos.length>0`. Step 3 ký (`SignaturePad`→`signed`) hoặc `absentMode` (受領者不在 + `absentNote`). Xe: `hasVehicleItems` dùng `isVehicleCategory(i.category)` (whitelist) → yêu cầu `vehKm`. `buildExtra()` gói `vehicleCheckout`(fuelFull:true)/`deliveryUnsigned`+`absentReason`/`deliveryIssues`. Hoàn tất gọi `onComplete(o.firestoreId||o.id, signed, photos, extra)` → `ml.completeDelivery(..., {deliveredBy: staff.name})`.
- **⚠️ Lưu ý**: **C1** — nút "サインを確定" (finishDelivery) commit NGAY (clearDraft + pushDeliveryReports + onComplete), không hoãn tới step "次の配送へ" (tránh mất data nếu app bị kill sau khi đã hiện thành công). **C2** — khi restore draft, `step` bị clamp `Math.min(..., 2)` vì photo/sign không lưu draft; nếu không sẽ bỏ qua cổng bắt buộc ảnh. Whitelist xe tránh "車両衝突緩衝材" bị nhận nhầm là xe. `completeDelivery` set `rentalStartDate = ngày giao thực` và chốt `invoiceBlocks`/total (課金 bắt đầu từ đây).

### 回収フロー（RecoveryFlow）
- **Làm gì**: 5 bước thu hồi tại công trường: 確認→移動→スキャン→サイン→完了; quét QR đối chiếu, đếm thực (`counted`), báo thiếu/hư, ký; kết quả kiểm hiện trường được chuyển tiếp sang 最終検品.
- **File**: `src/pages/Staff/RecoveryFlow.tsx`（`RecoveryFlow`, `markScanned`, `markManual`, `confirmSign`, `pushReports`）
- **Luồng / dữ liệu**: `RTN_STEPS=["確認","移動","スキャン","サイン","完了"]`. Mỗi product: `{scanned, counted (init=expected), report, manualConfirm}`. `allScanned` gate step 2. `pushReports` tự thêm report `数量不足`(shortage) và `数量超過`(surplus) từ chênh counted vs expected. `confirmSign` gọi `onComplete(id, signed, photos, prods, buildExtra())` → `ml.completeRecovery(..., staffName, extra)`.
- **⚠️ Lưu ý**: `markScanned`/`markManual` chỉ set **1 dòng chưa scan đầu tiên** khi có nhiều dòng cùng product (tránh 1 lần quét qua cổng tất cả). **C1** — commit ngay khi ký. `completeRecovery` KHÔNG cộng kho/không chốt đơn — chỉ set `status="検品待し"`(検品待ち), lưu chữ ký/ảnh, và đẩy phiếu `walkinReturns` `stage:"recheck"` (`source:"field_recovery"`) mang theo `counted`/`report` hiện trường + `receptionReturnDate = ngày thu hồi` (mốc chốt cước 返却分). `collectionUnsigned` truyền sang recheck để bỏ bắt buộc ký ở kho.

### 持込返却・倉庫検品フロー（WalkInReturnFlow）
- **Làm gì**: Kiểm hàng trả 2 giai đoạn tại kho: 一次受付 (khách mang tới) và 最終検品/recheck (chốt); quét QR, đếm, báo hư/thiếu, ký, và record trả xe + phí nhiên liệu.
- **File**: `src/pages/Staff/WalkInReturnFlow.tsx`（`WalkInReturnFlow`, `pick`, `confirmSign`, `reinspect`, `buildExtra`）; xử lý chốt ở `StaffDashboard.tsx`(`completeReturn`)
- **Luồng / dữ liệu**: `WIN_STEPS=["受付","検品","サイン","完了"]`. Danh sách phân tab: `reception`(stage≠recheck) / `recheck`(stage==="recheck") / `history`(`ml.returnInspections`). `isRecheck = order.stage==="recheck"`. Recheck hiện chữ ký cũ (`priorSignature = receptionSignature||fieldSignature`); nếu `absentNoSign` (collectionUnsigned && không có prior) thì bỏ ký. Xe (recheck): `vehicleCheckin` + `fuelFull`; nếu không đầy → nhập `fuelCost` + ảnh `fuelReceipt` → `extra.fuelCharge`. `reinspect` đẩy lại phiếu `WIN-RE-...` stage recheck với `counted=expected`.
- **⚠️ Lưu ý**: `confirmSign` (step 検品→サイン) tự thêm `数量不足`/`数量超過` vào report rồi push `fieldReports` (source "持込返却") — trước đây chỉ hiển thị "đã gửi" mà không gửi. **C3** — reinspect khởi tạo `counted=expected` (không phải 0) tránh phantom thiếu. `markScanned`/`markManual` chỉ set 1 dòng đầu chưa scan. Step 完了 có xác nhận 2 lần (`confirmingFinal`) trước `onComplete` vì "確定すると在庫・請求に反映され、取り消せません".

### 返却確定処理（completeReturn — 2段階検品の核心）
- **Làm gì**: Xử lý hoàn tất kiểm trả: giai đoạn 一次受付 chỉ chuyển phiếu sang recheck; giai đoạn recheck mới cộng kho, chốt đơn, phát hành hóa đơn + tính đền bù.
- **File**: `src/pages/Staff/StaffDashboard.tsx`（`completeReturn` trong `UnifiedStaffApp`）; gọi `restoreOrderStock`(`stockLedger.ts`), `finalizePartialReturn`(`returnProcessing.ts`), `computeCompensationCharge`(`billing.ts`)
- **Luồng / dữ liệu**:
  - **一次受付** (`walkinOrder.stage!=="recheck"`): patch `walkinReturns` → `stage:"recheck"`, lưu `receptionReturnDate` (YYYY-MM-DD, mốc chốt cước), `receptionSignature`, `fieldInspector`; set `expected = counted`, `counted:0`. KHÔNG cộng kho/chốt đơn.
  - **最終検品** (recheck): `shouldRestock` guard (không cộng nếu chưa xuất kho / đã `stockRestored` / là reinspect). 良品 `goodQtyOf = counted − defective(report không phải 不足/紛失)`. `restoreOrderStock` với budget `stockDeductedQty`. `finalizePartialReturn` chốt: `returnQuantities=counted`, `itemIssues` (missing=clamp theo tồn chưa trả, broken=report khác), `actualReturnDate = receptionReturnDate || today`, `extraFields` (`stockRestored`, `finalInspectedBy/At`, `compensationCharge`, `vehicleCheckin`, `fuelCharge`). Sau đó `OrderBus.remove("walkinReturns")` + push `returnInspections`.
- **⚠️ Lưu ý**: `finalizingRef` chống double-submit (連打 tạo nhiều đơn -R, cộng kho 2 lần). **C1** — missing clamp theo `outstanding = quantity − returnedQuantity` (tránh phantom missing → 過大弁償). Đền bù `computeCompensationCharge` vào `extraFields.compensationCharge`. Nếu `finalizePartialReturn` throw: chỉ set `stockRestored:true` (không đụng items/status) rồi giữ phiếu để re-confirm (`shouldRestock=false` lần sau). Reinspect (`source:"reinspect"`) chỉ ghi record, không restock/finalize lại (**C6**).

### スタッフダッシュボード（ホーム / ジョブ claim / 完了追跡）
- **Làm gì**: Màn chính 5 tab (ホーム/配送・回収/入出庫/点検・車両/マイページ), điều phối mở flow, claim/release job, đếm tiến độ hôm nay, và trạng thái đồng bộ.
- **File**: `src/pages/Staff/StaffDashboard.tsx`（`UnifiedStaffApp`, `startFlow`, `claimJob`/`releaseJob`, `RouteOverview`, `DeliveryRecoveryTab`, `ProfileTab`, `HistoryCard`）
- **Luồng / dữ liệu**: `startFlow`(payload dlv/rtn có order) → `claimJob` (OrderBus.patch `claimedBy=myStaffId`). Sau `completeDelivery`/`completeRecovery` → `releaseJob`. `doneDlv`/`doneRtn` lưu theo key `done:{userId}:{JST date}` (`loadDraft`/`saveDraft`), reset khi qua ngày JST. `pendingSync = OrderBus.pendingCount()` (poll 2s), hiển thị "オフライン"/"送信待ち" + nút `retryPending`. Lịch sử phối/thu suy từ orders (`staffStatus==="配送完了"`/"回収完了" hoặc chữ ký/mốc thời gian), loại `-R-\d+$` (**C25**).
- **⚠️ Lưu ý**: **Thứ tự hooks cố định** — mọi tính toán tổng hợp + `useStaffNotificationAlerts` phải chạy TRƯỚC early-return theo `flow`/`subView`, nếu không React error #300 khi mở flow. `pendingDlvCount`/`pendingRtnCount` đếm bằng filter (không trừ, tránh âm). `totalTasks` cộng completedTasks vào mẫu số (tránh >100%). `resolveOrderId` ưu tiên `rawOrder.id`. **C27** — `RouteOverview.openRoute` lấy đúng 10 điểm đầu (waypoints tối đa 9). Sau `completeDelivery`/`Recovery` gọi `OrderBus.flush(8000)`; nếu fail báo "送信待ち…自動再送".

### 倉庫: 入出庫（WhStock）
- **Làm gì**: Đăng ký nhập/xuất kho thủ công qua quét QR, xem lịch sử, và hủy (取消) phiếu nhập/xuất thủ công.
- **File**: `src/pages/Staff/WarehouseViews.tsx`（`WhStock`, `confirmMove`, `reverseMove`, `canReverse`, `isVehicle`）
- **Luồng / dữ liệu**: `openScan("入庫"|"出庫")` → `ProductQrScanner` → chọn `picked` → `confirmMove`: `applied = isIn ? qty : min(qty, picked.stock)`, gọi `ml.adjustStock(±applied)` + `ml.addMove`. "本日入庫/出庫" chỉ tính phiếu có `date` bắt đầu bằng `todayPrefix`. `reverseMove` tạo phiếu bù chiều ngược + `ref:"取消（{id}）"`.
- **⚠️ Lưu ý**: `movingRef`/`reversingRef` chống double-tap (in kho lặp). `canReverse` chỉ cho phiếu `ref` chứa "手動" và chưa bị hủy (tránh hủy phiếu tự động của stockLedger → phá kho). **C9** — xuất dùng `applied` (clamp tồn) để取消 đối xứng. **C10** — reverse giải product theo `productId` trước; nếu fallback theo tên mà trùng nhiều → hủy thao tác. `adjustStock` clamp `Math.max(0, ...)` (không âm).

### 倉庫: 点検・車両（WhInspect / VehicleDetail）
- **Làm gì**: Quản lý xe: hiển thị/ghi 車検(shaken), bảo hiểm (自賠責/任意), thuế, dầu, lịch sử bảo dưỡng/sửa chữa, và ghi định kỳ 点検 (合格/要整備).
- **File**: `src/pages/Staff/WarehouseViews.tsx`（`WhInspect`, `VehicleDetail`, `recordShaken`, `recordMnt`, `updateVeh`, `setVehStatusLocal`, `vehicleAlerts`, `shakenInfo`）
- **Luồng / dữ liệu**: `shakenInfo(v)` chọn ngày canon (`shaken.next||nextInspectionDate||inspectionDate||next`) và tính lại `days` bằng `daysUntil` (theo hôm nay). `recordShaken` xác nhận rồi patch nested `shaken:{last,next}` + `days`/`inspectionDate`/`nextInspectionDate`. `recordMnt` 合格→dời next theo `cycle`; 要整備→giữ next, `status:"要整備"`. Đổi status gọi `ml.setVehicleStatus` (cập nhật `statusColor` + đẩy maintenance queue nếu 整備中).
- **⚠️ Lưu ý**: Alert dùng field thật, không dùng ngày mặc định (tránh phantom alert cho xe chưa set). Ghi 車検 KHÔNG đổi status vận hành (trước đây ép "使用中"). Nested key phải là object `shaken` (OrderBus merge nông không nhận `"shaken.last"`).残日数 tính theo nửa đêm (tránh ±1 ngày). Tab 法的 dùng `body=` chứ không early-return (nếu không sẽ mất header/back). Tệp đính (車検証...) lưu `{name, dataUrl}`.

### 倉庫: 棚卸し（WhStocktake）
- **Làm gì**: Kiểm kê thực tế qua QR/nhập tay, so `system` (帳簿) vs `counted`, chốt điều chỉnh kho + lưu session + báo cáo hư/thiếu.
- **File**: `src/pages/Staff/WarehouseViews.tsx`（`WhStocktake`, `confirmStocktake`, `initInv`, `INVENTORY_FALLBACK`）
- **Luồng / dữ liệu**: `inv` init từ `ml.products` (loc = `location||bin||shelf||"未設定"`, `system=stock`, `counted:null`). `confirmStocktake` (khi `done`): `diffItems` (counted≠system, loại `EX-`) → `ml.setStock` + `ml.addStockMove` (`棚卸調整(帳簿→実)`) + `ml.recordStocktakeSession` + push `fieldReports` (source 棚卸) cho item có report. Thêm hàng ngoài danh sách qua `EX-` (report `予定外（リスト外）`).
- **⚠️ Lưu ý**: `confirmingStRef` chống double (伝票/session trùng, **C12**). **C14** — `EX-`/hàng chưa giải mã master không tạo phiếu (`setStock` cần targetId). Nút "+ リストにない商品" chỉ hiện sau khi products load (row `EX-` có counted sẽ chặn đồng bộ lần đầu vì điều kiện `every counted===null`).

### 現場フロー・ドラフト退避（flowDraft）
- **Làm gì**: Lưu tạm tiến độ flow (bước/số lượng/report/memo) vào localStorage để khôi phục khi WebView bị hủy (chuyển camera/bản đồ, tiết kiệm bộ nhớ).
- **File**: `src/pages/Staff/flowDraft.ts`（`loadDraft`, `saveDraft`, `clearDraft`）; dùng trong DeliveryFlow/RecoveryFlow + `doneDlv`/`doneRtn`
- **Luồng / dữ liệu**: prefix `asahi.flowDraft.`. Key: `dlv:{id}` / `rcv:{id}` / `done:{userId}:{date}`. `loadDraft` merge vào fallback; `saveDraft`/`clearDraft` nuốt lỗi quota.
- **⚠️ Lưu ý**: **Không lưu ảnh/chữ ký base64** (quota) — chỉ lưu structured data. Vì thế DeliveryFlow phải clamp step ≤2 khi restore. `clearDraft` gọi khi hoàn tất hoặc chủ động hủy (có `confirmDialog` nếu `hasEnteredData`).

### 端末通知・FCM（staffNotify）
- **Làm gì**: Thông báo local (có âm) khi có job mới (配送/回収/持込/点検), và đăng ký FCM token để nhận push cả khi app đã tắt hẳn.
- **File**: `src/lib/staffNotify.ts`（`initStaffNotify`, `initStaffPush`, `useStaffNotificationAlerts`）; init trong `StaffDashboard.tsx`
- **Luồng / dữ liệu**: `useStaffNotificationAlerts(staffNotifications, ml.connected)`: so sánh signature (`id`+title), chỉ rung khi id mới hoặc `countOf(title)` tăng; lưu `SEEN_KEY` (v2, số lượng). `initStaffPush(userId)` chờ `getUserToken()` (tối đa ~10s) rồi `register()`, upsert `pushTokens` (id = `pt-{tokenHash}`).
- **⚠️ Lưu ý**: **Web = no-op** (chỉ chạy khi `Capacitor.isNativePlatform()`). `initStaffNotify` và `initStaffPush` gọi tuần tự (cùng quyền POST_NOTIFICATIONS — song song sẽ đốt "lần 2 = từ chối vĩnh viễn" của Android). **C20** — không rung khi `!ready` (chưa sync) và lần đầu (`SEEN_KEY===null`) chỉ ghi nhận. Khi có FCM token + background (`visibilityState==="hidden"`) thì bỏ local (tránh rung 2 lần). Cần `google-services.json` + server (`store.php`) để FCM thực sự hoạt động.

---

## 6. 課金・請求・在庫台帳エンジン（共通ロジック）

課金計算（日数・長期割引・最低課金日数）、月次請求ブロックの生成・状態保持、返却/延長時の再計算、請求書 PDF 出力、現物在庫台帳（出庫/入庫）を担う共通ロジック層。管理画面・顧客サイト・スタッフAPK の全経路がこれらの純粋関数を共有し、プレビューと確定・表示と請求のズレを防ぐ。

### レンタル料計算エンジン（calculateRentalPrice）
- **Làm gì**: レンタル開始〜終了日から、月ごとに分割した金額内訳・請求日数・実日数を算出する中心関数。1品目1単位あたりの料金を返す（数量は掛けない）。
- **File**: `src/utils/billing.ts` (`calculateRentalPrice`, `daysBetween`, `parseDateLocal`, `getMinDays`, `LONG_TERM_THRESHOLD_DAYS`).
- **Luồng / dữ liệu**: 月境界ごとに `RentalPeriodDetailed{monthStr, days, discounted, price}` を積む。`daysBetween` は両端含み（+1）。累計日数 `cumActual >= LONG_TERM_THRESHOLD_DAYS(=17)` で長期単価 `rentPriceLongTerm`（Tier B）へ切替。最低課金日数（`getMinDays`: 車両=3 / 非車両=10）は**最初の月ブロックのみ**適用。返り値 `{totalPrice, breakdown, totalBilledDays, totalActualDays}`。
- **⚠️ Lưu ý**: 日付が空/不正/end<start のときは「最低課金日数×単価」のプレビュー値を返す（¥0 でなく minDays 分）。`parseDateLocal` はスラッシュ・ゼロ埋め無し（`2026/6/8`）を許容。正規化しないと breakdown 空＝¥0 事故になる。`hasVehicle`（注文全体に車両があるか）と `isVehicleItem` は別引数だが、最低課金日数は前者のみで決まる。

### 課金終了日の決定（billingEndDate）
- **Làm gì**: 請求の締め日を決める。返却済みなら実返却日、期限超過の未返却なら「本日」まで自動延長（＝自動で延長料金が発生）。
- **File**: `src/utils/billing.ts` (`billingEndDate`, `ACTIVE_RENTAL_STATUSES`).
- **Luồng / dữ liệu**: `order.actualReturnDate` があれば最優先。無ければ、status が `ACTIVE_RENTAL_STATUSES`（配送済み/レンタル中/回収予定/回収中）または `staffStatus==="配送完了"` のとき、返却予定日 < 本日 なら本日まで延長。非アクティブ（処理中・キャンセル等）は `rentalEndDate` のまま。
- **⚠️ Lưu ý**: この自動延長は `ensureMonthlyBreakdowns` / `getOrGenerateInvoiceBlocks` 経由で「未確定注文のみ」効く。キャッシュ済みブロックがある確定注文は `appendRolledForwardMonths` が別途当月まで追記する（先取り請求はしない）。

### 月別内訳の補完・上書き整合（ensureMonthlyBreakdowns）
- **Làm gì**: 各品目に `monthlyBreakdown` が無ければ再計算で補完し、管理者の手動単価上書き（priceOverride/calculatedPrice）を月別内訳へ比例配分して整合させる。
- **File**: `src/utils/billing.ts` (`ensureMonthlyBreakdowns`).
- **Luồng / dữ liệu**: `needsRecompute = breakdown空 || !hasCachedBlocks`。未確定注文は `rentPrice + billingEndDate` から常に作り直す（さかのぼり登録・自動延長・月集合変化を反映）。最低課金基準は `order.minDaysHasVehicle`（分割注文で刻んだ凍結値）を優先。`calculatedPrice != null` のとき、breakdown 合計を `calculatedPrice` へスケール（端数は最終月で吸収）。
- **⚠️ Lưu ý**: **確定注文（invoiceBlocks が存在）は frozen**。breakdown が空のときだけ補完し、`calculatedPrice`/`rentalDays`/`billedDays` は既存値を温存する。作り直すと frozen ブロック合計・PDF 明細・手動単価がズレる。元 items は変更せずコピーを返す。

### 月次請求ブロック生成（getOrGenerateInvoiceBlocks）
- **Làm gì**: 注文から月ごとの請求ブロック `InvoiceBlock` 群を生成/取得する。請求書・総括表・AR 集計の全てがこれを基準にする。
- **File**: `src/utils/billing.ts` (`getOrGenerateInvoiceBlocks`, `appendRolledForwardMonths`, `recalculateInvoiceBlock`).
- **Luồng / dữ liệu**: キャッシュ済み（`order.invoiceBlocks` あり）なら再計算せず、数値を丸め直し → `injectCompensationCharge` / `injectDeliveryCharge` で自動費用注入 → `appendRolledForwardMonths` で当月まで追記。未キャッシュなら `ensureMonthlyBreakdowns` → 月集合を作り、各月ブロックを組む。買切品（buy）は `orderMonthKey` の月に計上。`status`: 完了/全量返却=`paid`、当月以降=`accumulating`、過去=`pending`。燃料補給費（`order.fuelCharge`, id=`fuel-refill`）は最終ブロックへ。
- **⚠️ Lưu ý**: `appendRolledForwardMonths` は**append-only**（既存キャッシュ月は不変）でクローズ注文は凍結。追記は「当月まで」に限定し将来月を先取りしない。追記中間月には自動費用を二重計上しないよう除去する。`orderMonthKey` は `slice(0,7)` を使わず正規表現で "YYYY-MM" を作る（`2026/6/8` でも壊れない）。

### 請求ブロックの再計算（recalculateInvoiceBlock）
- **Làm gì**: 1 ブロックの `subtotal/tax/total` を、基本額＋保証料＋追加費用（課税/非課税）から再計算する。
- **File**: `src/utils/billing.ts` (`recalculateInvoiceBlock`).
- **Luồng / dữ liệu**: 課税対象 = `baseSubtotal + guaranteeFee + 課税ExtraCost`。税額 = `Math.trunc(課税額 × getTaxRate())`。`subtotal` は全 ExtraCost（非課税含む）合算、`total = 課税額 + 非課税ExtraCost + tax`。
- **⚠️ Lưu ý**: 税は `Math.floor` ではなく **`Math.trunc`**（0方向切り捨て）。値引/返金でマイナス課税額が混ざるブロックで floor だと ¥1 過大控除になる。正値では floor と同値。

### 入金状態・手動費用の引き継ぎ（regenerateBlocksPreservingState）
- **Làm gì**: 返却・延長・編集でブロックを作り直しても、admin が付けた入金済み印と手動追加費用を月ごとに引き継ぎ、過少請求・二重請求を防ぐ。
- **File**: `src/utils/billing.ts` (`regenerateBlocksPreservingState`, `AUTO_EXTRA_COST_IDS`).
- **Luồng / dữ liệu**: 旧ブロックを `monthPeriod` で突合。手動 ExtraCost（`fuel-refill`/`compensation-charge`/`delivery-fee` **以外**）を新ブロックへ再付与（同 id は二重付与しない）→ `recalculateInvoiceBlock`。`status`/`paidAt` を継承（`opts.closing=true` なら継承しない＝新サイクル未入金）。新スパンから消えた月の手動費用は最後の新ブロックへ退避。
- **⚠️ Lưu ý**: 返却/延長の確定経路では**必須**（呼ばないと入金済み月が未収に戻る・手動費用が消える）。closing フラグはクローズ遷移時のみ true。新スパンが空だと退避先が無く手動費用を失う → 警告 console.warn を出す。入金済み月が消えると警告する。

### 弁償費・配送料の自動注入（injectCompensationCharge / injectDeliveryCharge）
- **Làm gì**: 破損・紛失の弁償費と配送料を請求ブロックへ ExtraCost として計上する（請求漏れ防止）。
- **File**: `src/utils/billing.ts` (`computeCompensationCharge`, `injectCompensationCharge`, `injectDeliveryCharge`).
- **Luồng / dữ liệu**: `computeCompensationCharge(order, products)` は `order.itemIssues`（missing/broken）× 単価（`compensationPrice ?? buyPrice ?? item.buyPrice`）で算出、報告数量はレンタル数量を上限にクランプ。結果を `order.compensationCharge` に保存（最終検品時に固定）。弁償費（id=`compensation-charge`）は最終ブロック、配送料（`order.delivery`, id=`delivery-fee`）は**先頭ブロックのみ**へ注入。
- **⚠️ Lưu ý**: いずれも冪等（既にあれば再追加しない＝admin の金額編集を保持）。admin が削除した場合は `compensationDismissed` / `deliveryDismissed` / `fuelDismissed` フラグで再注入を抑止（削除の尊重）。配送料は複数月で二重計上しないよう先頭のみ。

### 現物在庫台帳：出庫（deductOrderStock）
- **Làm gì**: 受注確定時にレンタル品・販売品の現物在庫（`products.stock`）を減算し、出庫伝票（stockOut）を残す。
- **File**: `src/utils/stockLedger.ts` (`deductOrderStock`, `adjustProductStock`, `resolveLiveOrder`, `wasDeducted`).
- **Luồng / dữ liệu**: `resolveLiveOrder` で OrderBus 上の最新注文を解決し `stockDeducted`/`stockDeductedAt` を先に patch（連打ガード）。品目ごとに `adjustProductStock(-qty)`。実際に引けた分を `it.stockDeductedQty` に記録（過剰受注で 0 クランプされた分を返却時に水増ししないため）。stockOut 伝票に `qty=actual` を push。
- **⚠️ Lưu ý**: 冪等（`stockDeducted` または旧データの `deliveryConfirmedAt` で二重減算防止）。`products` に無い品目（車両等）は在庫対象外で `stockDeductedQty=0` を明示記録（これが無いと戻し時に quantity フォールバックで幽霊在庫が発生）。在庫不足のまま確定すると console.warn。返り値のフラグは呼び出し側で注文へマージする必要がある。

### 現物在庫台帳：入庫（restoreOrderStock / settleReturnStock）
- **Làm gì**: 倉庫最終検品時に**良品分のみ**在庫へ加算し入庫伝票（stockIn）を残す。回収完了だけでは戻さない。
- **File**: `src/utils/stockLedger.ts` (`restoreOrderStock`, `settleReturnStock`, `issuesByItemId`).
- **Luồng / dữ liệu**: 戻し量 = `min(stillOut, stockDeductedQty予算) - issues[id]`（`stillOut = quantity - returnedQuantity`）。紛失・破損分（issues）と販売品は戻さない。`opts.collect` に品目別の実戻し数を積算（部分返却の draw-down 用）。`settleReturnStock` は未クローズ→クローズ初回遷移でのみ在庫を動かす救済経路。
- **⚠️ Lưu ý**: 冪等（未出庫なら何もしない・`stockRestored` 済みは二重加算しない）。**戻し上限は quantity ではなく `stockDeductedQty`**（過剰受注 0 クランプ分を戻さない）。商品が見つからず戻せない分は collect に積算しない（幽霊減算防止）＋console.warn。`settleReturnStock`: 納品済み（`deliveryConfirmedAt` あり）のキャンセルは在庫を戻さない（倉庫に無い在庫の水増し防止）。納品前キャンセル（出庫取消）のみ `includeBuy` で販売品も戻す。closed→closed 遷移は在庫を動かさない。

### 返却分割の計算・確定（computeReturnSplit / finalizePartialReturn）
- **Làm gì**: 返却数量から「返却分／残存分」の品目リストと金額を計算（純粋関数）し、注文へ確定する。全量返却は元注文を返却済へ、一部返却は残存へ更新＋返却分を別注文（-R）として作成。
- **File**: `src/utils/returnProcessing.ts` (`computeReturnSplit`, `finalizePartialReturn`, `prorateOverride`).
- **Luồng / dữ liệu**: 返却数は貸出中残数（`quantity - returnedQuantity`）を上限にクランプ。紛失（missing）分は残存レンタルから除外（課金停止＋弁償費との二重課金防止）、破損（broken）は返却数に含む。返却分の金額は `calculateRentalPrice(..., actualReturnDate)`、残存分は元の `rentalEndDate` まで。手動単価は `prorateOverride` で日数比按分（早期返却で値引きが標準価格に戻り過大請求になるのを防ぐ）。確定時は `regenerateBlocksPreservingState` で入金状態を引き継ぎ、注文合計は `sumBlocks`（ブロック合計＝弁償費含む）から取る。
- **⚠️ Lưu ý**: ブロック生成は必ず「未クローズ（一部返却）」ステータスで行う（返却済で生成すると全ブロック `status:"paid"` で生まれ AR/延滞に出ない＝C8）。保存自体は返却済のまま。保証料（`guaranteeFeeFlat`）は継続側のみ、-R 側は 0（二重計上防止＝C15）。itemIssues は -R 注文のみに載せる（継続注文に載せると二重弁償請求）。継続注文は `staffStatus="配送完了"` に戻す（回収一覧から消えないよう＝C23/C5）。-R 注文には安定 `id` と `orderNumber=${orderNumber}-R-${タイムスタンプ下6桁}` を付与（ブロック id 衝突・混線防止）。継続注文は `restockedByItem` で `stockDeductedQty` を draw-down（複数回部分返却の over-restock 防止）。

### 期間延長（computeExtension / canExtendOrder）
- **Làm gì**: レンタル終了日の延長で items・請求ブロック・合計を再計算する（純粋関数、保存しない）。プレビューと確定が同じ関数を使い金額ズレを根絶。
- **File**: `src/utils/extendRental.ts` (`computeExtension`, `canExtendOrder`, `validateExtensionDate`, `extensionMinDate`).
- **Luồng / dữ liệu**: `canExtendOrder`: `isReturnEligible` かつ `requestedReturn` に集荷依頼が無く rent 品目がある。`validateExtensionDate`: 現在の終了日以降、かつ延滞中は本日以降のみ。`computeExtension`: 各 rent 品目を `calculateRentalPrice(..., newEndDate)` で再計算、手動単価は `prorateOverride`、`regenerateBlocksPreservingState` で入金状態継承、合計はブロックがあればブロック合計を採用。
- **⚠️ Lưu ý**: 返却手続き進行中（回収中/検品待ち/`requestedReturn` あり）は延長不可（E6）。延滞注文を本日より前へ延長できない（請求済みブロックと明細の不一致防止＝P1）。最低課金基準は `order.minDaysHasVehicle` 優先（分割注文で 3⇔10 がブレない＝P2/C9）。

### 請求書グルーピング（groupOrdersByCompany）
- **Làm gì**: 注文を「会社 → 担当者（renter）→ 注文」の階層に集計し、各層の小計・税・合計・保証料を算出する。請求総括表・請求書 PDF の入力。
- **File**: `src/utils/rentalInvoiceGrouping.ts` (`groupOrdersByCompany`, `orderSubtotal`, `aggregateTotals`, `normalizeName`).
- **Luồng / dữ liệu**: `companyNameOf` / `personNameOf` は `normalizeName`（全角スペース→半角・連続空白統合）で名寄せ。金額は `getOrGenerateInvoiceBlocks` の合計。`monthPeriod` 指定時はその月ブロックを持つ注文/担当者/会社のみ収集。ソートは会社名・担当者名の ja ロケール順。
- **⚠️ Lưu ý**: **キャンセル注文は請求対象外**（`status==="キャンセル"` を skip）。`safeBlocks` は items 未定義や生成例外を握りつぶして空配列を返す（PDF 生成が落ちない）。ブロックが無い注文は `o.subtotal/tax/total` と品目の `guaranteeFeeFlat` からフォールバック集計。

### 請求書 PDF テンプレート（invoiceTemplatesAdmin）
- **Làm gì**: 請求総括表（会社ごとの表紙）・現場別請求書（注文 1 件）・請求一覧表（全取引先）を HTML で生成し PDF 化する。明細多数時は高さ推定で自動改ページ。
- **File**: `src/utils/invoiceTemplatesAdmin.ts` (`buildCompanySummary`, `renderOrderInvoicePage`, `getInvoiceLineRows`, `buildCompanyInvoice`, `buildAggregatedBreakdown`, `issue*Invoice`, `packByHeight`).
- **Luồng / dữ liệu**: `getInvoiceLineRows(order, monthPeriod?)` が明細行（区分=日額/販売/保証料/その他）を作る。金額は `getOrGenerateInvoiceBlocks` の当月ブロック基準、日額単価 = `breakdown.price / days`。`packByHeight` で全角=1・半角≈0.55 の実効文字幅から折り返し行数を推定し A4（`INVOICE_BODY_BUDGET_PX=540` / `SUMMARY_BODY_BUDGET_PX=640`）に詰める。総括表の総額は 1 枚目のみ、2 枚目以降は「一枚目記載」。発行元・振込先は `companyInfo.ts` から。税率ラベルは `getTaxRate()` に連動。
- **⚠️ Lưu ý**: 全期間（月未指定）の日額単価は**請求日数 `billedDays`** 基準（実日数 `rentalDays` で割ると最低課金日数が隠れ単価が膨らむ）。当月ブロックはあるが breakdown に当月が無い（自動延長で後から月が生えた）場合、`rentPrice` から再計算し金額を `block.baseSubtotal` へ按分整合して明細空欄を防ぐ。受注番号は `receiptNumber`（手入力）優先、無ければ `orderNumber`。総括表の「単価（税抜）」列は実際は注文の税抜合計（手本 PDF に合わせた見出しの流用）。

### PDF 多ページ描画（pdfMultiPage）
- **Làm gì**: HTML 要素群を html2canvas でラスタライズし jsPDF で A4 PDF 化する。1 ページを超えるセクションを行の途中で切らずに自動改ページ。
- **File**: `src/utils/pdfMultiPage.ts` (`renderSectionsToPdf`, `elementToPdf`, `appendCanvasToPdf`, `findSafeCutY`, `mountOffscreen`, `savePdf`).
- **Luồng / dữ liệu**: `A4_PX_WIDTH=794 / A4_PX_HEIGHT=1123`、scale=2 で撮影。`findSafeCutY` は理想切断 Y から上方向へ「暗い画素 2% 未満の行（＝行間余白）」を探し、そこで切る（1 ページの約 22% まで遡る）。`renderSectionsToPdf` は撮影前に `document.fonts.ready`（Noto Sans JP）を待つ。`savePdf` はモバイルで Web Share、PC でダウンロード。
- **⚠️ Lưu ý**: **html2canvas-pro** を使う（旧 html2canvas は Tailwind v4 の `oklch()/oklab()/color-mix()` を解釈できず PDF 生成が全滅）。末尾 2mm 端数（`TAIL_EPSILON_PX`）は新ページを作らない（空白偶数ページの量産防止）。CORS 汚染で getImageData が失敗したら安全切断を諦め idealY で切る。`elementToPdf` は画像（署名・写真）の decode 完了を待つ（空白防止）。

### 自社情報・車両判定・単位（companyInfo / productUtils）
- **Làm gì**: 発行元（自社）情報・振込先の単一の正、車両カテゴリー判定、数量単位・カテゴリーアイコンのユーティリティ。
- **File**: `src/utils/companyInfo.ts` (`COMPANY`, `BANK`); `src/utils/productUtils.ts` (`isVehicleCategory`, `VEHICLE_CATEGORIES`, `getItemUnit`, `getSupplyCategories`, `getCategoryIcon`).
- **Luồng / dữ liệu**: `COMPANY`/`BANK` は請求書・納品書・回収書など全帳票が参照（変更は 1 ファイルで完結）。`isVehicleCategory` は課金の最低課金日数判定（3日）と在庫二重計上防止フィルタに使われる。`getItemUnit` は未設定時 "点"。
- **⚠️ Lưu ý**: `VEHICLE_CATEGORIES` は AdminVehicles の `VEHICLE_CATEGORY_PRESETS` と**必ず一致**させる（不一致だと連動商品 P-<id> が保安用品扱いになり在庫が二重計上される）。`isVehicleCategory` は `'保安車両'` も true として扱う。

---

## 7. 基盤：データ同期・認証・画像アップロード・バックエンド・デプロイ

Phân hệ nền tảng chung cho cả 3 app (顧客サイト / 管理画面 / スタッフAPK). Mọi dữ liệu đọc/ghi đều đi qua `OrderBus` → HTTP `/api` (PHP + MariaDB), đồng bộ đa client bằng **polling** `SYNC_POLL_MS = 3000ms`. Model lưu trữ là KV/document tổng quát: bảng `records(store, id, data, deleted, rev, updated_at)`.

### OrderBus（クロスタブ + サーバー同期の中核）
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

### サーバー同期ポーリング（_apiTick / rev カーソル）
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

### 楽観的排他（X-Base-Rev / 409 再ベース）
- **Làm gì**: Chống "last-write-wins xóa sạch" khi 2 client sửa cùng record (C29): gửi `X-Base-Rev`; server 409 nếu rev lệch, client re-base "chỉ field mình đổi" lên bản mới nhất của server rồi gửi lại.
- **File**: `src/lib/orderBus.ts` (`_upsertExternalized`, `_patchUpdates`, `_revs`, `_persistRevs`); `src/lib/backendSync.ts` (`ConflictError`, `apiUpsert(...,baseRev)`); server `public/api/store.php` (khối `HTTP_X_BASE_REV`).
- **Luồng / dữ liệu**:
  - `patch()` tích lũy field đã đổi vào `_patchUpdates[pk]`. Chỉ upsert do `patch` (có accumulated patch) + `_revs[pk]` đã biết mới gắn `baseRev`. `push()` cố ý **không** gắn baseRev (ghi đè toàn bộ có chủ đích).
  - Server so `curRev` với `baseRev`; lệch → trả 409 `{rev, deleted, current}`. Client `ConflictError` → merge `{...current, ...mine}` rồi retry trong cùng vòng lặp (tối đa 4 lần), **giữ nguyên in-flight** để không sinh upsert song song.
  - 409 với `deleted=true`/không có `current` → bỏ patch local và xóa record để hội tụ.
  - `_revs` lưu ở `asahi._revs_v1` (debounce 500ms).
- **⚠️ Lưu ý**: Ghi lên **tombstone** (đã soft-delete) kèm baseRev luôn bị coi là conflict kể cả rev khớp — hồi sinh record chỉ được phép qua `push` (ghi đè không baseRev). Lỗi 4xx (quyền) → bỏ luôn pending + `_patchUpdates` để không retry vĩnh viễn; 5xx/mạng → giữ pending để tick sau gửi lại.

### 未送信キューとオフライン再送（pending / flush）
- **Làm gì**: Theo dõi các ghi chưa được server xác nhận để không mất dữ liệu hiện trường khi offline; cho phép app hiện trường chờ đồng bộ xong trước khi đóng job.
- **File**: `src/lib/orderBus.ts` (`_pendingUpserts`, `_inFlightUpserts`, `_retryPendingUpserts`, `pendingCount`, `retryPending`, `flush`, `onSyncError`/`_emitSyncError`).
- **Luồng / dữ liệu**:
  - `_pendingUpserts` (Set key = `store\u0000id`) = ghi chưa xác nhận; `_inFlightUpserts` chống double-send cùng record (retry storm trên mạng chậm).
  - Mỗi tick sync thành công gọi `_retryPendingUpserts()` (chỉ gửi lại record còn tồn tại local).
  - `flush(timeoutMs=8000)` snapshot **chỉ các key pending tại thời điểm gọi**, resolve `true` khi các key này drain, `false` khi có sync error trên chính chúng hoặc timeout.
- **⚠️ Lưu ý**: `flush` phải watch tập con đã snapshot, không xét pending/error toàn cục — nếu không, một `fieldReport` lỗi vô can sẽ làm job vừa hoàn thành bị báo "gửi thất bại".

### 画像・サインの外部化アップロード（externalizeImages / upload.php）
- **Làm gì**: Tách base64 ảnh/chữ ký ra khỏi record, upload thành file lấy URL; record chỉ giữ URL → tránh vỡ quota localStorage, phình sync, "restart mất ảnh".
- **File**: `src/lib/imageUpload.ts` (`externalizeImages`, `uploadDataUrl`, `_deepExternalize`, `hasDataUrl`); server `public/api/upload.php` (+ `public/api/r2.php` dual-write Cloudflare R2).
- **Luồng / dữ liệu**:
  - `_upsertExternalized` gọi `externalizeImages(record)` trước khi upsert; nếu record không đổi (không có ảnh) trả về cùng reference (fast-path, không ghi lại local).
  - `uploadDataUrl` POST `/api/upload` `{dataUrl}` → server whitelist MIME (png/jpg/webp/gif/bmp + pdf/csv/xls/xlsx/doc/docx), đặt tên file = `sha1(bytes).ext` (content-addressed, dedup), trả `{url}`. Có cache `_uploaded` trong phiên chống upload trùng.
  - Server dual-write R2 nếu `r2_config()` có; URL public trả về là R2 khi PUT thành công, ngược lại fallback URL local (`/api/uploads/...`). Host bị fix cứng vào whitelist `shuyei.online` (chống Host header spoof).
- **⚠️ Lưu ý**: `image/svg+xml` và HTML bị **cố ý loại** (chống stored-XSS vì phục vụ cùng origin). Upload lỗi → giữ nguyên base64 (không mất ảnh, chỉ nặng hơn). Giới hạn 20MB.

### バックエンド選択スイッチ・API 設定・トークン注入
- **Làm gì**: Chọn backend đồng bộ và cấu hình endpoint/token cho fetch. Cung cấp helper token và acquire user-token khi login.
- **File**: `src/lib/dataBackend.ts` (`DATA_BACKEND`, `SYNC_POLL_MS`, `API_BASE`, `API_TOKEN`, `apiHeaders`, `getUserToken/setUserToken`, `acquireUserToken`).
- **Luồng / dữ liệu**:
  - `DATA_BACKEND = "api"` (mặc định; các giá trị khác: `"local"` chỉ localStorage). `API_BASE` = `VITE_API_BASE` hoặc `/api` (staff APK inject URL tuyệt đối XServer/VPS lúc build).
  - `apiHeaders()` gắn `X-Api-Token` (=`VITE_API_TOKEN`, shared token cho toàn bundle) và `X-User-Token` (token ký của user, key `asahi.userToken`).
  - `acquireUserToken(loginId,password)` POST `/api/auth.php` khi đăng nhập; **không throw** khi thất bại (fallback tương thích ngược, chạy không token).
- **⚠️ Lưu ý**: `API_TOKEN` nằm trong bundle → có thể trích xuất, nên **không được** dùng làm khóa ký user-token (xem `auth_secret`). Nếu `VITE_API_TOKEN` rỗng thì client không gửi (giả định server cũng tắt xác thực).

### サーバー側 REST 規約（store.php / db.php）
- **Làm gì**: Endpoint dữ liệu chính: GET (list theo store, rev DESC), POST (upsert 1 record), DELETE (soft-delete), PUT bị vô hiệu. Sinh `rev` toàn cục atomic trong transaction.
- **File**: `public/api/store.php`, `public/api/db.php` (`db`, `ensure_schema`, `next_rev`, `require_api_token`, `valid_store`, `json_out`).
- **Luồng / dữ liệu**:
  - `records(store,id,data LONGTEXT,deleted,rev,updated_at)` + `rev_counter`; schema tự tạo lần đầu (`ensure_schema`). `next_rev` dùng `UPDATE ... LAST_INSERT_ID(val+1)`.
  - POST: `INSERT ... ON DUPLICATE KEY UPDATE` với `data=VALUES(data), deleted=0`; DELETE: `UPDATE deleted=1`. **Cả hai bọc trong transaction** cùng lượt `next_rev` để thứ tự commit khớp thứ tự rev (nếu không con trỏ sync có thể nhảy sót).
  - `PUT` (full replace / `apiSetAll`) trả **405 — disabled** (nguy hiểm: chỉ cần shared token là xóa sạch 1 store).
- **⚠️ Lưu ý**: `setAll` phía client **chỉ gửi diff** (upsert record đổi + remove record client này đã xóa), tuyệt đối không full-replace — client khác vừa thêm record sẽ bị xóa oan. Store `orders` bị loại khỏi đường `setAll` (đi qua `push/patch` riêng).

### 認証・ユーザートークン（auth.php / current_user / fail-closed）
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

### 管理画面ゲート（AdminAuthGate）
- **Làm gì**: Bảo vệ lối vào `/admin` bằng 2 lớp: mã truy cập tĩnh → đăng nhập admin (`role==="admin"`).
- **File**: `src/components/AdminAuthGate.tsx` (`AdminAuthGate`, `AccessCodeScreen`, `AdminLoginScreen`); dùng `useUser()` từ `src/context/UserContext`.
- **Luồng / dữ liệu**:
  - Lớp 1: `ADMIN_GATE_CODE` (=`VITE_ADMIN_GATE_CODE`, mặc định `"asahi-admin-2026"`); pass → set `sessionStorage["asahi.admin_gate_v1"]="1"`.
  - Lớp 2: `handleLogin` khớp user theo email/id/`employeeCode`, chặn `inactive`, chặn non-admin, so `password` plaintext rồi gọi `login(target.id, ...)` (đăng nhập bằng `id` duy nhất để tránh fail-closed khi email trùng).
  - `canUseAdmin = currentUser && status!=="inactive" && role==="admin"`. Có auto-restore phiên admin sau khi "代理ログイン" (customer) quay lại `/admin` qua `localStorage["asahi.adminReturnId"]`.
- **⚠️ Lưu ý**: Khi có session (`asahi.sessionUserId`) nhưng `usersLoaded` chưa xong → hiện `AdminLoadingScreen`, **không** đá về màn login (tránh hiểu nhầm "đã logout" khi reload). Login screen vẫn so password plaintext phía client — đây là lý do chưa bật `hash_passwords`.

### AdminDataContext（管理画面のデータ集約と KPI 導出）
- **Làm gì**: Provider subscribe toàn bộ store qua OrderBus cho admin, tính KPI dashboard (doanh thu thuê/bán) từ orders thô.
- **File**: `src/context/AdminDataContext.tsx` (`AdminDataProvider`, `useAdminData`, `useAdminCollection`, `useAdminOrders`); logic KPI ở `src/lib/orderBus.ts` (`deriveAdminData`).
- **Luồng / dữ liệu**:
  - Subscribe `orders` → `raw` + `connected=true`; subscribe mảng `COLLECTIONS` → `cols[name]`. `derived = deriveAdminData(raw)` mỗi khi `raw` đổi.
  - `deriveAdminData`: map ra `DerivedOrder`, sort `byOrderDateDesc`, tách `rentals`/`sales` theo `items[].type` (`rent`/`buy`), tính `rentalSales`/`productSales` **bỏ qua** đơn `キャンセル` và `処理中` (chưa 受注確定).
  - `useAdminOrders` map status hiển thị: giữ nguyên các status vòng đời thuê (`レンタル中`, `一部返却`, `検品待ち`…) thay vì để `staffStatus` (vd `配送完了`) ghi đè.
- **⚠️ Lưu ý**:
  - Seed tự động **đã tắt** (`seedAll` chỉ seed collections phụ qua `seedIfEmpty`, luôn skip khi backend="api"; orders không seed). `getCol` không fallback mock — không có data thật thì hiện rỗng.
  - Trong KPI, `calculatedPrice` là "tổng kỳ hạn cho 1 đơn vị" nên **phải nhân `quantity`**, nếu không doanh thu bị thiếu với qty>1.

### 税率同期（taxSync）
- **Làm gì**: Áp `systemSettings.taxRate` (cấu hình ở admin) vào công cụ tính thuế của module billing.
- **File**: `src/lib/taxSync.ts` (`applyTaxRateFromSettings`); ghi vào `src/utils/billing.ts` (`setTaxRate`). Nạp bằng side-effect import ở `main.tsx`/`staff-main.tsx`.
- **Luồng / dữ liệu**: Đọc record `systemSettings` có `id==="global"`, lấy `taxRate` (số phần trăm), `setTaxRate(pct/100)`. Subscribe `systemSettings` để theo dõi cả thay đổi đến từ server sync.
- **⚠️ Lưu ý**: Chỉ áp khi `0 < pct < 100`; không có/không hợp lệ → giữ mặc định 10% (hành vi không đổi).

### 監査ログ（サーバー記録・audit.php）
- **Làm gì**: Ghi log thao tác bất biến phía server cho các store nghiệp vụ quan trọng; client không ghi/sửa được.
- **File**: `public/api/audit.php` (`audit_log`, `is_audited_store`, `audit_diff`, `audit_label`, `AUDIT_STORES`, `AUDIT_SKIP_KEYS`); gọi từ `store.php` (POST=create/update, DELETE=delete).
- **Luồng / dữ liệu**:
  - Ghi vào store `auditLogs`; **chỉ log khi `user.role==='admin'`** (bỏ qua thao tác của customer/staff). `AUDIT_STORES` = 14 store trọng yếu (orders, products, users, vehicles, roles, systemSettings…).
  - Entry: `{id, store, recordId, recordLabel, action, userId, userRole, changes[], ts}`; `changes` chỉ diff scalar (mảng/object chỉ ghi "（変更）"), bỏ qua `AUDIT_SKIP_KEYS` (ảnh, chữ ký, items…). Update không có diff thực → không ghi (chống noise).
- **⚠️ Lưu ý**: Client POST/DELETE trực tiếp `auditLogs` bị **403** (nội bộ server). Đọc `auditLogs`/`pushTokens` luôn fail-closed (chỉ admin/staff) ở cả `store.php` và `sync.php`. Giữ 90 ngày (cron xóa vật lý — không nằm trong các file này).

### スタッフ APK への FCM プッシュ（fcm.php）
- **Làm gì**: Đẩy thông báo có âm thanh tới staff APK ngay cả khi app bị đóng hẳn, khi phát sinh job mới (配送予定/回収予定/持込返却).
- **File**: `public/api/fcm.php` (`fcm_notify_staff`, `fcm_access_token`, `fcm_load_tokens`, `fcm_remove_token`, `fcm_enabled`); trigger trong `store.php` (khối POST orders/walkinReturns); doc `docs/STAFF_PUSH_FCM.md`. Client-side local notification: `src/lib/staffNotify.ts` (`useStaffNotificationAlerts`, channel `staff-alerts`).
- **Luồng / dữ liệu**:
  - `fcm_enabled()` = có service-account JSON (mặc định `/var/www/shuyei-secrets/fcm-service-account.json`, override qua `config.php['fcm']['service_account']`); không có → **toàn bộ no-op**.
  - Trong POST `orders`: đọc `staffStatus` trước (FOR UPDATE) so với mới — chỉ push khi **chuyển sang** `配送予定`/`回収予定` (không rung mỗi lần edit). `walkinReturns`: chỉ push khi record mới (không phải khi staff cập nhật stage).
  - Response trả về client **trước** rồi mới gửi FCM (`fastcgi_finish_request`/flush) để không làm chậm lượt lưu. Token đích lấy từ store `pushTokens`.
  - OAuth2 access token: JWT RS256 → `oauth2.googleapis.com/token`, cache 55 phút (file per service-account, 0600, atomic rename). 401 → refresh + resend 1 lần.
- **⚠️ Lưu ý**: Chỉ xóa token khi `UNREGISTERED`/HTTP 404 — **không** xóa khi `INVALID_ARGUMENT` (lỗi 400 do payload trả về cho mọi token, sẽ xóa nhầm toàn bộ). `data` phải gửi dạng object (`(object)$dataStr`) vì `[]` → 400. APK khi đóng hẳn chỉ nhận được nhờ FCM này; khi đang chạy/background thì `staffNotify.ts` (local notification) đã xử lý.

### ビルド・デプロイ（Vite scripts / deploy_vps.sh）
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
