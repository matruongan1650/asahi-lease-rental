# 管理画面：マスタ・設定・監査・ダッシュボード

> [← Danh mục chức năng](../CHUC_NANG.md)

## AdminDashboard シェル（タブ制御・権限ゲート・通知）
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

## 概要ダッシュボード (AdminDashboardHome)
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

## 仕入先管理 (AdminSuppliers)
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

## 修理業者管理 (AdminVendors)
- **Làm gì**: Quản lý nhà thầu sửa chữa (vendors) và tạo yêu cầu sửa (repairs) từ trang vendor.
- **File**: `src/pages/Admin/AdminVendors.tsx` (`AdminVendors`; dùng lại `KV`/`DetailHead` từ AdminSuppliers).
- **Luồng / dữ liệu**:
  - `useAdminCollection("vendors" | "repairs")`; số liệu 進行中/累計/保証 tính từ `repairs` lọc theo `r.vendor === sel.name || r.vendorId === sel.id`.
  - Thêm/sửa (`handleSaveVendor`): id mới `V-<Date.now() 5 số cuối>`; edit `OrderBus.patch`.
  - Nút "修理を依頼": thực sự push `repairs` `{ id:"RP-<...>", status:"修理待ち", req: JST local date (sv-SE), warranty:false, ... }` (trước đây chỉ toast, không lưu).
  - Tabs: 修理業者情報 / 修理担当者 / 修理先住所 / 修理履歴 / 修理・保証情報.
- **⚠️ Lưu ý**: 進行中 = `status !== "完了"`. `req` dùng `toLocaleDateString("sv-SE")` (JST local) — không dùng `toISOString()` (lệch ngày ban đêm). Chi tiết resource của repair phải sửa ở tab 修理依頼.

## 設定・権限 (AdminSettings)
- **Làm gì**: 4 tab thiết lập hệ thống: quyền tài khoản, ロール, thiết lập chung (thuế/thông báo/棚卸/công ty), và データ連携 (seed).
- **File**: `src/pages/Admin/AdminSettings.tsx` (`AdminSettings`; sub: `AddUserModal`, `RolePermModal`, `DataSyncTab`, `ToggleRow`, `PermPill`). Hằng `DEFAULT_SETTINGS`, `PERM_MODULES`, `ROLES`.
- **Luồng / dữ liệu**:
  - **アカウント権限** (tab `users`): `systemUsers` = user `companyType==="our_company"` hoặc role `admin`/`staff`. Gán ロール qua dropdown → `updateUser(id,{permissionRoleId})`. `handleToggleUserStatus` bật/tắt `status` `active`/`inactive`. `AddUserModal` tạo social account (`handleAddUser`, mật khẩu auto nếu trống, gán `permissionRoleId` `admin`/`driver`).
  - **ロール設定** (tab `roles`): `roleRows` từ `OrderBus.getAll("roles")` + subscribe; `normalizeRoles` fallback về `INITIAL_ROLES`. `RolePermModal` sửa `perms[]` (`編集`/`閲覧`/`なし`) theo `PERM_MODULES`; lưu `OrderBus.patch/push("roles", ...)`.
  - **一般設定** (tab `general`): `settingsDraft` (từ `DEFAULT_SETTINGS` merge record `id==="global"`); nút 保存 (`handleSaveSettings`) ghi `systemSettings` id `global` qua patch/push. Các cờ: `taxRate`, `invoiceDue`, `notifyVehicle/notifyOverdue/notifyFieldReport`, `requireStaffSignature`, `stocktakeCycle/Tolerance`, `flagStocktakeDiff`, `allowSameDayBefore14`.
  - **データ連携** (`DataSyncTab`): hiển thị đếm store; nút "初期データを投入" gọi `ctx.seedAll()` (chỉ seed store trống).
- **⚠️ Lưu ý**: Có 4 nút 保存 riêng — sửa settings phải bấm 保存 ở panel 会社情報 (nút save nằm ở đó). `perms` là mảng vị trí theo `PERM_MODULES`, index phải khớp `allowedTabs` ở AdminDashboard. `roleUserCount` đếm theo `userPermissionRoleId(u)` (có fallback theo `user.role`).

## 顧客管理 (AdminCustomerManagement)
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

## カレンダー (AdminCalendar)
- **Làm gì**: Lịch tháng tổng hợp lịch 納品/レンタル/返却/点検/車検 từ đơn & tài sản, cộng lịch tùy chỉnh; click sự kiện đơn mở AdminOrderDrawer.
- **File**: `src/pages/Admin/AdminCalendar.tsx` (`AdminCalendar`; helpers `normalizeDateParts`, `dateKey`). Loại lịch: `CAL_TYPES` (delivery/rental/maint/stock/warranty) trong `adminMockData.ts`.
- **Luồng / dữ liệu**:
  - Sự kiện tự sinh: mỗi order → `deliveryDate`(delivery), nếu có item `type==="rent"` thì `rentalStartDate`/`rentalEndDate`(rental) và `actualReturnDate` nếu khác `rentalEndDate`. **Bỏ order `status==="キャンセル"`** (C26 — tránh điều xe cho lịch không tồn tại). Thêm `maintenance`(点検), `vehicles`(車検).
  - Lịch tùy chỉnh: store `calendarEvents` (`useOrderBusStore`, đồng bộ server); `handleAddEvent` push `{date,t,x}`; xóa qua `OrderBus.remove` (chỉ sự kiện `isCustom`). Có migration 1 lần từ localStorage `asahi.custom_calendar_events_v2`.
  - Grid tuần bắt đầu Thứ Hai (`padLeft`), highlight hôm nay. Panel bên phải "今後の予定" (8 mục, từ `startDayForUpcoming`).
  - Modal chi tiết: sự kiện đơn có nút "注文詳細を開く" → `AdminOrderDrawer`. Cập nhật status trong drawer đi qua 在庫台帳: `status==="確認済み"` → `deductOrderStock` (xuất kho), status返却系 → `settleReturnStock` (nhập kho).
- **⚠️ Lưu ý**: Custom event chỉ hiển thị khi thuộc đúng tháng đang xem (so `y/m`). Cập nhật đơn từ calendar **phải** qua stockLedger (`deductOrderStock`/`settleReturnStock`) như AdminRental/AdminWarehouse — đừng patch status thẳng.

## 操作ログ (監査) (AdminAuditLog)
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
