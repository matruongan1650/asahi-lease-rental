# スタッフAPK（配送・回収・持込返却・倉庫検品）

> [← Danh mục chức năng](../CHUC_NANG.md)

スタッフ用モバイルアプリ（Capacitor APK / Web スタンドアロン）。エントリは `src/staff-main.tsx` → `StaffAuthGate` → `StaffStandaloneApp`（`StaffDashboard.tsx`）。全画面は `MobileLiveProvider`（`src/context/MobileLiveContext.tsx`）配下で、注文/商品/車両などのライブデータを `OrderBus` 経由で購読する。データ層（在庫・請求・返却確定）は共通ユーティリティ（`stockLedger.ts` / `billing.ts` / `returnProcessing.ts`）に委譲する。

## 認証・ルーティング（StaffAuthGate / StaffRoot）
- **Làm gì**: Đăng nhập nhân viên và định tuyến toàn app; chỉ role `staff`/`admin` không bị `inactive` mới vào được. Mọi URL lạ redirect về `/staff`.
- **File**: `src/staff-main.tsx`（`StaffRoot`）, `src/components/staff/StaffAuthGate.tsx`（`StaffAuthGate`, `StaffLoginScreen`）
- **Luồng / dữ liệu**: login bằng email / `id` / `employeeCode` (đối chiếu lowercase). `canUseStaffApp = currentUser && status!=="inactive" && (role==="staff"||"admin")`. `handleLogin` gọi `login(target.id, password)` **bằng `id` duy nhất** (không dùng email).
- **⚠️ Lưu ý**: Khi `usersLoaded` chưa xong, trả "読み込み中" thay vì "アカウントが見つかりません" (tránh false negative lúc khởi động). Dùng `target.id` chứ không phải email để tránh fail-closed khi email trùng. Các màn orphan (StaffJobList/StaffJobDetail/StaffVehicleDetail) đã bị gỡ khỏi route — URL trực tiếp bị `*` redirect về `/staff`.

## MobileLiveContext（ライブデータ層 / job claim）
- **Làm gì**: Provider trung tâm: dẫn xuất danh sách phối/thu hồi từ orders thật, và cung cấp toàn bộ hàm ghi dữ liệu (hoàn tất phối, thu hồi, kho, xe).
- **File**: `src/context/MobileLiveContext.tsx`（`MobileLiveProvider`, `useMobileLive`, `completeDelivery`, `completeRecovery`, `undoRecovery`, `adjustStock`, `setStock`, `addStockMove`, `pushFieldReportsLocal`, `daysUntil`）
- **Luồng / dữ liệu**:
  - `liveDeliveries` (useMemo): chỉ order đã 受注確定 — `status` ∈ `DELIVERY_CONFIRMED_STATUS`(確認済み/準備中/配送予定/配送中) hoặc `staffStatus` ∈ 配送予定/配送中/割当済み; loại `DELIVERY_EXCLUDED_STATUS`.
  - `liveRecoveries` (useMemo): cần `rentalEndDate`, đã giao (`deliveryConfirmedAt` hoặc staffStatus/status sau giao), còn hàng rent chưa trả (`quantity - returnedQuantity > 0`, lọc theo `requestedReturn`), và `daysLeft <= 7` hoặc `staffStatus==="回収予定"`.
  - `isClaimedByOther(o, myId)`: ẩn job đã bị nhân viên khác claim (`claimedBy` ≠ myId) trừ khi quá `CLAIM_TTL_MS`(10h) → hiện lại cho mọi người.
- **⚠️ Lưu ý**: `myId = currentUser?.id` — claim owner PHẢI khớp `currentUser.id`, không dùng `staff.id`/`employeeCode`. `completeDelivery`/`completeRecovery` có guard chống double (kiểm `staffStatus`/`completedDeliveryIdsRef`). `daysUntil` tính theo local nửa đêm (tránh lệch ±1 ngày với admin). Xe/maintenance/walkin chỉ dùng data thật (không seed mock). Các hằng `STAFF`/`DELIVERIES`/`RECOVERIES`/`STOCK_MOVES` chỉ là mock fallback tên (STAFF.souko.name làm reporter mặc định).

## 配送フロー（DeliveryFlow）
- **Làm gì**: 5 bước giao hàng tại công trường: 確認→移動→写真→サイン→完了; ghi chữ ký người nhận, ảnh hiện trường, báo cáo hư/thiếu, và checkout xe bảo an.
- **File**: `src/pages/Staff/DeliveryFlow.tsx`（`DeliveryFlow`, `buildExtra`, `finishDelivery`, `pushDeliveryReports`）
- **Luồng / dữ liệu**: `DLV_STEPS=["確認","移動","写真","サイン","完了"]`. Step 2 bắt buộc `photos.length>0`. Step 3 ký (`SignaturePad`→`signed`) hoặc `absentMode` (受領者不在 + `absentNote`). Xe: `hasVehicleItems` dùng `isVehicleCategory(i.category)` (whitelist) → yêu cầu `vehKm`. `buildExtra()` gói `vehicleCheckout`(fuelFull:true)/`deliveryUnsigned`+`absentReason`/`deliveryIssues`. Hoàn tất gọi `onComplete(o.firestoreId||o.id, signed, photos, extra)` → `ml.completeDelivery(..., {deliveredBy: staff.name})`.
- **⚠️ Lưu ý**: **C1** — nút "サインを確定" (finishDelivery) commit NGAY (clearDraft + pushDeliveryReports + onComplete), không hoãn tới step "次の配送へ" (tránh mất data nếu app bị kill sau khi đã hiện thành công). **C2** — khi restore draft, `step` bị clamp `Math.min(..., 2)` vì photo/sign không lưu draft; nếu không sẽ bỏ qua cổng bắt buộc ảnh. Whitelist xe tránh "車両衝突緩衝材" bị nhận nhầm là xe. `completeDelivery` set `rentalStartDate = ngày giao thực` và chốt `invoiceBlocks`/total (課金 bắt đầu từ đây).

## 回収フロー（RecoveryFlow）
- **Làm gì**: 5 bước thu hồi tại công trường: 確認→移動→スキャン→サイン→完了; quét QR đối chiếu, đếm thực (`counted`), báo thiếu/hư, ký; kết quả kiểm hiện trường được chuyển tiếp sang 最終検品.
- **File**: `src/pages/Staff/RecoveryFlow.tsx`（`RecoveryFlow`, `markScanned`, `markManual`, `confirmSign`, `pushReports`）
- **Luồng / dữ liệu**: `RTN_STEPS=["確認","移動","スキャン","サイン","完了"]`. Mỗi product: `{scanned, counted (init=expected), report, manualConfirm}`. `allScanned` gate step 2. `pushReports` tự thêm report `数量不足`(shortage) và `数量超過`(surplus) từ chênh counted vs expected. `confirmSign` gọi `onComplete(id, signed, photos, prods, buildExtra())` → `ml.completeRecovery(..., staffName, extra)`.
- **⚠️ Lưu ý**: `markScanned`/`markManual` chỉ set **1 dòng chưa scan đầu tiên** khi có nhiều dòng cùng product (tránh 1 lần quét qua cổng tất cả). **C1** — commit ngay khi ký. `completeRecovery` KHÔNG cộng kho/không chốt đơn — chỉ set `status="検品待し"`(検品待ち), lưu chữ ký/ảnh, và đẩy phiếu `walkinReturns` `stage:"recheck"` (`source:"field_recovery"`) mang theo `counted`/`report` hiện trường + `receptionReturnDate = ngày thu hồi` (mốc chốt cước 返却分). `collectionUnsigned` truyền sang recheck để bỏ bắt buộc ký ở kho.

## 持込返却・倉庫検品フロー（WalkInReturnFlow）
- **Làm gì**: Kiểm hàng trả 2 giai đoạn tại kho: 一次受付 (khách mang tới) và 最終検品/recheck (chốt); quét QR, đếm, báo hư/thiếu, ký, và record trả xe + phí nhiên liệu.
- **File**: `src/pages/Staff/WalkInReturnFlow.tsx`（`WalkInReturnFlow`, `pick`, `confirmSign`, `reinspect`, `buildExtra`）; xử lý chốt ở `StaffDashboard.tsx`(`completeReturn`)
- **Luồng / dữ liệu**: `WIN_STEPS=["受付","検品","サイン","完了"]`. Danh sách phân tab: `reception`(stage≠recheck) / `recheck`(stage==="recheck") / `history`(`ml.returnInspections`). `isRecheck = order.stage==="recheck"`. Recheck hiện chữ ký cũ (`priorSignature = receptionSignature||fieldSignature`); nếu `absentNoSign` (collectionUnsigned && không có prior) thì bỏ ký. Xe (recheck): `vehicleCheckin` + `fuelFull`; nếu không đầy → nhập `fuelCost` + ảnh `fuelReceipt` → `extra.fuelCharge`. `reinspect` đẩy lại phiếu `WIN-RE-...` stage recheck với `counted=expected`.
- **⚠️ Lưu ý**: `confirmSign` (step 検品→サイン) tự thêm `数量不足`/`数量超過` vào report rồi push `fieldReports` (source "持込返却") — trước đây chỉ hiển thị "đã gửi" mà không gửi. **C3** — reinspect khởi tạo `counted=expected` (không phải 0) tránh phantom thiếu. `markScanned`/`markManual` chỉ set 1 dòng đầu chưa scan. Step 完了 có xác nhận 2 lần (`confirmingFinal`) trước `onComplete` vì "確定すると在庫・請求に反映され、取り消せません".

## 返却確定処理（completeReturn — 2段階検品の核心）
- **Làm gì**: Xử lý hoàn tất kiểm trả: giai đoạn 一次受付 chỉ chuyển phiếu sang recheck; giai đoạn recheck mới cộng kho, chốt đơn, phát hành hóa đơn + tính đền bù.
- **File**: `src/pages/Staff/StaffDashboard.tsx`（`completeReturn` trong `UnifiedStaffApp`）; gọi `restoreOrderStock`(`stockLedger.ts`), `finalizePartialReturn`(`returnProcessing.ts`), `computeCompensationCharge`(`billing.ts`)
- **Luồng / dữ liệu**:
  - **一次受付** (`walkinOrder.stage!=="recheck"`): patch `walkinReturns` → `stage:"recheck"`, lưu `receptionReturnDate` (YYYY-MM-DD, mốc chốt cước), `receptionSignature`, `fieldInspector`; set `expected = counted`, `counted:0`. KHÔNG cộng kho/chốt đơn.
  - **最終検品** (recheck): `shouldRestock` guard (không cộng nếu chưa xuất kho / đã `stockRestored` / là reinspect). 良品 `goodQtyOf = counted − defective(report không phải 不足/紛失)`. `restoreOrderStock` với budget `stockDeductedQty`. `finalizePartialReturn` chốt: `returnQuantities=counted`, `itemIssues` (missing=clamp theo tồn chưa trả, broken=report khác), `actualReturnDate = receptionReturnDate || today`, `extraFields` (`stockRestored`, `finalInspectedBy/At`, `compensationCharge`, `vehicleCheckin`, `fuelCharge`). Sau đó `OrderBus.remove("walkinReturns")` + push `returnInspections`.
- **⚠️ Lưu ý**: `finalizingRef` chống double-submit (連打 tạo nhiều đơn -R, cộng kho 2 lần). **C1** — missing clamp theo `outstanding = quantity − returnedQuantity` (tránh phantom missing → 過大弁償). Đền bù `computeCompensationCharge` vào `extraFields.compensationCharge`. Nếu `finalizePartialReturn` throw: chỉ set `stockRestored:true` (không đụng items/status) rồi giữ phiếu để re-confirm (`shouldRestock=false` lần sau). Reinspect (`source:"reinspect"`) chỉ ghi record, không restock/finalize lại (**C6**).

## スタッフダッシュボード（ホーム / ジョブ claim / 完了追跡）
- **Làm gì**: Màn chính 5 tab (ホーム/配送・回収/入出庫/点検・車両/マイページ), điều phối mở flow, claim/release job, đếm tiến độ hôm nay, và trạng thái đồng bộ.
- **File**: `src/pages/Staff/StaffDashboard.tsx`（`UnifiedStaffApp`, `startFlow`, `claimJob`/`releaseJob`, `RouteOverview`, `DeliveryRecoveryTab`, `ProfileTab`, `HistoryCard`）
- **Luồng / dữ liệu**: `startFlow`(payload dlv/rtn có order) → `claimJob` (OrderBus.patch `claimedBy=myStaffId`). Sau `completeDelivery`/`completeRecovery` → `releaseJob`. `doneDlv`/`doneRtn` lưu theo key `done:{userId}:{JST date}` (`loadDraft`/`saveDraft`), reset khi qua ngày JST. `pendingSync = OrderBus.pendingCount()` (poll 2s), hiển thị "オフライン"/"送信待ち" + nút `retryPending`. Lịch sử phối/thu suy từ orders (`staffStatus==="配送完了"`/"回収完了" hoặc chữ ký/mốc thời gian), loại `-R-\d+$` (**C25**).
- **⚠️ Lưu ý**: **Thứ tự hooks cố định** — mọi tính toán tổng hợp + `useStaffNotificationAlerts` phải chạy TRƯỚC early-return theo `flow`/`subView`, nếu không React error #300 khi mở flow. `pendingDlvCount`/`pendingRtnCount` đếm bằng filter (không trừ, tránh âm). `totalTasks` cộng completedTasks vào mẫu số (tránh >100%). `resolveOrderId` ưu tiên `rawOrder.id`. **C27** — `RouteOverview.openRoute` lấy đúng 10 điểm đầu (waypoints tối đa 9). Sau `completeDelivery`/`Recovery` gọi `OrderBus.flush(8000)`; nếu fail báo "送信待ち…自動再送".

## 倉庫: 入出庫（WhStock）
- **Làm gì**: Đăng ký nhập/xuất kho thủ công qua quét QR, xem lịch sử, và hủy (取消) phiếu nhập/xuất thủ công.
- **File**: `src/pages/Staff/WarehouseViews.tsx`（`WhStock`, `confirmMove`, `reverseMove`, `canReverse`, `isVehicle`）
- **Luồng / dữ liệu**: `openScan("入庫"|"出庫")` → `ProductQrScanner` → chọn `picked` → `confirmMove`: `applied = isIn ? qty : min(qty, picked.stock)`, gọi `ml.adjustStock(±applied)` + `ml.addMove`. "本日入庫/出庫" chỉ tính phiếu có `date` bắt đầu bằng `todayPrefix`. `reverseMove` tạo phiếu bù chiều ngược + `ref:"取消（{id}）"`.
- **⚠️ Lưu ý**: `movingRef`/`reversingRef` chống double-tap (in kho lặp). `canReverse` chỉ cho phiếu `ref` chứa "手動" và chưa bị hủy (tránh hủy phiếu tự động của stockLedger → phá kho). **C9** — xuất dùng `applied` (clamp tồn) để取消 đối xứng. **C10** — reverse giải product theo `productId` trước; nếu fallback theo tên mà trùng nhiều → hủy thao tác. `adjustStock` clamp `Math.max(0, ...)` (không âm).

## 倉庫: 点検・車両（WhInspect / VehicleDetail）
- **Làm gì**: Quản lý xe: hiển thị/ghi 車検(shaken), bảo hiểm (自賠責/任意), thuế, dầu, lịch sử bảo dưỡng/sửa chữa, và ghi định kỳ 点検 (合格/要整備).
- **File**: `src/pages/Staff/WarehouseViews.tsx`（`WhInspect`, `VehicleDetail`, `recordShaken`, `recordMnt`, `updateVeh`, `setVehStatusLocal`, `vehicleAlerts`, `shakenInfo`）
- **Luồng / dữ liệu**: `shakenInfo(v)` chọn ngày canon (`shaken.next||nextInspectionDate||inspectionDate||next`) và tính lại `days` bằng `daysUntil` (theo hôm nay). `recordShaken` xác nhận rồi patch nested `shaken:{last,next}` + `days`/`inspectionDate`/`nextInspectionDate`. `recordMnt` 合格→dời next theo `cycle`; 要整備→giữ next, `status:"要整備"`. Đổi status gọi `ml.setVehicleStatus` (cập nhật `statusColor` + đẩy maintenance queue nếu 整備中).
- **⚠️ Lưu ý**: Alert dùng field thật, không dùng ngày mặc định (tránh phantom alert cho xe chưa set). Ghi 車検 KHÔNG đổi status vận hành (trước đây ép "使用中"). Nested key phải là object `shaken` (OrderBus merge nông không nhận `"shaken.last"`).残日数 tính theo nửa đêm (tránh ±1 ngày). Tab 法的 dùng `body=` chứ không early-return (nếu không sẽ mất header/back). Tệp đính (車検証...) lưu `{name, dataUrl}`.

## 倉庫: 棚卸し（WhStocktake）
- **Làm gì**: Kiểm kê thực tế qua QR/nhập tay, so `system` (帳簿) vs `counted`, chốt điều chỉnh kho + lưu session + báo cáo hư/thiếu.
- **File**: `src/pages/Staff/WarehouseViews.tsx`（`WhStocktake`, `confirmStocktake`, `initInv`, `INVENTORY_FALLBACK`）
- **Luồng / dữ liệu**: `inv` init từ `ml.products` (loc = `location||bin||shelf||"未設定"`, `system=stock`, `counted:null`). `confirmStocktake` (khi `done`): `diffItems` (counted≠system, loại `EX-`) → `ml.setStock` + `ml.addStockMove` (`棚卸調整(帳簿→実)`) + `ml.recordStocktakeSession` + push `fieldReports` (source 棚卸) cho item có report. Thêm hàng ngoài danh sách qua `EX-` (report `予定外（リスト外）`).
- **⚠️ Lưu ý**: `confirmingStRef` chống double (伝票/session trùng, **C12**). **C14** — `EX-`/hàng chưa giải mã master không tạo phiếu (`setStock` cần targetId). Nút "+ リストにない商品" chỉ hiện sau khi products load (row `EX-` có counted sẽ chặn đồng bộ lần đầu vì điều kiện `every counted===null`).

## 現場フロー・ドラフト退避（flowDraft）
- **Làm gì**: Lưu tạm tiến độ flow (bước/số lượng/report/memo) vào localStorage để khôi phục khi WebView bị hủy (chuyển camera/bản đồ, tiết kiệm bộ nhớ).
- **File**: `src/pages/Staff/flowDraft.ts`（`loadDraft`, `saveDraft`, `clearDraft`）; dùng trong DeliveryFlow/RecoveryFlow + `doneDlv`/`doneRtn`
- **Luồng / dữ liệu**: prefix `asahi.flowDraft.`. Key: `dlv:{id}` / `rcv:{id}` / `done:{userId}:{date}`. `loadDraft` merge vào fallback; `saveDraft`/`clearDraft` nuốt lỗi quota.
- **⚠️ Lưu ý**: **Không lưu ảnh/chữ ký base64** (quota) — chỉ lưu structured data. Vì thế DeliveryFlow phải clamp step ≤2 khi restore. `clearDraft` gọi khi hoàn tất hoặc chủ động hủy (có `confirmDialog` nếu `hasEnteredData`).

## 端末通知・FCM（staffNotify）
- **Làm gì**: Thông báo local (có âm) khi có job mới (配送/回収/持込/点検), và đăng ký FCM token để nhận push cả khi app đã tắt hẳn.
- **File**: `src/lib/staffNotify.ts`（`initStaffNotify`, `initStaffPush`, `useStaffNotificationAlerts`）; init trong `StaffDashboard.tsx`
- **Luồng / dữ liệu**: `useStaffNotificationAlerts(staffNotifications, ml.connected)`: so sánh signature (`id`+title), chỉ rung khi id mới hoặc `countOf(title)` tăng; lưu `SEEN_KEY` (v2, số lượng). `initStaffPush(userId)` chờ `getUserToken()` (tối đa ~10s) rồi `register()`, upsert `pushTokens` (id = `pt-{tokenHash}`).
- **⚠️ Lưu ý**: **Web = no-op** (chỉ chạy khi `Capacitor.isNativePlatform()`). `initStaffNotify` và `initStaffPush` gọi tuần tự (cùng quyền POST_NOTIFICATIONS — song song sẽ đốt "lần 2 = từ chối vĩnh viễn" của Android). **C20** — không rung khi `!ready` (chưa sync) và lần đầu (`SEEN_KEY===null`) chỉ ghi nhận. Khi có FCM token + background (`visibilityState==="hidden"`) thì bỏ local (tránh rung 2 lần). Cần `google-services.json` + server (`store.php`) để FCM thực sự hoạt động.

---
