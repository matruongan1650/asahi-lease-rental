# Staff APK — Audit độ hoàn thiện chức năng (2026-06-19)

32 gap đã xác nhận (35 candidate, 3 refuted) qua 6 phân hệ + kiểm chứng đối nghịch.

### [1][HIGH/partial] Delivery item check / partial delivery / damage at delivery
- src/pages/Staff/DeliveryFlow.tsx:154-161 (delivery-recovery)
- thiếu: The delivery flow only RENDERS the load list read-only (ItemRow with name/qty). There is no per-item check-off, no quantity adjustment, and no way to report that an item is missing, damaged on arrival, or that the customer refused/partially accepted delivery. The recovery sibling flow (RecoveryFlow step 2) has a full scan + QtyStepper (counted vs expected) + DamageReportSheet for exactly this, so the capability exists on one staff screen but is entirely absent on the equally-needing delivery screen. A driver who arrives with a short or damaged load has no way to record it; he is forced to either abort or sign off a delivery that does not match reality.
- hoàn thiện = Add an item-confirmation step mirroring recovery: per-item check/QtyStepper so the driver confirms actually-delivered quantities, plus a 'damage/shortage at delivery' report (reuse DamageReportSheet + pushFieldReportsLocal with source:'配送') that flows to admin. completeDelivery should then persist the actually-delivered quantities instead of assuming the full ordered set was delivered.

### [2][HIGH/missing] Customer-absent / no-signature delivery path
- src/pages/Staff/DeliveryFlow.tsx:245 (delivery-recovery)
- thiếu: Step 4 'サインを確定' is hard-gated on `!signed` (disabled until a signature is drawn). There is no alternative completion path when the customer/contact is not present at the site (a very common field case for construction-site rental drop-offs). The recovery flow has the same hard gate (RecoveryFlow.tsx:324). The driver cannot complete the job — the flow dead-ends at the signature step if nobody is there to sign.
- hoàn thiện = Add a '受領者不在で設置完了' (left at site / customer absent) option that lets the driver complete with a reason note and photo evidence in lieu of a signature, recording deliveryUnsigned:true + reason so admin can follow up. Same for RecoveryFlow.

### [3][MEDIUM/dead-end] StaffJobList screen (配送指示/回収指示/倉庫返却対応 list)
- src/pages/Staff/StaffJobList.tsx:18-78 (route registered in src/staff-main.tsx:30) (dashboard)
- thiếu: StaffJobList is a fully built role-based job list (delivery/collection/warehouse) routed at /staff/:role, but nothing in the staff app ever navigates to it. The dashboard's BottomNav, クイック操作, MetricCards and 優先タスク cards all use the in-component tab system in UnifiedStaffApp (DeliveryRecoveryTab + DeliveryFlow/RecoveryFlow), never a Link/navigate to /staff/:role. A grep for navigation into /staff/<role> returns zero call sites. So an entire alternate list UI — including its 'warehouse return' (検品待ち) queue and 'collection' queue with urgent/期限 highlighting — is orphaned and unreachable by staff.
- hoàn thiện = Either wire the dashboard quick actions / metric cards to navigate to /staff/delivery, /staff/collection, /staff/warehouse (giving staff the role-segmented list + StaffJobDetail check/issue/sign flow), or delete StaffJobList/StaffJobDetail if DeliveryRecoveryTab fully supersedes them. As-is it is a maintained-but-unreachable screen and an inconsistency: the warehouse '検品待ち' queue it exposes has no equivalent entry point on the dashboard.

### [4][MEDIUM/partial] Delivery / Recovery list — search & filter
- src/pages/Staff/StaffDashboard.tsx:430-479 (DeliveryRecoveryTab list rendering) (dashboard)
- thiếu: The 配送/回収/納品履歴/回収履歴 lists are paginated (usePagedList, 50 at a time) but have no search box, no filter, and no sort control. A staff member running the production backend with many active orders can only scroll and tap 'さらに表示'. There is no way to find a specific order by orderNumber, company, site, or address, nor to filter by 急ぎ/window/担当. StaffJobList similarly filters only by status with no text search (line 24).
- hoàn thiện = Add a search input (matching order id/orderNumber, company, site name, address) and at minimum a 急ぎ/window quick-filter on each sub-tab of DeliveryRecoveryTab, so a driver can locate a job among dozens without paging through the whole list.

### [5][MEDIUM/partial] Home '業務進捗' progress excludes walk-in returns and inspections
- src/pages/Staff/StaffDashboard.tsx:936-942, 1038-1042 (dashboard)
- thiếu: completedTasks = doneDlv.length + doneRtn.length and totalTasks = deliveries + recoveries + completed. The progress bar and 本日の業務 framing therefore only measure delivery/recovery. 持込返却 (walkinCount) and 点検要対応 (overdueVeh+overdueMnt) are surfaced as their own MetricCards/AlertRows but are not part of '本日の業務 進捗', so a day spent entirely on returns/inspections shows 0/0 progress. The headline widget under-represents the staff member's actual workload.
- hoàn thiện = Include walk-in returns processed this session and inspections/maintenance handled in the completed/total counts (or relabel the bar explicitly as 配送・回収進捗) so the home progress reflects all dashboard task types rather than two of four.

### [6][MEDIUM/partial] Mid-flow correction / back navigation between steps
- src/pages/Staff/DeliveryFlow.tsx:73-75 (delivery-recovery)
- thiếu: Both flows only move forward: `next()` does `Math.min(len-1, s+1)` and there is no `prev()`/back-to-previous-step control. The TopBar back button calls onExit (abandons the whole flow), it does not step back. Once a driver advances from 写真 to サイン (or from スキャン to サイン in recovery), he cannot return to add/remove a photo or fix a counted quantity / damage report without exiting and losing all in-progress state. Step state is local useState with no draft persistence, so exiting discards everything.
- hoàn thiện = Make the TopBar back button (or a dedicated '戻る' control) decrement the step when step>0 and <final, so staff can correct an earlier step; keep onExit only as an explicit 'abandon job' action with a confirm. Ideally also persist in-progress flow state (photos/scan/counted) to local storage so an accidental exit or app backgrounding does not lose field work.

### [7][MEDIUM/missing] Delivery field report to admin (no issue channel)
- src/pages/Staff/DeliveryFlow.tsx:57-67 (delivery-recovery)
- thiếu: DeliveryFlow has no pushFieldReportsLocal call at all (unlike RecoveryFlow.tsx:59-89 which reports shortages/damage to admin). buildExtra only captures the optional 保安車両 km/condition. If anything goes wrong during delivery (wrong item loaded, access blocked, customer dispute), there is no structured way for the driver to notify admin from within the flow — only the free-text incoming `o.note` is shown, which is one-directional (admin→staff).
- hoàn thiện = Add a 'この配送について報告' action in the delivery flow that creates a field report (pushFieldReportsLocal source:'配送') with note + photos, so delivery-side incidents reach admin the same way recovery incidents do.

### [8][MEDIUM/partial] Recovery: handling extra/unexpected items scanned
- src/pages/Staff/RecoveryFlow.tsx:96-99 (delivery-recovery)
- thiếu: markScanned only flips `scanned` on a product already in the expected list (matched by id/qr). counted is capped at expected via QtyStepper max=p.expected (line 277), and ProductQrScanner only matches QRs belonging to this order. There is no path to record an item that is physically present at the site but NOT on the expected list (e.g. customer hands back gear from a different/earlier order, or an over-count beyond expected). The driver can record LESS than expected (shortage) but never MORE/extra/unknown items.
- hoàn thiện = Allow recording unexpected/extra recovered items: an '予定外の品を追加' action that lets the driver scan or manually add an item not in the expected list (or raise counted above expected with a flag), pushed to admin as a field report so the warehouse final inspection knows to expect it.

### [9][MEDIUM/partial] 持込返却/最終検品: 過剰返却（counted > expected）の記録
- src/pages/Staff/WalkInReturnFlow.tsx:362 (returns-inspection)
- thiếu: 検品数量は QtyStepper(value=counted, max=expected) で入力するが、max が expected に固定されているため counted を expected より大きくできない。お客様が伝票記載より多く（または別品を混ぜて）持ち込んだ実態を記録する手段がない。+ ボタンが expected で disabled になり、現物超過のケースで行き止まりになる。
- hoàn thiện = counted を expected 超過まで入力できるようにし（max を緩めるか別の『超過数』フィールドを設ける）、超過分を『予定外返却 / 要確認』として report に記録して FieldReport・returnInspections へ送る。最終検品の在庫戻し(restoreOrderStock)も超過分を別枠で扱えるようにする。

### [10][MEDIUM/missing] 納品(delivery)ジョブで破損・不足を報告する手段
- src/pages/Staff/StaffJobDetail.tsx:53 (returns-inspection)
- thiếu: steps は recovery のみ『確認/問題/サイン』で、delivery ロールは『確認/サイン』のみ。配送時に商品の破損・不足・員数違いを発見しても報告するステップ自体が存在せず、confirm 後はそのままレンタル開始扱いになる。issue 報告画面(step==='issue')は recovery でしか到達できない。
- hoàn thiện = delivery ロールにも『問題』ステップ（または check ステップ内の行ごとの問題フラグ）を提供し、配送前破損/不足を itemIssues として記録し管理者へ通知する。最低でも配送時の不足を理由に納品保留にできる経路を用意する。

### [11][MEDIUM/dead-end] 検品/サイン確定後の修正・差し戻し
- src/pages/Staff/WalkInReturnFlow.tsx:508 (returns-inspection)
- thiếu: step===3(完了)に到達すると onComplete を呼ぶだけで、誤った counted・破損報告・燃料金額を訂正する手段がない。TopBar の戻る(onBack)は step3 で undefined にされ、確定後は前ステップへ戻れない。StaffJobDetail も complete() で updateOrder→navigate('/staff') し、確定後の再検品/訂正導線がない（『再検品』は単なるラベル文字列、reopen 機能ではない）。誤入力が請求(compensationCharge/fuelCharge)・在庫戻しに直結するのに取り消せない。
- hoàn thiện = 確定直前の最終確認ダイアログ、または確定後一定時間/状態での『検品をやり直す（差し戻し）』導線を用意し、itemIssues・counted・弁償費・在庫戻しを再計算できるようにする。少なくとも完了画面手前で各値を見直し編集できるレビュー画面を追加する。

### [12][MEDIUM/partial] 破損/不足報告の写真添付（StaffJobDetail の issue ステップ）
- src/pages/Staff/StaffJobDetail.tsx:255 (returns-inspection)
- thiếu: recovery の『問題』ステップは type/quantity/notes のみで、品目ごとの破損写真を添付できない。現場写真は sign ステップで注文単位に一括撮影するだけで、どの品目のどの破損かを写真で紐づけられない。WalkInReturnFlow 側は DamageReportSheet で品目ごとに reportPhotos を持てるのと非対称（inconsistent）。
- hoàn thiện = issue 行ごとに PhotoCaptureButton を追加し、破損写真を itemIssues[].photo に格納する。compensationCharge の根拠写真として admin/請求側で参照できるようにし、持込返却フローと機能を揃える。

### [13][MEDIUM/inconsistent] Staff identity on stock moves / maintenance records (hardcoded mock staff)
- src/context/MobileLiveContext.tsx:503 (addStockMove: const staffName = STAFF.souko.name) (shared)
- thiếu: addStockMove always stamps the record with the hardcoded mock name STAFF.souko.name ("佐藤 健一"), regardless of who is logged in. There is no parameter on addStockMove to pass the actual logged-in staff. The same pattern appears in WarehouseViews.recordMnt (inspector: STAFF.souko.name) and WhStocktake field reports (reporter: STAFF.souko.name). This is inconsistent with completeDelivery/completeRecovery, which correctly record the real logged-in staff name (deliveredBy/collectedBy/fieldInspectedBy from staff.name).
- hoàn thiện = Add an optional staff/operator argument to addStockMove (addStockMove(type, details, staffName)) and have callers pass currentUser.name; thread the logged-in name into recordMnt's inspector field and the stocktake field-report reporter. Result: 入庫/出庫履歴 and 点検履歴 attribute the actual staff for accountability, matching the delivery/recovery flows which already record staff.name.

### [14][MEDIUM/partial] Maintenance/inspection result is always 合格 (no fail / re-inspect path)
- src/pages/Staff/WarehouseViews.tsx:676 (recordMnt: result: "合格") and 680 (status: "正常") (shared)
- thiếu: The maintenance flow's only action is 点検完了を記録, which unconditionally writes result:"合格" and status:"正常" and pushes next-cycle dates forward. There is no way for staff to record a failed/abnormal inspection (要整備/不合格), record findings, or flag an item as needing repair. recordMaintenance in MobileLiveContext is a generic patch so the data layer supports it, but the only screen calling it hardcodes a pass.
- hoàn thiện = Add a 合格/要整備(不合格) choice (and optional note/photo) in the maintenance sheet, writing result and status accordingly (e.g. status:'整備中' + an issue note) instead of always '合格'/'正常'. This lets staff flag equipment that failed inspection so admin/maintenance is alerted rather than the item being silently marked normal.

### [15][MEDIUM/dead-end] Staff vehicle detail screen is unreachable (orphaned route)
- src/pages/Staff/StaffVehicleDetail.tsx:93 (vehicles)
- thiếu: StaffVehicleDetail is wired only as route /staff/vehicle/:id in src/staff-main.tsx:29, but NOTHING in the staff app navigates there. The 点検・車両 inspect tab (StaffDashboard.tsx -> WhInspect in WarehouseViews.tsx:599) opens a different, inline VehicleDetail component (WarehouseViews.tsx:150) via local state (setVehPlate), never this route. So the whole editable screen audited here — legal-date editing, photo capture — can never be opened by staff. Confirmed by grep: no navigate('/staff/vehicle' / Link to vehicle exists.
- hoàn thiện = Either make the inspect-tab vehicle cards (WarehouseViews.tsx:723) navigate to /staff/vehicle/${v.id} so this richer screen is actually used, or delete this file and consolidate its edit/photo capabilities into the WarehouseViews VehicleDetail that is actually shown. Right now two parallel vehicle-detail screens exist and the staff only ever sees the read-mostly one.

### [16][MEDIUM/partial] Record 車検完了 (inspection-complete) action
- src/pages/Staff/StaffVehicleDetail.tsx:143 (vehicles)
- thiếu: On the legal tab the only inspection capability is manually typing a new 有効期限 date via a date input (saveLegal at line 143). There is no '車検完了を記録' action that records the inspection as performed today, auto-sets next expiry +1 year, and appends a maintenance-history entry. The sibling screen actually used by staff has exactly this: WarehouseViews.tsx recordShaken (line 639) + button '車検完了を記録' (line 204), and admin does the same (AdminVehicles.tsx:425). This screen also never writes maintenanceHistory when the inspection date changes, so the 履歴 tab stays empty after an inspection update.
- hoàn thiện = Add a '車検完了を記録' button mirroring WarehouseViews recordShaken: set inspectionDate = today+1yr, recompute inspectionDaysRemaining, push a {date, item:'車検更新', mileage} row into maintenanceHistory, and refresh alerts — so completing a 車検 from this screen is one tap and produces an audit trail, instead of forcing manual date entry with no history record.

### [17][MEDIUM/missing] Add maintenance / repair records from the staff APK
- src/pages/Staff/StaffVehicleDetail.tsx:272 (vehicles)
- thiếu: The 履歴 tab (line 272) renders maintenanceHistory and repairHistory strictly read-only, with Empty states ('整備履歴はありません' / '修理履歴はありません') that offer no path forward. A 配送/倉庫 staffer who performs maintenance or arranges a repair cannot record it here. Admin has full add/edit/delete of both lists (AdminVehicles.tsx:375, :408, :1008-1032) and even the staff WhInspect tab can record periodic maintenance via recordMnt (WarehouseViews.tsx:664). This detail screen offers neither.
- hoàn thiện = Add an 'add maintenance record' (date/item/mileage) and 'add repair record' (title/shop/date/cost) entry form on the 履歴 tab that prepends to maintenanceHistory/repairHistory via updateVehicle, matching admin's record flow — so staff in the field can log integ/repair work that syncs back to admin.

### [18][MEDIUM/partial] Document/legal-file upload
- src/pages/Staff/StaffVehicleDetail.tsx:310 (vehicles)
- thiếu: The legal tab shows 車検証/自賠責 FileChips that fall back to a placeholder filename when no file exists (lines 254, 267), and the 資料 tab lists files/docs read-only (line 310). There is no way for staff to upload or replace a 車検証 / 自賠責 / generic document from the APK — only photo capture is supported (line 336). A staffer who photographs an updated 車検証 cannot attach it; the placeholder chips stay non-downloadable forever.
- hoàn thiện = Add a file/photo upload control on the 資料 tab (and inline on each legal FileChip) that reads the file to a dataUrl and appends to vehicleFiles via updateVehicle, so staff can capture/attach the updated inspection and insurance certificates.

### [19][MEDIUM/missing] Vehicle status update
- src/pages/Staff/StaffVehicleDetail.tsx:185 (vehicles)
- thiếu: The vehicle status (使用中/空車/整備中) is shown as a read-only Badge (line 185) with no control to change it. When staff start maintenance, admin's flow flips status to 整備中 (AdminVehicles.tsx:404) and back to 空車 on completion (line 376). From this staff screen there is no way to mark a vehicle 整備中 / back to 空車, so the vehicle's availability cannot be updated by the person actually doing the work.
- hoàn thiện = Add a status control (e.g. in the edit affordance) to set status/statusColor via updateVehicle, so staff can take a vehicle out of service for maintenance and return it, keeping availability accurate for the rental fleet.

### [20][MEDIUM/partial] 在庫履歴の検索・期間フィルタ (Stock history search/date filter)
- src/pages/Staff/WarehouseViews.tsx:460-509 (warehouse)
- thiếu: WhStock only offers a type SegmentControl (all/入庫/出庫) and pages 50 at a time. There is no text search by item name, no QR/ID search, and no date-range filter. With a busy warehouse the 入出庫 ledger grows unbounded (every delivery/recovery pushes a row via addStockMove), so finding a specific item's movements or a given day's activity means scrolling 'さらに表示' indefinitely.
- hoàn thiện = A search field that filters moves by item name / QR / ref, plus a date or date-range picker (and ideally a per-product history view), filtering the `list` before usePagedList.

### [21][MEDIUM/missing] 入出庫の取消・訂正 (Cancel/correct a stock move)
- src/pages/Staff/WarehouseViews.tsx:516-534 (warehouse)
- thiếu: Each move card in WhStock is a static Card with no onClick, no detail sheet, and no edit/delete action. Once a worker confirms an 入庫/出庫 (which immediately calls adjustStock to mutate product stock), there is no way to undo or correct a mistaken quantity or wrong-item scan. The only recourse is to register an opposite move, which leaves a misleading audit trail. There is no delete/reverse path anywhere in the codebase for stockIn/stockOut rows.
- hoàn thiện = Tapping a move opens a detail sheet showing staff/time/ref, with a '取消' action that pushes a compensating reversal (re-adjusting stock) or a server delete, and an '訂正' to edit qty. At minimum a confirm-with-reversal so an erroneously scanned move can be corrected.

### [22][MEDIUM/stub] 棚番ロケーション (Shelf/bin location)
- src/pages/Staff/WarehouseViews.tsx:821 (warehouse)
- thiếu: The 棚番 (bin location) shown throughout stocktake and the count sheet (loc) is fabricated from the product category's first character plus the array index: `p.category.slice(0,1) + '-' + (i+1)`. It is not a real stored location and shifts whenever the product list order changes, so it cannot guide a worker to where the item physically sits, and the same product can show a different 棚番 across sessions. Products without a category show '—'.
- hoàn thiện = Read a real `location`/`bin` field from the product record and display it; allow it to be assigned/edited. If no such field exists in the data model, surface '棚番未設定' rather than a synthetic index-derived value, and provide a way to record the actual bin.

### [23][MEDIUM/dead-end] 棚卸し確定後のリセット / 新規棚卸し開始 (Reset / start new stocktake after confirm)
- src/pages/Staff/WarehouseViews.tsx:980-986 (warehouse)
- thiếu: After 棚卸しを確定 the button becomes a permanently disabled '棚卸し確定済み' and `confirmed` stays true with no reset. There is no way to start a fresh count (e.g. a new monthly stocktake) without unmounting/remounting the screen, and counted values from the previous session persist in local state. There is also no recorded stocktake session/snapshot saved — confirmStocktake only patches differing stock values and pushes damage field reports; the count itself (who counted what, when, full vs partial) is not persisted as a stocktake record.
- hoàn thiện = A '新規棚卸し' action that resets inv counts, and persistence of a stocktake session record (date, counter, per-item system/counted/diff) to the backend so admin can review/audit completed stocktakes rather than only seeing adjusted stock numbers.

### [24][LOW/missing] Manual refresh / sync status on dashboard
- src/pages/Staff/StaffDashboard.tsx:1004-1077 (home Screen), 419-485 (DeliveryRecoveryTab) (dashboard)
- thiếu: The app runs against the production backend over cloud sync (OrderBus/MobileLiveContext exposes a 'connected' flag), but the dashboard offers no pull-to-refresh and no manual re-sync, and never surfaces ml.connected. If a driver in the field has stale/offline data, there is no visible way to force a reload or even see that the data may be stale — they only see counts that silently may be out of date.
- hoàn thiện = Add a pull-to-refresh (or a refresh IconBtn) on the home and list screens that re-pulls OrderBus data, plus a small connection/last-synced indicator driven by ml.connected, so field staff can trust and refresh what they see.

### [25][LOW/missing] 検品時の自由メモ／全体所見の記入
- src/pages/Staff/WalkInReturnFlow.tsx:389 (returns-inspection)
- thiếu: WalkInReturnFlow は品目ごとの DamageReportSheet(定型理由)はあるが、伝票全体に対する自由記述メモ（例: 『お客様が代替品で返却』『次回請求要確認』等）を入力する欄がない。order.note は読み取り表示のみで、検品担当が所見を残せない。
- hoàn thiện = サイン/確定ステップに全体メモ用 textarea を追加し、returnInspections レコードと注文(inspectionNote 等)へ保存して admin の返却履歴で参照できるようにする。

### [26][LOW/dead-end] pushFieldReports exposed on context but never used (abandoned duplicate of pushFieldReportsLocal)
- src/context/MobileLiveContext.tsx:520-522 (provider method), 133 (interface), 533 (value) (shared)
- thiếu: The context exposes pushFieldReports as part of MobileLiveContextProps and the provider value, but no staff screen ever calls ml.pushFieldReports — every consumer (RecoveryFlow, WalkInReturnFlow, WhStocktake) calls the module-level pushFieldReportsLocal instead. The context version is also inferior: it does not extract photo dataURLs (photoUrls) the way pushFieldReportsLocal does, so if any screen wired to it, field-report photos would silently not reach admin.
- hoàn thiện = Either remove the unused context pushFieldReports (and its interface entry) to avoid a misleading second code path, or make it the single canonical implementation (with photoUrl extraction) and route all screens through ml.pushFieldReports so there is one consistent field-report writer.

### [27][LOW/partial] QR scanner only matches one product per open (no continuous multi-scan)
- src/components/staff/ProductQrScanner.tsx:54-58 (matchValue: on success setState('matched'); stopCamera(); onMatch(...)) (shared)
- thiếu: On the first successful match the scanner stops the camera and delegates closing to the parent, so scanning multiple distinct items (e.g. a recovery with 5 different products, or warehouse stock-in of several SKUs) forces the user to reopen the scanner for every item. There is no 'matched, keep scanning' continuation and no scanned-count feedback inside the scanner. For high-volume logistics this is notable friction.
- hoàn thiện = Add an optional continuous mode where, after onMatch, the scanner briefly shows a success toast and re-arms (scanLockedRef reset, camera kept running) so the operator can scan the next item without reopening, with a running count of items scanned. Single-match callers can opt out.

### [28][LOW/stub] Repair receipt attachment
- src/pages/Staff/StaffVehicleDetail.tsx:302 (vehicles)
- thiếu: Each repair card renders <FileChip name={item.receipt} /> with no dataUrl (line 302). Because repairHistory.receipt is only a string (VehicleContext.tsx:55), the chip is always non-downloadable (FileChip disables itself unless dataUrl is present, line 41/67) and there is no control to attach a receipt. So the receipt slot renders as a permanently dead, unclickable chip.
- hoàn thiện = Allow attaching a receipt file/photo to a repair record (FileReader -> dataUrl stored on the repair entry) and make FileChip downloadable, so the receipt chip is actionable rather than a placeholder.

### [29][LOW/partial] Vehicle photo management
- src/pages/Staff/StaffVehicleDetail.tsx:336 (vehicles)
- thiếu: The 資料 tab photo grid supports only the happy path: capture a new photo (line 338-345) which appends to photos[]. There is no way to delete, replace, or reorder a wrong/blurry photo once added — tapping an existing tile does nothing (lines 330-334 render a plain img). Staff who snap a bad shot are stuck with it.
- hoàn thiện = Make existing photo tiles tappable to view full-size with a delete/remove option (updateVehicle with the photo filtered out), so mistaken captures can be corrected.

### [30][LOW/partial] 棚卸しリストの検索・絞り込み (Stocktake list search/filter)
- src/pages/Staff/WarehouseViews.tsx:942-976 (warehouse)
- thiếu: WhStocktake renders the entire product catalog (initInv maps every liveProduct) as one flat scrollable list with no search box, no filter by counted/uncounted/差異, and no sort by 棚番/location. For a real warehouse with hundreds of SKUs, manually tap-finding an item to enter its count (when QR scan is unavailable) requires scrolling the whole list, and there is no quick way to jump to the remaining uncounted items or review only the discrepancies.
- hoàn thiện = A search input (name/QR) and filter chips (未カウント / 差異あり / 報告あり) above the inv list, plus optional sort by 棚番, so a counter can locate items and reviewers can isolate discrepancies.

### [31][LOW/partial] 棚卸し中の未スキャン商品の追加・QR未登録品の扱い (Add ad-hoc / unlisted item during stocktake)
- src/pages/Staff/WarehouseViews.tsx:1018-1028 (warehouse)
- thiếu: The stocktake QR scanner matches only against products already in `inv` (onMatch -> openEdit). If a worker scans an item physically present in the warehouse that is not in the product master (or whose QR is unknown), there is no path to record it as a found/surplus item — the scan simply fails to match with no feedback or 'add unlisted item' option. Warehouse reconciliation routinely needs to flag found-but-unregistered stock.
- hoàn thiện = When a scanned QR has no match, offer an 'リストにない商品として記録' flow (capture name/qty/photo) that adds a surplus line to the count and is included in the field report, so unregistered physical stock can be reconciled.

### [32][LOW/partial] 手動入出庫(QR無し)の登録 (Manual move without product pick)
- src/pages/Staff/WarehouseViews.tsx:481-483 (warehouse)
- thiếu: In confirmMove, the else branch `addMove(scan!)` (no details object) is intended to register a move without a picked product, but addStockMove destructures `{item,qty,ref,icon}` from undefined and would throw. In practice the UI never reaches it (the confirm button only renders when picked is set), which means there is NO supported way to register an 入庫/出庫 for an item whose QR won't scan / isn't in the master — the worker is stuck at the scan screen with only a free-text-less camera and no manual item entry.
- hoàn thiện = A 'QRが読めない場合は手入力' option in the scan sheet that lets the worker pick a product from a searchable list (or enter a free item name) and a quantity, then registers the move correctly; and harden addStockMove against a missing details object.
