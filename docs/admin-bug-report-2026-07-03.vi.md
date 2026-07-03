# Bản dịch chi tiết: admin-bug-report-2026-07-03

Nguồn đã đọc:

- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/docs/admin-bug-report-2026-07-03.json`
- `/Users/matruongan/antigravity/アサヒリースレンタル・販売/docs/admin-bug-report-2026-07-03.txt`

Ghi chú: file `.txt` là bản tóm tắt gồm 31 lỗi đã xác nhận và 1 lỗi “có khả năng”. File `.json` chứa cùng các mục nhưng đầy đủ hơn, có thêm lý do kiểm chứng. Bản dịch này dùng JSON làm nguồn chính, giữ nguyên đường dẫn file, tên hàm, đoạn code, trạng thái và cụm UI tiếng Nhật để bạn dễ đối chiếu với code.

## Tổng quan

- Đã xác nhận: 31 mục.
- Có khả năng: 1 mục.
- Nhóm lỗi nghiêm trọng nhất tập trung vào mất/lệch tồn kho, tính tiền sai, mất dữ liệu xe/kiểm định, và gửi email sai cho khách hàng.
- Nhóm lỗi trung bình/thấp chủ yếu liên quan đến trạng thái thanh toán sai, KPI/UI sai, dữ liệu trùng lặp và ghi đè dữ liệu khi nhiều người thao tác đồng thời.

## Thuật ngữ đối chiếu nhanh

- `確認済み`: đã xác nhận đơn.
- `レンタル中`: đang cho thuê.
- `キャンセル`: huỷ.
- `返却済` / `返却済み`: đã trả.
- `完了`: hoàn tất.
- `処理中`: đang xử lý, chưa trừ kho.
- `受注待ち`: đang chờ tiếp nhận đơn.
- `入金済`: đã thu tiền.
- `未入金`: chưa thu tiền.
- `追加費用`: chi phí phát sinh/bổ sung.
- `車検満了日`: ngày hết hạn kiểm định xe.
- `保有台数`: số lượng xe sở hữu.
- `整備中`: đang bảo dưỡng.
- `空車`: xe trống/sẵn sàng.
- `使用中`: đang sử dụng.
- `伝票`: phiếu/chứng từ tồn kho.

## CONFIRMED: 31 lỗi đã xác nhận

### C1 [CAO] (orders) Đóng/huỷ đơn hàng trong modal sửa của drawer không bao giờ hoàn kho

- File: `src/components/AdminOrderDrawer.tsx:400`
- Tiêu đề gốc: Khi đóng hoặc huỷ đơn qua modal sửa của drawer, tồn kho không được trả lại vì hệ thống lưu trạng thái mới trước khi `settleReturnStock` chạy, làm guard `closed->closed` luôn kích hoạt.
- Cách tái hiện: Đơn đang `確認済み` hoặc `レンタル中`, có `stockDeducted=true`. Admin mở đơn trong `AdminRental` hoặc một trong 7 màn hình có drawer, vào `注文情報を編集`, đổi `注文ステータス` sang `キャンセル`, `返却済` hoặc `完了`, rồi bấm `保存する`. `handleSaveEdit` gọi `onUpdateOrder` trước; host gọi `OrderBus.patch` đồng bộ và cập nhật `_mem` ngay thành trạng thái đã đóng. Sau đó mới gọi `onUpdateStatus`; lúc này `settleReturnStock` đọc lại đơn từ `OrderBus.getAll`, thấy đơn đã ở trạng thái đóng nên guard `isClosedOrder(liveCur?.status)` trả về `{}` trước khi `restoreOrderStock` chạy.
- Ảnh hưởng: Mỗi lần admin đóng/huỷ một đơn đã trừ kho qua modal sửa, số tồn vật lý bị mất vĩnh viễn trên ledger. Đây lại là đường UI duy nhất để huỷ một đơn đã được chấp nhận trong `AdminRental`; nút `却下` chỉ có trong hàng đợi `受注待ち`. Lỗi ảnh hưởng cả 7 host drawer: `AdminRental`, `AdminSales`, `AdminWarehouse`, `AdminCalendar`, `AdminInvoices`, `AdminRecovery`, `AdminDashboardHome`.
- Hướng sửa: Chạy transition ledger trước khi persist trạng thái đóng. Trong `handleSaveEdit`, trước dòng 400 tính `statusChanged` và `closing`; nếu đang chuyển sang trạng thái đóng thì gọi `onUpdateStatus(order.firestoreId || order.id, updates.status, updates.staffStatus || undefined)` trước `onUpdateOrder`. Giữ call `onUpdateStatus` sau khi lưu chỉ cho các case không đóng, vì chuyển sang `確認済み` cần trừ kho sau khi item đã được normalize. Phương án chắc hơn: thêm tham số `prevStatus` vào `settleReturnStock` và dùng trạng thái cũ để kiểm guard.

### C2 [TRUNG BÌNH] (orders) Số đơn hợp đồng rental dùng random 4 chữ số và không kiểm tra trùng

- File: `src/pages/Admin/AdminRental.tsx:160`
- Tiêu đề gốc: Hợp đồng rental được đăng ký có `orderNumber` random dạng `RN-YYYY-1000..9999`, không kiểm tra tính duy nhất; khi trùng, fallback `orderNumber` của `stockLedger.resolveLiveOrder` lấy nhầm đơn và làm hỏng flag/item tồn kho.
- Cách tái hiện: Khi đăng ký hợp đồng qua `レンタル契約を登録`, `orderNumber = RN-${year}-${Math.floor(1000+Math.random()*9000)}` chỉ có 9.000 giá trị mỗi năm. Xác suất trùng khoảng 10% ở 43 lần đăng ký và 50% ở 112 lần. Nếu hai đơn cùng `RN-2026-1234`, `resolveLiveOrder` dùng `list.find(...)` với điều kiện OR, nên bản ghi đứng trước trong `_mem` sẽ thắng. Vì `push` prepend bản ghi mới nhất, đơn khác có thể che đơn mục tiêu.
- Ảnh hưởng: Có thể bỏ qua hoàn kho, bỏ qua trừ kho, hoặc patch `stockDeducted/items` vào nhầm đơn, làm hỏng danh sách item của đơn khác. Số hoá đơn `INV-R-...` và mã phiếu `stockOut/stockIn` cũng trùng, khiến ledger khó audit.
- Hướng sửa: Tạo `orderNumber` không trùng, ví dụ dùng timestamp như checkout path hoặc re-roll cho đến khi `OrderBus.getAll('orders').some(o => o.orderNumber === orderNumber)` là false. Đồng thời sửa `resolveLiveOrder`: ưu tiên match chính xác theo `id/firestoreId`, chỉ fallback theo `orderNumber` nếu không tìm thấy id.

### C3 [TRUNG BÌNH] (orders) Sửa bất kỳ trường billing nào trong drawer xoá sạch invoiceBlocks đã cache

- File: `src/components/AdminOrderDrawer.tsx:384`
- Cách tái hiện: Đơn có `invoiceBlocks` đã cache. Admin thêm `追加費用` 5.000 yen qua `追加費用入力`, hoặc `AdminInvoices` đánh dấu một block tháng là `入金済` với `paidAt`. Sau đó admin mở `注文情報を編集` và gia hạn `レンタル終了予定日` hoặc đổi số lượng/đơn giá/phí giao hàng. `billingChanged=true`, code set `updates.invoiceBlocks = undefined`, làm mất block cache. Khi regenerate, `getOrGenerateInvoiceBlocks` tạo block mới với `extraCosts: []`, chỉ inject lại các phí tự động fuel/compensation/delivery và tính lại status pending/accumulating.
- Ảnh hưởng: Chi phí thêm thủ công biến mất khỏi hoá đơn và tổng tiền; tháng đã thu tiền hiện lại là chưa thu, có nguy cơ đòi tiền lần hai và mất lịch sử `paidAt`.
- Hướng sửa: Khi `billingChanged`, không xoá thẳng cache một cách thô bạo. Hãy regenerate block mới rồi merge theo `monthPeriod`: giữ `status/paidAt` của block cũ nếu phù hợp, re-append các `extraCosts` thủ công không thuộc nhóm auto (`fuel-refill`, `compensation-charge`, `delivery-fee`), sau đó `recalculateInvoiceBlock`. Tổng tiền phải tính từ mảng đã merge.

### C4 [THẤP] (orders) Hợp đồng đăng ký ở trạng thái xác nhận giữ subtotal/tax/total = 0 trong suốt thời gian rental

- File: `src/pages/Admin/AdminRental.tsx:141`
- Cách tái hiện: Đăng ký hợp đồng rental với `登録ステータス 確認済み`. Vì `shouldBill=false`, đơn được push với `subtotal:0`, `tax:0`, `total:0`. Sau đó admin bấm `稼働開始` hoặc staff hoàn tất giao hàng; cả hai flow chỉ patch status/thời điểm/invoiceBlocks mà không tính lại subtotal/tax/total. Cho đến lúc trả cuối cùng, bảng `AdminRental`, `sumTotal` và KPI `rentalSales` vẫn coi đơn là 0 yen.
- Ảnh hưởng: Hiển thị tiền và KPI doanh thu rental bị thấp hơn thực tế trong toàn bộ thời gian đơn đang chạy. Hoá đơn động vẫn đúng, nên ảnh hưởng chính là display/KPI và tự sửa khi final return.
- Hướng sửa: Trong `completeDelivery`, sau khi build `updates.items`, gọi `getOrGenerateInvoiceBlocks({ ...target0, ...updates })` và set `updates.subtotal/tax/total` bằng tổng block. Có thể thêm logic tương tự trong `AdminRental.handleMoveToActive` cho đơn có `total===0` và chưa có block.

### C5 [THẤP] (orders) Auto-recalc trong edit modal bỏ qua extraCosts nằm trong invoiceBlocks

- File: `src/components/AdminOrderDrawer.tsx:308`
- Cách tái hiện: Đơn có `追加費用` đã cache trong `invoiceBlocks` và đã nằm trong `order.total`. Admin mở `注文情報を編集`, chỉ chạm vào một trường item, ví dụ đổi số lượng 2 -> 3 -> 2, hoặc bấm `金額を再計算`. `recalcEditDraftTotals` tính tổng bằng cộng item/delivery phẳng, không cộng `extraCosts`. Khi lưu mà chữ ký billing không đổi, `billingChanged=false`, code không recompute từ block và ghi `subtotal/tax/total` từ draft, làm mất phần 5.000 yen trong tổng đơn.
- Ảnh hưởng: `order.total` trong bảng, drawer và KPI doanh thu lệch với `invoiceBlocks`, trong khi block mới là nguồn billing đúng. Thuế tính theo một lần floor toàn cục cũng có thể lệch với tổng thuế theo từng block.
- Hướng sửa: Cho `recalcEditDraftTotals` tính theo `getOrGenerateInvoiceBlocks` và tổng block thay vì cộng phẳng item. Cách ít đụng chạm hơn: trong `handleSaveEdit`, nếu `!billingChanged`, tính lại `updates.subtotal/tax/total` từ `getOrGenerateInvoiceBlocks(order)` để giữ extraCosts trong block.

### C6 [CAO] (billing) Regenerate invoiceBlocks khi gia hạn/hoàn tất trả hàng làm mất extraCosts và paid status

- File: `src/utils/returnProcessing.ts:255`
- Cách tái hiện: Đơn 3 tháng 4/1-6/30. Admin đánh dấu block tháng 4 là `入金済`, hoặc thêm `追加費用` thủ công `cost-*`. Sau đó khách gia hạn trong `OrderDetail.tsx`, hoặc kho hoàn tất partial return/full return trong `returnProcessing.ts`. Các path này build order tạm với `invoiceBlocks: undefined` và lưu block mới regenerate. Block tháng 4 lại thành `pending`; chi phí `cost-*` biến mất, chỉ các phí auto fuel/compensation/delivery được inject lại.
- Ảnh hưởng: Mất tiền đã billing, AR sai: phí thêm biến mất, tháng đã thu lại thành chưa thu/quá hạn trong `AdminInvoices`, có nguy cơ lập hoá đơn lặp. Đặc biệt khách hàng có thể kích hoạt bug bằng thao tác gia hạn, không cần admin.
- Hướng sửa: Thêm helper trong `billing.ts` như `regenerateBlocksPreservingState(prevBlocks, newBlocks)`: với mỗi block mới, nếu có block cũ cùng `monthPeriod`, giữ `status/paidAt` khi phù hợp và append lại extraCosts thủ công, rồi recalc block. Dùng helper này trong `returnProcessing.ts` và các handler gia hạn thay vì dùng output regenerate thuần.

### C7 [TRUNG BÌNH] (billing) Giá override do admin đặt bị mất khi hoàn tất return hoặc gia hạn

- File: `src/utils/returnProcessing.ts:80`
- Cách tái hiện: Admin giảm `単価` trong drawer, item có `priceOverride:true` và `calculatedPrice` đã giảm. Khi warehouse hoàn tất return, `computeReturnSplit` tạo lại item với `calculatedPrice: totalPrice` tính từ `rentPrice` gốc. Flag `priceOverride` còn đó nhưng số tiền override bị ghi đè. Các path gia hạn khách hàng cũng set `copy.calculatedPrice = itemTotal` từ giá gốc.
- Ảnh hưởng: Khách bị tính theo giá tiêu chuẩn thay vì giá đã thoả thuận, gây over-billing. Điều này trái với thiết kế trong `billing.ts` rằng `priceOverride` phải được giữ qua recompute.
- Hướng sửa: Trong `computeReturnSplit` và hai extension handler, nếu `item.priceOverride` thì không ghi đè `calculatedPrice` bằng giá tính lại. Giữ `item.calculatedPrice` hoặc scale nó theo tỷ lệ khi kỳ billing thay đổi, để `ensureMonthlyBreakdowns` xử lý breakdown.

### C8 [TRUNG BÌNH] (billing) Đơn đã huỷ vẫn hiện thành công nợ chưa thu trong màn hình billing

- File: `src/pages/Admin/AdminInvoices.tsx:96`
- Cách tái hiện: Tạo/xác nhận đơn rental có ngày rental, rồi huỷ. `AdminRental.tsx` patch status `キャンセル` nhưng giữ item/date. Trong `請求管理`, `makeRows` generate block cho mọi order có item và không filter `キャンセル`. `getOrGenerateInvoiceBlocks` cho block quá khứ là `pending`. Đơn đã huỷ hiện là `未入金`, tính vào stat `対象金額/未入金/延滞`, có thể chọn để đánh dấu paid/bulk, mà row không có cột status để báo là đã huỷ.
- Ảnh hưởng: Công nợ và aging bị thổi phồng bằng số tiền không bao giờ thu; admin có thể phát hành/mark-paid hoá đơn cho đơn đã huỷ. Cùng một trang có section dưới đã skip `キャンセル`, nên hai nửa màn hình mâu thuẫn.
- Hướng sửa: Trong `AdminInvoices.tsx`, filter bỏ order có `String(order.status) === "キャンセル"` ở `invoiceOrders` memo hoặc đầu `makeRows`.

### C9 [TRUNG BÌNH] (billing) Đơn partial-return `-R` lưu invoiceBlocks với id `block-undefined-YYYY-MM`

- File: `src/utils/returnProcessing.ts:282`
- Cách tái hiện: `tempCustomOrder` không có `id`, trong khi `getOrGenerateInvoiceBlocks` tạo `block.id = block-${order.id}-${monthStr}`. Vì vậy block thành `block-undefined-2026-07`. `addCustomOrder` gán id đơn sau đó nhưng không sửa block. Hai đơn partial return trong cùng tháng sẽ có block id trùng. `AdminInvoices` chọn block chỉ bằng `block.id`, nên tick một dòng có thể làm hai dòng checked và bulk mark-paid cả hai đơn không liên quan.
- Ảnh hưởng: Ghi nhận thanh toán lên hoá đơn admin không chọn; UI hiện checkbox ảo và AR bị sai âm thầm.
- Hướng sửa: Tạo id đơn `-R` trước khi build block, gán vào `tempCustomOrder` trước `getOrGenerateInvoiceBlocks`, và truyền tiếp qua `addCustomOrder`. Phòng thủ thêm: key selection trong `AdminInvoices` bằng composite `${order.firestoreId || order.id}::${block.id}`.

### C10 [THẤP] (billing) Xoá phí đổ xăng auto không có dismissal flag nên phí bị tính lại

- File: `src/components/AdminOrderDrawer.tsx:259`
- Cách tái hiện: Rental xe bảo vệ trả về không đầy xăng, finalize lưu `order.fuelCharge` và invoice block có ExtraCost id `fuel-refill`. Admin miễn phí bằng cách xoá dòng đó trong drawer. `handleDeleteCost` chỉ set `compensationDismissed` và `deliveryDismissed`, không có `fuelDismissed`. Sau này khi billing field thay đổi, block regenerate và logic fuel injection chạy lại, thêm lại phí đã miễn.
- Ảnh hưởng: Over-billing: phí admin đã miễn tự động sống lại, vào tổng block và PDF.
- Hướng sửa: Khi xoá `fuel-refill`, set `fuelDismissed:true`; trong `billing.ts` chỉ inject fuel nếu có amount và `!order.fuelDismissed`.

### C11 [CAO] (warehouse) Tạo product mới dùng id P random 4 chữ số và OrderBus.push không dedupe

- File: `src/pages/Admin/AdminWarehouse.tsx:320`
- Cách tái hiện: Product đã có trong không gian `P-1000..P-9999`. Trong `倉庫管理 > 品目を追加`, tạo item mới bằng `P-` + random 4 chữ số. Nếu trùng id, `OrderBus.push` prepend không check, `_upsertExternalized` gửi bản ghi đầu tiên lên server. `store.php` full-replace dữ liệu theo `(store,id)`, nên product cũ bị ghi đè tên/category/stock/price. Local `_mem` lại có hai row cùng id, các flow tồn kho sau đó `find/patch` vào bản ghi đứng trước.
- Ảnh hưởng: Mất vĩnh viễn master product và tồn kho live; duplicate id làm hỏng trừ kho/hoàn kho/nhập xuất/kiểm kê và React keys. Không có cảnh báo.
- Hướng sửa: Tạo id không trùng, ví dụ `P-` + timestamp base36 + random suffix, hoặc loop đến khi không trùng trong `products`. Đồng thời sửa `OrderBus.push` để reject hoặc upsert-in-place khi id đã tồn tại thay vì prepend duplicate.

### C12 [TRUNG BÌNH] (warehouse) Import CSV kiểm kê chấp nhận số âm/số thập phân

- File: `src/pages/Admin/AdminStocktake.tsx:401`
- Cách tái hiện: Export CSV kiểm kê, sửa cột `実数` thành `-3` hoặc `3.5`, rồi import. `importCsv` dùng `Number(...)` và nếu không NaN thì gán thẳng vào draft, không clamp >=0 và không ép integer. Khi bấm `棚卸確定`, `finalizeStocktake` patch `products.stock = row.counted`, nên stock trên server thành -3 hoặc 3.5.
- Ảnh hưởng: Tồn kho chính thức âm/phân số; KPI, bảng tồn kho và stockStatus sai, tồn tại đến khi ai đó sửa tay.
- Hướng sửa: Trong `importCsv`, chỉ nhận finite number và gán `Math.max(0, Math.trunc(n))`. Nên clamp phòng thủ thêm trong `finalizeStocktake` trước khi patch.

### C13 [TRUNG BÌNH] (warehouse) File đính kèm kiểm kê embed base64 tuỳ ý vào một stocktake record

- File: `src/pages/Admin/AdminStocktake.tsx:280`
- Cách tái hiện: Trong `棚卸 > 証跡・メモ`, upload evidence file. `handleFileUpload` cho bất kỳ type tới 8MB mỗi file, không giới hạn số lượng, và `makeStocktakeFile` lưu raw `dataUrl`. Khi finalize, một record `stocktake` chứa tất cả base64 inline. Khác với ảnh `data:image`, file này không được upload lên `/api/upload`; `externalizeImages` chỉ match `data:image` và `upload.php` cũng reject non-image. Hai PDF 8MB có thể tạo JSON khoảng 21MB, dễ gây lỗi `post_max_size`/`max_allowed_packet`, record bị retry vô hạn, hoặc localStorage bị slim bỏ hết `data:` sau reload làm mất file.
- Ảnh hưởng: Phiên kiểm kê không sync sang admin khác, client/server bị vòng retry upload lớn, evidence file có thể mất vĩnh viễn dù UI báo đã xác nhận kiểm kê.
- Hướng sửa: Không embed non-image file vào record. Mở rộng upload pipeline với allowlist an toàn (pdf/csv/xlsx...) và lưu URL, upload ngay khi attach; hoặc tạm thời áp ngân sách dung lượng tổng trước finalize và hiện lỗi sync cho user.

### C14 [CAO] (returns) AdminOrderDrawer lưu trạng thái mới trước onUpdateStatus nên đóng/huỷ qua drawer không đổi tồn kho

- File: `src/components/AdminOrderDrawer.tsx:400`
- Cách tái hiện: Đơn có `stockDeducted=true`, ví dụ `確認済み` chưa giao hoặc đơn đang chờ return trong `AdminRecovery`. Admin mở chi tiết, sửa status sang `キャンセル` hoặc `返却済`, bấm save. `onUpdateOrder` có payload gồm status mới và `OrderBus.patch` cập nhật `_mem` ngay. Sau đó `onUpdateStatus` đọc lại live order đã đóng và `settleReturnStock` bị guard `closed->closed`, không `restoreOrderStock`, không `stockRestored`.
- Ảnh hưởng: Huỷ trước giao qua edit modal làm mất vĩnh viễn tồn kho đã trừ; đường rescue close của admin trở thành dead code.
- Hướng sửa: Khi `statusChanged && onUpdateStatus`, tách `status` khỏi payload `onUpdateOrder` và để `onUpdateStatus` patch trạng thái cùng ledger flags. Hoặc thêm `prevStatus` rõ ràng cho `settleReturnStock`. Đây là cùng bug gốc với C1 nhưng được báo cáo dưới area `returns`.

### C15 [CAO] (returns) finalizePartialReturn copy itemIssues sang đơn tiếp tục, gây tính compensation hai lần

- File: `src/utils/returnProcessing.ts:268`
- Cách tái hiện: Đơn item A qty 5. Khách trả 2, warehouse thấy 1 hỏng; `StaffDashboard.completeReturn` đặt `compensationCharge` cho đơn `-R`. `finalizePartialReturn` lại ghi `itemIssues [{A, broken, 1}]` lên đơn còn tiếp tục. Sau đó admin mở đơn tiếp tục trong `AdminFieldReportManagement`; form prefill broken=1 và khi bấm `報告を完了する`, `submitReport` tính compensation lần hai trên đơn tiếp tục.
- Ảnh hưởng: Cùng đơn vị hỏng/mất bị billing compensation trên cả đơn `-R` và đơn tiếp tục. Phụ: issues cũ làm `restoreOrderStock` giảm số lượng `back` khi rescue-close đơn tiếp tục, gây under-restock.
- Hướng sửa: Trong partial path của `finalizePartialReturn`, không ghi `itemIssues` lên remaining-order update. Nếu cần hiển thị ở cột `不足・破損`, lưu vào key không billing như `lastReturnItemIssues`.

### C16 [TRUNG BÌNH] (returns) Auto-balance issue counter xoá mất counter còn lại

- File: `src/components/AdminFieldReportManagement.tsx:326`
- Cách tái hiện: Item qty 10. Admin nhập `紛失=3`, state thành `{missing:3, broken:0, ok:7}`. Sau đó nhập `破損=1`; tổng vượt 10 nên branch overflow cho `broken` set `missing = 0`, `ok = maxQty - broken`, thành `{missing:0, broken:1, ok:9}`. Chỉnh sửa theo thứ tự ngược cũng xoá giá trị trước.
- Ảnh hưởng: Không thể nhập tự nhiên case vừa mất vừa hỏng; giá trị trước bị xoá âm thầm, compensation và `itemIssues` sai.
- Hướng sửa: Khi overflow, giảm `ok` trước thay vì zero trường anh em. Nếu field là `broken`, clamp `broken = Math.min(broken, maxQty - missing)` và `ok = maxQty - missing - broken`; làm đối xứng cho `missing`, và clamp `ok` nếu edit `ok`.

### C17 [THẤP] (returns) getMatchingWalkinReturn match nhầm ticket do `undefined === undefined`

- File: `src/components/AdminFieldReportManagement.tsx:57`
- Cách tái hiện: Một recovery đang chạy tạo `walkinReturns` record có `firestoreId` undefined. Trong danh sách verification, mọi order cũng không có `firestoreId` sẽ thoả `w.firestoreId === order.firestoreId`, vì undefined bằng undefined, nên `find()` trả về ticket không liên quan. Row và header có thể hiện sai `現場回収・一括返却`.
- Ảnh hưởng: Badge hình thức thu hồi sai cho các order không liên quan khi có ticket pending. Chỉ là lỗi hiển thị nhưng gây nhầm lẫn.
- Hướng sửa: Trước khi so sánh mỗi key, yêu cầu key có giá trị: `!!w.orderId`, `!!w.firestoreId`, `!!w.orderNumber`.

### C18 [THẤP] (returns) firstPhotoUrl không đọc shape `{dataUrl}` nên ảnh thu hồi bị ẩn

- File: `src/components/AdminFieldReportManagement.tsx:43`
- Cách tái hiện: Staff hoàn tất collection job trong `StaffJobDetail`, `collectionPhotos` là object `{dataUrl:"data:..."}`. Admin mở detail `返却検品・紛失破損照合`; `firstPhotoUrl` chỉ nhận string hoặc object có `url`, nên trả chuỗi rỗng và block `現場写真` không render, dù `hasPhotoValue()` nói có ảnh.
- Ảnh hưởng: Admin không xem được ảnh bằng chứng thu hồi từ staff flow, dễ tưởng dữ liệu đã mất.
- Hướng sửa: Cho `firstPhotoUrl` chấp nhận cả key `dataUrl`: trả `url || dataUrl || ""`.

### C19 [CAO] (vehicles) Sửa xe trong AdminVehicles reset stock product liên kết về vehicle.stock cũ

- File: `src/pages/Admin/AdminVehicles.tsx:141`
- Cách tái hiện: Tạo xe với `保有台数 3`, product liên kết có stock 3. Đơn rental 2 xe được xác nhận, `deductOrderStock` đặt product stock=1, nhưng `vehicle.stock` vẫn 3. Admin mở `車両管理`, sửa metadata như mileage và save. `syncLinkedProduct` dùng `merged.stock=3` và patch product về stock 3. Hệ thống hiện onHand 3 + đang cho thuê 2 = tổng 5, dù thực tế chỉ có 3. Sau final inspection lại add 2, stock có thể thành 5.
- Ảnh hưởng: Sửa metadata bình thường tạo tồn kho ảo, làm overstated availability, oversell và corrupt ledger; cũng ghi đè các điều chỉnh nhập/xuất/kiểm kê.
- Hướng sửa: Trong `syncLinkedProduct`, với product đã tồn tại thì không bao giờ overwrite stock từ vehicle. Nếu product mới thì mới dùng `merged.stock` hoặc default. Về lâu dài, không persist `stock` trên vehicle, coi product liên kết là source of truth.

### C20 [CAO] (vehicles) Sửa xe bảo vệ trong Product Management xoá ngày hết hạn kiểm định, năm xe, màu xe

- File: `src/components/AdminProductManagement.tsx:605`
- Cách tái hiện: Đăng ký xe trong `車両管理` với `車検満了日` như 2026/07/20. Sau đó sửa giá rental của xe trong `商品管理 -> 保安車両 -> 編集`. Modal vehicle không có input tên `inspectionDate/year/color`, nên `formData.get()` trả null và code set `inspectionDate=""`, `year=""`, `color=""`, rồi `updateVehicle` ghi đè giá trị đã lưu.
- Ảnh hưởng: Mất ngày hết hạn kiểm định có tính pháp lý qua một thao tác không liên quan; xe quá hạn/sắp hết hạn biến khỏi alert/KPI, tạo rủi ro compliance. Năm xe/màu xe nhập từ `AdminVehicles` cũng bị xoá.
- Hướng sửa: Trong `saveVehicle`, không đưa các key không có input vào `vehicleData`, hoặc preserve `editingVehicle?.inspectionDate/year/color`. Cách khác là thêm input thiếu vào modal với `defaultValue`.

### C21 [TRUNG BÌNH] (vehicles) Edit xe trong Product Management prefill số lượng từ vehicle.stock cũ và ghi tuyệt đối vào product.stock

- File: `src/components/AdminProductManagement.tsx:1333`
- Cách tái hiện: Xe có `保有台数 3`, product stock 3. Hai xe đang cho thuê, product stock còn 1, `vehicle.stock` vẫn 3. Admin sửa đơn giá trong `商品管理`; field `保有台数` prefill 3 từ `editingVehicle.stock`. Admin save không chạm field, `updateProduct` ghi stock=3 tuyệt đối. On-hand tăng 1 -> 3 dù 2 xe đang ngoài kho.
- Ảnh hưởng: Giống C19, tạo tồn kho ảo và ghi đè mọi điều chỉnh nhập/xuất/kiểm kê từ sau lần edit xe trước. Admin khó phát hiện vì số 3 trong UI nhìn như tổng số sở hữu hợp lý.
- Hướng sửa: Prefill từ live linked product stock thay vì mirror trên vehicle; chỉ ghi stock nếu giá trị thật sự thay đổi so với live prefill. Bỏ mirror `stock` khỏi vehicle record.

### C22 [THẤP] (vehicles) Nút status `整備中` trong admin tạo duplicate maintenance schedule

- File: `src/pages/Admin/AdminVehicles.tsx:351`
- Cách tái hiện: Trong drawer `AdminVehicles` hoặc drawer xe `AdminWarehouse`, bấm `整備中 -> 空車 -> 整備中` cho cùng xe. Mỗi lần `整備中` đều push một record `MN-*` status `予定`. Staff path trong `MobileLiveContext.setVehicleStatus` có check `exists`, hai admin path không có.
- Ảnh hưởng: Maintenance task mở bị nhân đôi trong `AdminMaintenance` và dashboard KPI, queue bị rác với các task không ai đóng.
- Hướng sửa: Trước `OrderBus.push("maintenance", ...)`, check có task `予定` cùng `plate` hoặc `name` chưa. Nếu có thì bỏ qua. Thêm `plate` vào record push để dedupe ổn định.

### C23 [THẤP] (vehicles) setVehicleStatus patch status nhưng không patch statusColor

- File: `src/context/MobileLiveContext.tsx:559`
- Cách tái hiện: Xe đang `空車` với `statusColor="blue"`. Staff app đổi sang `使用中` qua `setVehicleStatus`, code chỉ patch `{status}`. `AdminVehicles` render badge tone theo `statusColor`, nên chữ hiện `使用中` nhưng màu vẫn blue/default thay vì emerald. Sai đến khi admin edit xe và recompute màu.
- Ảnh hưởng: Màu badge sai trên bảng/drawer quản lý xe, admin scan bằng màu có thể đọc nhầm trạng thái đội xe.
- Hướng sửa: Patch cả `statusColor` cùng status, hoặc dùng render-time derivation từ `status` thay vì persist `statusColor`.

### C24 [CAO] (dashboard) Partial return và admin backfill lịch sử gửi email “đã nhận đơn” sai cho khách

- File: `public/api/order_mail.php:31`
- Cách tái hiện: Đơn có `userEmail`, status `レンタル中`. Admin thực hiện `一部返却`; `addCustomOrder` tạo đơn split trả về với id mới, status `返却済`, vẫn mang `userEmail`. `OrderBus.push` gửi POST store orders; server thấy `$previous === null` nên `order_mail_event()` vào branch tạo mới và gửi email `ご注文を受け付けました` với mã `#ORD-...-R-...`, tổng tiền phần trả về, status hiện tại `返却済`. Tương tự khi admin backfill đơn lịch sử có email và status sinh ra đã `返却済/完了/キャンセル`.
- Ảnh hưởng: Mỗi partial return có thể gửi hai email: email status đúng cho đơn còn lại, và email sai báo vừa nhận một đơn mới khách không đặt. Khách có thể hiểu là bị tính tiền đơn mới. Backfill lịch sử cũng spam khách.
- Hướng sửa: Trong `order_mail_event`, nếu `$old === null` nhưng `$newStatus` đã là `返却済/返却済み/完了/キャンセル`, không gửi mail created. Có thể gửi mail status `返却済` thay vì suppress tuỳ chính sách.

### C25 [TRUNG BÌNH] (dashboard) Badge sidebar `車庫` và bell notification dùng inspectionDaysRemaining đã lưu cũ

- File: `src/pages/Admin/AdminDashboard.tsx:132`
- Cách tái hiện: Ngày 2026-06-01 admin lưu xe có `inspectionDate 2026-06-20`, `inspectionDaysRemaining=19`. Đến 2026-07-03, kiểm định quá hạn 13 ngày. Các màn hình recompute từ `inspectionDate` hiện quá hạn, nhưng `AdminDashboard.tsx` dùng `Number(v.inspectionDaysRemaining ?? 999) < 0`, vẫn thấy 19 nên badge `車庫管理` là 0. `buildAdminNotifications` cũng dùng field cũ, có thể mất thông báo sắp hết hạn.
- Ảnh hưởng: Xe quá hạn/sắp hết hạn biến khỏi badge sidebar và bell nếu record không được lưu lại gần đây; cùng dashboard lại có alert card đúng, gây mâu thuẫn.
- Hướng sửa: Ở cả `AdminDashboard.tsx` và `utils/notifications.ts`, tính lại số ngày từ `inspectionDate` theo date-only helper, fallback về field đã lưu nếu không có date.

### C26 [TRUNG BÌNH] (dashboard) Calendar hiện sự kiện giao/bắt đầu rental/trả dự kiến cho đơn đã huỷ

- File: `src/pages/Admin/AdminCalendar.tsx:134`
- Cách tái hiện: Tạo đơn có `deliveryDate 2026-07-10`, `rentalEndDate 2026-07-31`, sau đó huỷ status `キャンセル`. Mở calendar tháng 7: ngày 7/10 vẫn có event `納品`, ngày 7/31 có `返却予定`; cả hai cũng hiện trong panel `今後の予定`. Vòng lặp `rawOrders.forEach` không check status.
- Ảnh hưởng: Điều phối có thể thấy lịch giao/thu cho đơn không còn tồn tại nghiệp vụ, dễ lên lịch xe sai. Dashboard home đã exclude `キャンセル`, nên hai màn hình mâu thuẫn.
- Hướng sửa: Đầu loop orders trong `AdminCalendar.tsx`, nếu status là `キャンセル` thì return. Vẫn giữ `返却済/完了` để hiện lịch sử giao/trả.

### C27 [THẤP] (dashboard) KPI hiệu suất và donut maintenance double-count đơn `処理中`

- File: `src/components/AdminDashboardHome.tsx:180`
- Cách tái hiện: Product stock=10, có một đơn mới status `処理中` qty 5. Stock chỉ bị trừ khi `受注確定/確認済み`, nhưng KPI `activeRentQty` đếm mọi rental order chưa closed, nên đếm 5 đang thuê; inventoryBase = 10 + 5 = 15 và utilization hiện 33% dù chưa có hàng nào rời kho. Donut cũng đếm 5 đang hoạt động và 10 stock trống, double-count cùng 5 đơn vị.
- Ảnh hưởng: Hiệu suất sử dụng và slice `稼働中` bị phóng đại khi có đơn chưa xác nhận.
- Hướng sửa: Loại order `処理中` khỏi `activeRentQty`, hoặc yêu cầu `stockDeducted === true`, trong cả memo KPI và donut.

### C28 [THẤP] (dashboard) Sparkline tổng doanh thu ghi “7 ngày gần đây” nhưng thành 7 tuần/tháng

- File: `src/components/AdminDashboardHome.tsx:537`
- Cách tái hiện: Trên dashboard, đổi chart `売上推移` sang `月別` hoặc `週別`. `miniBarData = trendData.slice(-7)` giờ chứa bucket theo tháng/tuần, nhưng card `総売上高` vẫn caption `直近7日の売上` và tooltip hiện tổng tháng.
- Ảnh hưởng: User đọc “7 ngày gần đây” nhưng giá trị là theo tháng/tuần, có thể inflated rất lớn sau khi đổi chart không liên quan.
- Hướng sửa: Tách sparkline khỏi `trendRange`; tính series 7 ngày riêng từ `orders` với logic bucket daily cố định.

### C29 [TRUNG BÌNH] (datalayer) OrderBus.patch ghi full record từ bản local có thể cũ tới 3 giây, làm mất concurrent write

- File: `src/lib/orderBus.ts:655`
- Cách tái hiện: Staff app hoàn tất giao hàng, patch thêm `deliveryConfirmedAt`, ảnh/chữ ký, `staffStatus`, status `レンタル中` lên server. Admin vừa lưu drawer trong cửa sổ trước poll 3s; `OrderBus.patch` merge field admin lên bản local cũ, rồi `_upsertExternalized` POST toàn bộ record. `store.php` `ON DUPLICATE KEY UPDATE data = VALUES(data)` full replace server data, xoá các field staff vừa ghi. Lần poll sau staff cũng bị overwrite.
- Ảnh hưởng: Mất vĩnh viễn trường ghi đồng thời, nghiêm trọng với ảnh/chữ ký/thời điểm giao-nhận và edit đồng thời hai admin. Server có `rev` nhưng không dùng để concurrency control.
- Hướng sửa: Thêm optimistic concurrency: gửi `lastSeenRev` trong `apiUpsert`, server reject 409 nếu rev đã đổi; client refetch, apply chỉ các key `updates`, retry. Cách nhẹ hơn: trong `patch()`, trước upsert fetch record mới từ server và merge updates lên bản mới để giảm cửa sổ clobber.

### C30 [TRUNG BÌNH] (datalayer) Nút `却下` không check live status và không restore stock

- File: `src/pages/Admin/AdminRental.tsx:131`
- Cách tái hiện: Đơn trong queue `受注待ち`. Admin bấm `受注確定`, stock bị trừ và local bus status thành `確認済み`, nhưng server upsert async. `setTimeout(refresh, 300)` có thể query server trước khi upsert xong, row vẫn hiện trong queue với nút `却下`. Admin nghĩ accept fail và bấm reject; line 131 patch `{status:"キャンセル", staffStatus:""}` không gọi `settleReturnStock`, nên stock vừa trừ không được trả. Sau đó status closed nên guard `closed->closed` chặn mọi restore sau này. Lỗi tương tự ở `AdminSales.tsx`.
- Ảnh hưởng: Tồn kho vật lý bị thiếu vĩnh viễn, đơn đã confirmed bị lật thành cancel và delivery job bị huỷ. Khó phát hiện vì guard sau đó chặn restore.
- Hướng sửa: Trong `handleReject`, đọc live order từ `OrderBus` trước. Nếu live status không còn pending, abort với toast `既に処理済みです` và refresh. Nếu vẫn pending/cần huỷ, patch status kèm `...settleReturnStock(raw, "キャンセル")` để trả stock nếu đã trừ.

### C31 [THẤP] (datalayer) loadMore append không dedupe khi server page theo `ORDER BY rev DESC`

- File: `src/lib/ordersQuery.ts:84`
- Cách tái hiện: Queue có hơn 50 order. Load page 1 theo `rev DESC`. Một client bất kỳ update một order trong tập filter, rev tăng và row đi lên vị trí 0. Bấm `さらに表示`, offset=50 trên thứ tự đã dịch chuyển; `setRows(prev => [...prev, ...r.rows])` append nguyên, có thể duplicate một order và bỏ sót một order cho đến poll 8s thay thế window.
- Ảnh hưởng: Admin thấy đơn lặp và có thể mất một đơn trong view paged tạm thời; với staff field hoạt động liên tục, việc này có thể lặp lại. Khác với cap 500 row đã biết, đây là drift do paging offset.
- Hướng sửa: Khi append, dedupe theo `firestoreId || id`. Để xử lý mất row tốt hơn, chuyển paging sang cursor theo `rev` nhỏ nhất đã nhận thay vì offset.

## PLAUSIBLE: 1 lỗi có khả năng

### P1 [TRUNG BÌNH] (datalayer) deductOrderStock trả `stockDeducted:true` nhưng không ghi `stockDeductedQty=0` khi không tìm thấy product

- File: `src/utils/stockLedger.ts:98`
- Cách tái hiện: Đơn có rent item mà product không resolve được lúc `受注確定`, ví dụ product đã bị xoá khỏi master hoặc store products chưa sync trong session mới. `deductOrderStock`: `adjustProductStock` trả null, code `if (!prod) return;` thoát trước khi set `it.stockDeductedQty = actual`, nhưng hàm vẫn trả `{ stockDeducted: true }`. Nhiều tháng sau product được tạo lại cùng tên; khi đơn return và final inspection, `restoreOrderStock` fallback `cap = it.quantity` vì `stockDeductedQty` null, tìm product theo tên và cộng full quantity vào stock, dù trước đó chưa từng trừ.
- Ảnh hưởng: Tạo tồn kho ảo âm thầm, đúng lớp lỗi mà codebase đã có nhiều guard để tránh. Sổ sách hiện nhiều hàng hơn thực tế, đơn sau có thể được chấp nhận trên stock không tồn tại.
- Hướng sửa: Trong `deductOrderStock`, trước khi skip vì không có product, gán `it.stockDeductedQty = 0`. Như vậy restore cap sẽ là 0 cho item chưa từng rời ledger. Không ảnh hưởng legacy order vì chúng không có `stockDeductedQty` và vẫn dùng fallback quantity có chủ đích.

