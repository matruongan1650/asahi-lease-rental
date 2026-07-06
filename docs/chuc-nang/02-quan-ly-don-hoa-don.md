# 管理画面：受注・請求・回収・販売

> [← Danh mục chức năng](../CHUC_NANG.md)

Phân hệ admin quản lý toàn bộ vòng đời đơn hàng thuê/bán: nhận đơn → xuất kho → giao/thu hồi → kiểm phẩm → tính tiền theo tháng → phát hành chứng từ (請求書/納品書/回収書). Tất cả dùng chung một engine tính tiền (`billing.ts`) và một sổ tồn kho (`stockLedger.ts`) qua `OrderBus` + `AdminDataContext`.

## 受注・レンタル一覧（4キュー：受注待ち/手配中/稼働中/完了・取消）
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

## レンタル契約登録（既存・進行中の契約を管理対象に追加）
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

## 請求管理（月別請求ブロック一覧・入金消込）
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

## 請求総括表 / 請求書（総括＋現場別）B2B PDF
- **Làm gì**: Preview + xuất PDF gộp theo công ty cho 1 tháng: 総括表 (bảng tổng hợp mọi đơn), hoặc 内訳 (総括 + từng 現場).
- **File**: `src/components/B2BInvoiceViewer.tsx`; dựng nội dung ở `src/utils/invoiceTemplatesAdmin.ts` (`buildCompanySummary`, `buildCompanyInvoice`, `issueCompanyInvoice`) + `rentalInvoiceGrouping.groupOrdersByCompany`; render PDF `pdfMultiPage` (`renderSectionsToPdf`, `mountOffscreen`).
- **Luồng / dữ liệu**: `AdminInvoices.openB2B` yêu cầu chọn **cả** `selectedCompany` và `selectedMonth` (nếu không có → toast cảnh báo, nút disabled). `type:"summary"` → `buildCompanySummary`; `type:"detailed"` → `buildCompanyInvoice(...).nodes`. Mỗi page render vào element cố định 794×1123px (A4) qua `HTMLElementWrapper`.
- **⚠️ Lưu ý**: `group` được tìm bằng `companyName.trim()` — trùng khoảng trắng/全角 sẽ không match. Build trong `try/catch`; lỗi → `pages=[]` và hiện "対象月の請求データが存在しません".

## レンタル請求書（会社・担当者別）発行セクション
- **Làm gì**: Panel phát hành hóa đơn PDF theo cấp độ: cả công ty / theo担当者 / theo từng đơn / 内訳請求書 (aggregated).
- **File**: `src/components/AdminRentalInvoiceSection.tsx` (`AdminRentalInvoiceSection`, `openPreview`, `RenterRow`); build/issue ở `invoiceTemplatesAdmin.ts`; preview qua `InvoicePreviewModal`.
- **Luồng / dữ liệu**: Group đơn bằng `groupOrdersByCompany(orders, { monthPeriod, companyName })`. Mỗi nút → `openPreview(key,title,build,download)`: set busy → `setTimeout(...,0)` để render "準備中" trước rồi build nặng ở frame sau; download PDF thực hiện trong modal. `RenterRow.amountFor`: có `monthPeriod` thì lấy block đúng tháng, không thì cộng tất cả block (fallback `order.total`).
- **⚠️ Lưu ý**: `busyRef` (useRef) chống double-click — không chỉ dựa `busy` state vì React batch render. Được nhúng cuối `AdminInvoices`, nhận `invoiceOrders` (đơn có items) + filter company/month đang chọn.

## 注文詳細ドロワー（編集・追加費用・帳票）
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

## 回収・返却管理（回収手配 / 一部返却 / 一括返却 / 検品履歴）
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

## 販売受注（確認・出庫準備・書類）
- **Làm gì**: Màn hình đơn bán (`hasType:"buy"`), 4 view (すべて/受注待ち/出庫準備/完了); 受注確定 xuất kho, 却下, tạo 販売契約 & 請求書.
- **File**: `src/pages/Admin/AdminSales.tsx` (`AdminSales`, `handleConfirm`, `handleReject`, `handleDocCreate`; map `SALES_VIEW_STATUS`, `viewFor`, `toSalesRow`).
- **Luồng / dữ liệu**:
  - Query `useServerQuery("orders", { hasType:"buy", statusIn: view==="all"?undefined:SALES_VIEW_STATUS[view], ... })`.
  - 受注確定 (`handleConfirm`): `deductOrderStock(raw)` + `patch { status:"確認済み", staffStatus:"出庫予定", ...flags }` (bán dùng `出庫予定`, khác thuê là `配送予定`).
  - 販売契約作成 (`handleDocCreate` kind `sale-contract`): dựng orderRecord (`items type:"buy"`, `buyPrice`, subtotal/tax bằng `getTaxRate()`), `deductOrderStock` rồi `OrderBus.push("orders", ...)`. `sale-invoice`: `OrderBus.push("issuedInvoices", ...)` (chỉ lưu chứng từ, không tạo đơn).
- **⚠️ Lưu ý**:
  - `SALES_ENABLED=false` (MEMORY) — hệ thống đang chạy レンタル専用; màn này tồn tại nhưng tính năng bán tạm OFF.
  - Drawer `onUpdateStatus`: `"確認済み"`→`deductOrderStock`, còn lại `settleReturnStock` (để đơn hỗn hợp rent/buy vẫn hoàn kho phần thuê khi cancel/return, thống nhất với các màn khác).

## 帳票プレビュー・PDF（納品書 / 回収書 / 請求書）
- **Làm gì**: Xem và tải PDF chứng từ của 1 đơn; đơn thuê nhiều tháng có nhiều 請求書 (mỗi tháng 1 file).
- **File**: `src/components/DocumentViewer.tsx` (`DocumentViewer`, `getInvoiceIssueDate`); 請求書 render bằng `renderOrderInvoicePage` (invoiceTemplatesAdmin) để khớp với B2B PDF; 納品書/回収書 dùng JSX `documentRef` + `elementToPdf`.
- **Luồng / dữ liệu**:
  - `blockId` có → hiển thị đúng tháng đó (`invoiceMonthPeriod=block.monthPeriod`); không có → toàn kỳ. Tổng: có block dùng block; không block & là 請求書 dùng tổng của `allBlocks` (`getOrGenerateInvoiceBlocks`); ngược lại dùng `order.*`.
  - 明細: có block → `calculateMonthlyInvoice(order, block.monthPeriod).items` + `extraCosts` của block; không block → `ensureMonthlyBreakdowns(order)` + extraCosts của `allBlocks`. 保証料 được xen thành dòng riêng ngay sau mỗi item (`初回準備・保証料（...）`).
  - Mobile: scale A4 bằng `zoom` (`fitRef`), nhưng khi chụp PDF trả về等倍 794px để giống điều kiện xuất.
- **⚠️ Lưu ý**:
  - Với 請求書 toàn kỳ (không block), phải dùng tổng của `allBlocks` chứ không phải `order.subtotal/total` — giá trị đó có thể cũ (chưa gồm弁償費/燃料費/配送料 hoặc gia hạn tự động) ⇒ 明細 và 総額 lệch.
  - `getInvoiceIssueDate` = cuối tháng của `actualReturnDate ?? rentalEndDate ?? order.date`.

## レンタル請求書ドキュメント作成ドロワー（AdminDocDrawer）
- **Làm gì**: Drawer form tạo chứng từ generic (販売契約/請求書/納品書/修理 v.v.) với `LineItems`.
- **File**: `src/components/AdminDocDrawer.tsx` (`AdminDocDrawer`, `LineItems`, map `DOC_META`). Chỉ AdminSales dùng (kind `sale-contract`/`sale-invoice`), tính tiền bằng `getTaxRate()`.
- **Luồng / dữ liệu**: `docNo` chỉ đánh **một lần** khi mở (mã `<code>-<6 số cuối timestamp>`); danh sách 顧客 = users `companyType==="client_company"` (store `"customers"` không tồn tại). `submit` chặn 0 品目 (trừ 修理); gọi `onCreate({ id:docNo, kind, lineItems, status, ... })`.
- **⚠️ Lưu ý**: KHÔNG tính `docNo` trong render (trước đây `Math.random()` re-render đổi số → trùng 3-digit → onCreate ghi đè đơn). `LineItem` ở đây là type nội bộ (`{id,name,qty,price}`), khác `items` của order.

## 共通の在庫連動（受注確定=出庫 / 最終検品=入庫）
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
