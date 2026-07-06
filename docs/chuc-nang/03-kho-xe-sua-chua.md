# 管理画面：在庫・倉庫・車両・修理保証・点検

> [← Danh mục chức năng](../CHUC_NANG.md)

> 共通前提: 在庫の唯一の正は **`products.stock`（現物在庫）**。「台帳（ledger）モデル」で管理し、受注確定で減算・倉庫最終検品で加算する（`src/utils/stockLedger.ts`）。全書き込みは `OrderBus`（`src/lib/orderBus.ts`, localStorage + BroadcastChannel + /api sync）経由でクロスタブ同期される。車両連動商品（`vehicleId` 付き / カテゴリが `isVehicleCategory`）は保安用品在庫から必ず除外し二重計上を防ぐ。日時はほぼ全画面で `Date.now() + 9h` して JST 壁時計を得る（`toISOString()` の UTC ずれ対策）。

## 入庫管理（AdminStockIn）
- **Làm gì**: Ghi nhận nhập kho (mua mới / thu hồi trả lại / điều chỉnh) và cộng vào tồn kho thực của sản phẩm.
- **File**: `src/pages/Admin/AdminStockIn.tsx` (component `AdminStockIn`, hàm `saveStockIn(keepOpen)`).
- **Luồng / dữ liệu**: chọn `itemSelect` (từ `supplyProducts` = products đã lọc bỏ vehicle) hoặc `その他 (直接入力)` → nhập `qty`/`type`(`新規購入`/`回収戻し`/`その他`)/`src`(伝票参照)/`staff`. Khi lưu: `OrderBus.push("stockIn", {id:"IN-…", item, qty, date, src, type, staff, seq, icon:"boxIn"})`. Nếu khớp product theo `name` → đọc lại tồn mới nhất (`OrderBus.getAll("products")`) và `patch("products", id, { stock: base + qty })`. Nút「保存して続ける」= `keepOpen=true`.
- **⚠️ Lưu ý**: Khớp product **theo tên (`p.name === itemName`)**, không theo ID — trùng tên sẽ cộng nhầm; item không có trong master (直接入力) chỉ ghi lịch sử, **không** điều chỉnh tồn. `savingRef` chặn double-submit 800ms. Đọc lại tồn "fresh" trước khi ghi để tránh ghi đè lost-update từ tab/thiết bị khác. StatCard `todayCount` tính theo ngày JST.

## 出庫管理（AdminStockOut）
- **Làm gì**: Ghi nhận xuất kho (レンタル/販売) và trừ tồn kho thực; có chặn oversell.
- **File**: `src/pages/Admin/AdminStockOut.tsx` (component `AdminStockOut`, hàm `saveStockOut(keepOpen)`, `handleOpenModal(kind)`).
- **Luồng / dữ liệu**: `actionKind` = `"レンタル"|"販売"` (chọn qua 2 nút). Khi lưu: tìm `match` theo tên → đọc `fresh` stock → nếu `onHand < qty` báo `在庫不足`. Ghi `OrderBus.push("stockOut", {id:"OUT-…", item, qty, date, dst, type:actionKind, staff, icon:"boxOut"})` rồi `patch("products", id, { stock: Math.max(0, onHand - qty) })`. `availableTotal` = tổng `stock` các supplyProducts.
- **⚠️ Lưu ý**: Kiểm tra và trừ tồn dựa trên **`fresh` stock** (không dùng snapshot render `match.stock`) để tránh oversell khi có xung đột với 受注確定. Không có option `その他` cho item (chỉ chọn từ master). `savingRef` chặn double-submit.

## 棚卸（AdminStocktake）
- **Làm gì**: Kiểm kê định kỳ 保安用品 + 保安車両: nhập số thực đếm, so với sổ sách, rồi chốt để ghi đè tồn theo số thực.
- **File**: `src/pages/Admin/AdminStocktake.tsx` (component `AdminStocktake`; `finalizeStocktake()`, `exportCsv()`, `importCsv()`, `handlePhotoUpload/handleFileUpload`).
- **Luồng / dữ liệu**: `baseRows` gộp supply rows (từ products, key = `p.id`) và vehicle rows (key = `vehicle:${v.id}`, system = `v.stock ?? linkedProduct.stock ?? 1`). `countDraft[key]` lưu số thực nhập; `state` = `未確認`(chưa nhập)/`差異なし`/`差異あり`. Khi chốt (`finalizeStocktake`): `OrderBus.push("stocktake", {…items, photos, files, diffItems…})`, rồi với mỗi diffRow: nếu là vehicle → `updateVehicle(vehicleId, { stock })`; nếu supply → `OrderBus.patch("products", productId, { stock })`; luôn `OrderBus.push("stockMoves", {type:"棚卸調整", qty: diff, stocktakeId})`. Tab `history` đọc collection `stocktake`.
- **⚠️ Lưu ý**: Row vehicle **chỉ cập nhật `vehicles.stock`, KHÔNG** ghi vào `products.stock` (nhiều xe cùng trỏ 1 product sẽ phá tồn). Số thực luôn bị sanitize `Math.max(0, Math.trunc())` cả ở nhập tay lẫn `importCsv`. `finalizingRef` chặn double-finalize. Import CSV khớp theo **cột ID = cột 2, cột thực = cột 7 (index 6)**, đối xứng với `exportCsv` (BOM UTF-8 + CRLF). File đính kèm được upload qua `uploadDataUrl` lấy URL (không nhúng base64) để tránh phình record; ảnh `photos` vẫn giữ dataURL (đã resize ≤1280px).

## 倉庫管理（AdminWarehouse）
- **Làm gì**: Tổng quan kho: tồn kho + số đang cho thuê (rented) theo品目/ゾーン/カテゴリ, thao tác nhập/xuất/di chuyển kệ/đặt bổ sung, và quản lý trạng thái xe nhanh.
- **File**: `src/pages/Admin/AdminWarehouse.tsx` (component `AdminWarehouse`; `handleSaveSupplyAction`, `isOutOnRental`, `handleVehicleStatusChange`, `handleSaveItem`).
- **Luồng / dữ liệu**: Tabs `overview/supplies/vehicles/alerts`. `rentedCounts` tính từ `orders`: chỉ đơn thoả `isOutOnRental` (đã `stockDeducted`, chưa `stockRestored`, staffStatus≠完了, status không thuộc `CLOSED_ORDER_STATUSES`) và item `type==="rent"`, qty = `quantity - returnedQuantity`. Mỗi SupplyRow: `available = onHand(=stock)`, `total = onHand + rented`, `status` từ `stockStatus()` (在庫なし/要補充≤3/高稼働≥80%/正常). Thao tác qua `handleSaveSupplyAction(kind)`: `stockIn`/`stockOut` (patch stock + push stockIn/stockOut, type `倉庫入庫`/`倉庫出庫`), `move` (patch `location` + push stockMoves `棚移動`), `reorder` (push stockMoves `補充手配` status `予定`). Thêm品目 mới `handleSaveItem` → push products id `P-<base36>-<rand>`. Drawer đơn hàng dùng `AdminOrderDrawer`; `onUpdateStatus` gọi `deductOrderStock` (khi →`確認済み`) hoặc `settleReturnStock`.
- **⚠️ Lưu ý**: `rented`/`total` là **tính động từ orders**, không lưu — sửa đơn hàng sẽ đổi con số này. Mọi ghi tồn đọc lại `freshProduct` trước để tránh lost-update. `reorder` chặn trùng nếu đã có `補充手配` status `予定`; `handleVehicleStatusChange("整備中")` chặn tạo trùng bản ghi `maintenance` status `予定` (C22). ID product mới dùng high-entropy để tránh đè product cũ. `stockOut` có guard `available` nhưng kiểm tra dựa trên snapshot supply, còn ghi thì dựa `currentStock` fresh.

## 車両管理（AdminVehicles）
- **Làm gì**: CRUD xe bảo an, cảnh báo/cập nhật xe kiểm định (車検), ghi điểm kiểm tra/sửa chữa, đồng bộ product liên kết.
- **File**: `src/pages/Admin/AdminVehicles.tsx` (component `AdminVehicles`; `handleSaveItem`, `handleUpdateVehicle`, `handleSaveVehicleAction`, `handleSetStatus`, `syncLinkedProduct`, `daysUntil`, `makeInspectionAlerts`). Dữ liệu qua `useVehicles()` (`src/context/VehicleContext`).
- **Luồng / dữ liệu**: `vehiclesLive` **tính lại `inspectionDaysRemaining = daysUntil(inspectionDate)` mỗi render** (giá trị lưu không dùng). `stats`: total/inUse/idle/maintenance/`inspectionSoon`(≤30 & ≥0)/`inspectionOverdue`(<0). Thêm xe → `addVehicle` + `syncLinkedProduct` tạo product `P-<id>` (`productId`). Action modal 3 loại (`handleOpenAction`): `maintenance` (push `maintenance` status `完了`, thêm `maintenanceHistory`, **không đổi status vận hành**), `repair` (đặt status `整備中`, push `repairs` status `修理待ち`, thêm `repairHistory`), `inspection` (cập nhật `inspectionDate` + alerts, **không** đụng `insuranceDate`). `handleSetStatus("整備中")` cũng push `maintenance` `予定` (có chặn trùng C22).
- **⚠️ Lưu ý**: `syncLinkedProduct` **KHÔNG BAO GIỜ ghi đè `stock` của product đang tồn tại** (chỉ set stock khi tạo product mới); `vehicle.stock` là mirror cũ, để nó ghi đè sẽ tạo幽霊在庫. `車検` (`inspectionDate`) và `自賠責` (`insuranceDate`) là 2 trường độc lập — cập nhật車検 không được đè保険. Ngưỡng cảnh báo ≤30 ngày dùng thống nhất ở filter/KPI/alert/cột bảng. `handleSaveVehicleAction` chặn lưu nếu `actionDate` trống (tránh auto về hôm nay → false alert). Xoá xe cũng `OrderBus.remove("products", productId)`.

## 定期点検（AdminMaintenance）
- **Làm gì**: Quản lý lịch kiểm tra định kỳ thiết bị: đăng ký, thực hiện điểm kiểm (tự tính ngày kế tiếp), và tự sinh yêu cầu sửa nếu 要修理.
- **File**: `src/pages/Admin/AdminMaintenance.tsx` (component `AdminMaintenance`; `submitInspect`, `handleSaveNew`, `addCycle`, `daysBetween`, `parseSlashDate`). Collection `maintenance`.
- **Luồng / dữ liệu**: `rowsWithDays` tính lại `days = daysBetween(today, next)` mỗi render; `status` = `超過`(days<0)/`期限間近`(≤7)/`正常`/`要修理`/`予定`. Đăng ký (`handleSaveNew`): push `maintenance` với `cycle` (`2週間/1ヶ月/3ヶ月/6ヶ月/1年`), status `予定`. Thực hiện (`submitInspect`): `next = addCycle(doneDate, cycle)`, `patch("maintenance", {last, next, days, status, history})` (history unshift bản ghi `合格`/`要修理`); nếu `要修理` → `OrderBus.push("repairs", {status:"修理待ち", sourceInspectionId})` và toast kèm số RP.
- **⚠️ Lưu ý**: `status` **luôn ưu tiên `days` tính lại**, không short-circuit theo status đã lưu (nếu không, quá hạn vẫn xanh "正常" và bị đếm trùng cả 超過 lẫn 正常). `addCycle` với cycle lạ (`臨時`/`記録` do bên車両 tạo) mặc định +3 tháng để không thành "超過" ngay. Liên kết ngược với repairs qua `sourceInspectionId` (được AdminRepairWarranty đóng lại thành `修理完了`).

## 修理・保証（AdminRepairWarranty）
- **Làm gì**: Quản lý vòng đời yêu cầu sửa chữa (修理待ち→修理中→完了), đăng ký báo giá/nhà thầu, và cập nhật ngược nguồn gốc (現場報告/定期点検).
- **File**: `src/pages/Admin/AdminRepairWarranty.tsx` (component `AdminRepairWarranty`; `submitEstimate`, `submitComplete`, `handleCreateRepair`). Collections `repairs`, `vendors`; drawer `AdminDocDrawer` (kind `repair`).
- **Luồng / dữ liệu**: `REPAIR_STATES` = `修理待ち/見積中/修理中/完了`. `submitEstimate`: bắt buộc `vendor` + cost>0 → `patch("repairs", {vendor, cost, status:"修理中", estimatedAt})`. `submitComplete`: cost≥0 → `patch("repairs", {status:"完了", cost, completedAt, completionNote})`; nếu `sourceReportId` → `patch("fieldReports", {status:"対応済"})`; nếu `sourceInspectionId` → `patch("maintenance", {status:"正常"})` + thêm history `修理完了`. `handleCreateRepair(doc)`: map `doc.customer→asset`, `doc.site→vendor`, `warranty:true`. `totalCostThisMonth` lọc `完了` có `completedAt` bắt đầu bằng `YYYY/MM` (JST) hiện tại.
- **⚠️ Lưu ý**: Trong `handleCreateRepair`, **`customer` = tên tài sản, `site` = tên nhà thầu** (tái dụng form doc, không phải nghĩa gốc). Nút thao tác chỉ hiện khi status≠`完了`. Hoàn tất một repair có nguồn点検 sẽ tự chuyển bản ghi maintenance về `正常` — nếu logic maintenance đổi, phải kiểm tra lại `sourceInspectionId`. Search debounce 280ms (`searchInput`→`searchQuery`).

**File phụ trợ liên quan (không thuộc phân hệ nhưng load-bearing)**: `src/utils/stockLedger.ts` (`deductOrderStock`/`restoreOrderStock`/`settleReturnStock`, cờ `stockDeducted`/`stockRestored`/`stockDeductedQty`), `src/utils/productUtils.ts` (`isVehicleCategory`, `VEHICLE_CATEGORIES`, `getSupplyCategories`, `getCategoryIcon`), `src/context/VehicleContext.tsx` (`useVehicles`, type `VehicleDetail`), `src/context/MobileLiveContext.tsx` (`daysUntil` dùng ở AdminWarehouse).

---
