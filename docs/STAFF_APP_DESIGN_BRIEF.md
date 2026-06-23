# Staff App — Tài liệu chức năng & luồng (cho Designer)

> **Mục đích:** Mô tả đầy đủ các màn hình, chức năng và luồng thao tác của **Staff App** (アサヒリースレンタル・販売) để designer vẽ lại UI/UX.
> Tài liệu giữ nguyên label tiếng Nhật đang hiển thị trên app, kèm nghĩa tiếng Việt trong ngoặc.

---

## 0. Tổng quan sản phẩm

- **Đây là gì:** App mobile cho **nhân viên hiện trường + nhân viên kho** của một công ty cho thuê / bán thiết bị & xe ở Nhật.
- **Nền tảng:** React + Capacitor → đóng gói thành **APK Android** (cũng chạy được trên web). Khung hình thiết kế theo **điện thoại dọc (portrait)**, khóa xoay ngang.
- **Người dùng:** tài xế giao hàng, tài xế thu hồi, nhân viên kho, người quản lý xe. (Phân quyền: chỉ tài khoản `staff` hoặc `admin` đăng nhập được.)
- **Bối cảnh sử dụng đặc thù — designer cần lưu ý:**
  - Thao tác **một tay, ngoài trời, đeo găng** → nút bấm to, vùng chạm rộng (thumb-zone).
  - Có **「屋外モード」(Chế độ ngoài trời)**: nền đen, chữ/viền **xanh neon (#00FF66)** tương phản cực cao để đọc dưới nắng gắt.
  - **Mạng yếu/offline:** app có hàng đợi gửi lại. Có badge **「オフライン」** và **「送信待ち N」(Chờ gửi N)** trên thanh tiêu đề.
  - Nhiều thao tác dùng **quét QR**, **chụp ảnh hiện trường**, **ký tên** trực tiếp trên màn hình.
- **Tông màu thương hiệu:** xanh teal (`#1E8C86`). Các trạng thái: brand (xanh teal), success (xanh lá), warning (cam), danger (đỏ).

### Bản đồ điều hướng (sitemap)

```
Đăng nhập (StaffAuthGate)
   └── App chính (Bottom Nav 5 tab)
        ├── 1. ホーム (Trang chủ)
        │     ├─→ Flow 配送 (Giao hàng)            [5 bước]
        │     ├─→ Flow 回収 (Thu hồi)              [5 bước]
        │     ├─→ Flow 持込返却 (Trả tại quầy)      [2 giai đoạn kiểm phẩm]
        │     ├─→ 本日のルート (Lộ trình hôm nay)
        │     └─→ Popover 通知 (Thông báo)
        ├── 2. 配送・回収 (Giao & Thu hồi)  → mở các Flow ở trên
        ├── 3. 入出庫 (Nhập/Xuất kho)
        │     └─→ 棚卸し (Kiểm kê) — mở từ Home/quick action
        ├── 4. 点検・車両 (Kiểm định & Xe)
        │     └─→ 車両詳細 (Chi tiết xe) [4 tab con]
        └── 5. マイページ (Trang cá nhân)
              └─→ 完了履歴 / プロフィール編集
```

---

## 1. Màn hình đăng nhập — `StaffAuthGate`

**Nội dung trên màn hình:**
- Logo / tiêu đề app: **「ASAHI STAFF」** (màu teal).
- Tiêu đề: **「スタッフログイン」** (Đăng nhập nhân viên).
- Ô nhập:
  - **「メールアドレス / 社員ID」** (Email / Mã nhân viên) — placeholder `delivery@asahilease.co.jp`
  - **「パスワード」** (Mật khẩu) — placeholder `••••••••`, có nút con mắt bật/tắt hiện mật khẩu.
- Nút **「ログイン」** (Đăng nhập), nền teal, full-width.
- Khung báo lỗi (đỏ) khi sai.

**Các trạng thái lỗi:**
- Đang tải dữ liệu: 「読み込み中です。少し待ってから再度お試しください。」
- Không tìm thấy tài khoản: 「アカウントが見つかりません。」
- Tài khoản bị ngưng: 「このアカウントは停止中です。」
- Sai quyền (không phải staff/admin): 「スタッフ権限のアカウントでログインしてください。」
- Sai mật khẩu: 「パスワードが違います。」

---

## 2. Khung điều hướng chính — Bottom Navigation (5 tab)

Thanh điều hướng dưới cùng, luôn hiển thị:

| Tab | Label | Nghĩa | Badge |
|----|-------|-------|-------|
| 1 | **ホーム** | Trang chủ | Số thông báo chưa đọc |
| 2 | **配送・回収** | Giao & Thu hồi | Số việc giao + thu hồi chưa xong |
| 3 | **入出庫** | Nhập/Xuất kho | — |
| 4 | **点検・車両** | Kiểm định & Xe | Số xe/bảo dưỡng quá hạn |
| 5 | **マイページ** | Trang cá nhân | — |

**Thanh tiêu đề trên cùng (chỉ ở Home)** có: trạng thái 「オフライン」, nút 「送信待ち N」(chờ gửi), và **chuông thông báo 🔔** (có chấm đỏ khi có chưa đọc).

---

## 3. Tab `ホーム` (Trang chủ)

Màn hình tổng quan + điểm khởi đầu cho mọi việc trong ngày.

**Các khối từ trên xuống:**
1. **Thẻ chào + tiến độ:** avatar/chữ cái tên, **「{Tên} さん」**, mã nhân viên, team/chức vụ. Thanh tiến độ **「業務進捗 X / Y 件 (NN%)」** (Tiến độ công việc).
2. **「次の配送 / 次の回収 / 対応待ち」 (Việc kế tiếp):** một thẻ lớn nổi bật cho **task ưu tiên nhất** (1 việc), kèm nút **「開始する」**(Bắt đầu).
3. Nút **「本日のルートを見る（N件）」** (Xem lộ trình hôm nay).
4. **4 thẻ số liệu (MetricCard)** — bấm để nhảy tới tab tương ứng:
   - **「配送予定」** (Lịch giao) ・ **「回収予定」** (Lịch thu hồi) ・ **「持込返却」** (Trả tại quầy) ・ **「点検要対応」** (Kiểm định cần xử lý).
5. **「クイック操作」 (Thao tác nhanh)** — 4 nút lớn: 持込返却 / 入出庫 / 棚卸し / 点検・車両.
6. **「優先タスク」 (Task ưu tiên):** danh sách cảnh báo (車検期限切れ = quá hạn đăng kiểm, メンテ超過 = quá hạn bảo dưỡng) + vài thẻ giao/thu hồi sắp tới.

**Popover thông báo (🔔):** danh sách thông báo có màu theo mức độ (danger/warning/success/brand), nút **「すべて既読」**(Đánh dấu đã đọc hết), bấm vào item sẽ điều hướng tới màn hình liên quan.

**本日のルート (Lộ trình hôm nay) — màn phụ:**
- Liệt kê tất cả điểm dừng (giao + thu hồi) đánh số thứ tự.
- Nút **「全ルートをマップで開く」** → mở Google Maps đa điểm.
- Nút **「オフライン準備（写真を事前取得）」** (Chuẩn bị offline — tải trước ảnh) để xem được khi mất sóng.

---

## 4. Flow `配送` (Giao hàng) — 5 bước

Wizard tuyến tính. Stepper: **確認 → 移動 → 写真 → サイン → 完了**.

| Bước | Label | Màn hình | Thao tác chính |
|----|-------|----------|----------------|
| 0 | **確認** (Xác nhận) | Thông tin điểm giao (現場/会社/住所/担当者), thông tin hợp đồng (kỳ thuê, tổng tiền), nút **「納品書 PDFを表示」**, danh sách hàng cần giao. Mỗi món có nút **「問題」**(Báo sự cố). | Xem lại, gọi điện liên hệ, báo sự cố từng món → **「配送を開始する」** |
| 1 | **移動** (Di chuyển) | Bản đồ + ETA + khoảng cách, nút **「ナビアプリで開く」**(mở Google Maps). | Đi tới hiện trường → **「現場に到着」** |
| 2 | **写真** (Chụp ảnh) | Nút chụp lớn **「写真を撮影」**, lưới ảnh đã chụp (xóa được). **Bắt buộc tối thiểu 1 ảnh.** | Chụp ảnh lắp đặt → **「サインへ進む（N枚）」** |
| 3 | **サイン** (Ký tên) | Bảng ký tay (SignaturePad). Nếu đơn có xe: thêm **「保安車両 貸出チェック」** (số km lúc giao, tình trạng xe). Có nút **「受領者が不在の場合」**(Người nhận vắng mặt). | Khách ký → **「サインを確定」** |
| 4 | **完了** (Hoàn tất) | Animation dấu tích, tóm tắt (giờ hoàn tất, số ảnh, trạng thái chữ ký). | **「次の配送へ」** → lưu & quay lại danh sách |

**Nhánh quan trọng:**
- **Người nhận vắng mặt (不在):** thay chữ ký bằng ô ghi chú bắt buộc (mô tả đã đặt hàng ở đâu, giao chìa khóa cho ai). Nút đổi thành **「受領者不在で完了」**.
- **Báo sự cố từng món (DamageReportSheet):** chọn loại 破損あり/数量不足/汚損・要清掃/部品欠品/その他, nhập số lượng, chụp ảnh, ghi chú (có **nhập bằng giọng nói** 🎤). Gửi cho admin: **「管理者へ報告」**.
- **Tự lưu nháp (draft):** thoát giữa chừng có hỏi xác nhận; mở lại khôi phục được tiến độ (trừ ảnh/chữ ký).

---

## 5. Flow `回収` (Thu hồi hàng) — 5 bước

Wizard tuyến tính. Stepper: **確認 → 移動 → スキャン → サイン → 完了**.

| Bước | Label | Màn hình | Thao tác chính |
|----|-------|----------|----------------|
| 0 | **確認** (Xác nhận) | Thông tin điểm thu hồi + hợp đồng + **「回収予定品目」**(danh sách hàng cần thu, kèm số lượng dự kiến `予定`). Nút **「回収書 PDFを表示」**. Badge **一部返却**(trả 1 phần) / **一括返却**(trả toàn bộ). | → **「回収を開始する」** |
| 1 | **移動** (Di chuyển) | Bản đồ + nút mở navigation. | → **「現場に到着・スキャン開始」** |
| 2 | **スキャン** (Quét & đếm) | **Bước phức tạp nhất.** Khung quét QR + danh sách **「確認リスト」** với thanh tiến độ. Mỗi món: bộ đếm số lượng (QtyStepper), badge số lượng thiếu/dư, nút **「手動で確認」**(xác nhận thủ công nếu QR hỏng), nút **「不足・破損を報告」**. | Quét QR từng món, đếm số thực nhận → **「サインへ進む」** |
| 3 | **サイン** (Ký tên) | Tóm tắt **「回収点数 X/Y 点」**, bảng ký. Có chế độ **「受領者が不在の場合」**. | Khách ký → **「サインを確定」** |
| 4 | **完了** (Hoàn tất) | Tóm tắt số lượng thu + báo cáo sự cố + trạng thái ký. Nhắc: **「倉庫へ持ち帰り後、入庫処理を行ってください」**. | **「倉庫へ戻る」** |

**Nhánh quan trọng:**
- **Thiếu/Dư số lượng:** nếu đếm < dự kiến → tự tạo báo cáo **「数量不足」**; nếu > dự kiến → **「数量超過」**.
- **QR hỏng:** dùng **「手動で確認」**, gắn badge **「手動確認」** để admin biết là xác nhận bằng mắt.
- Thu hồi xong **chưa kết thúc đơn** — hàng về kho còn phải qua **最終検品 (kiểm phẩm cuối)** (xem mục 6).

---

## 6. Flow `持込返却` (Khách mang trả tại quầy) — Kiểm phẩm 2 giai đoạn

Đây là khi **khách tự mang đồ tới kho trả**. Có **2 giai đoạn kiểm phẩm**:
- **一次受付検品 (Kiểm phẩm tiếp nhận)** — nhân viên quầy nhận đồ, đếm sơ bộ, lấy chữ ký khách. **Chưa** cập nhật kho/xuất hóa đơn.
- **最終検品 (Kiểm phẩm cuối)** — nhân viên kho kiểm lại lần cuối → **xác nhận mới trừ/cộng kho, đóng đơn, cho phép xuất hóa đơn.**

**Màn hình hàng đợi (chọn đơn):**
- Tiêu đề **「持込返却 検品」**.
- 3 thẻ số: **「受付待ち」**(chờ tiếp nhận) ・ **「最終検品」**(kiểm cuối) ・ **「履歴」**(lịch sử).
- Tab phân loại: **すべて / 一次受付 / 最終検品 / 履歴**.
- Ô tìm kiếm **「レンタル番号・会社名で検索」**.
- Thẻ đơn có badge **一次受付** (cam) hoặc **最終検品** (teal).

**Wizard (4 bước, label đổi theo giai đoạn):**
1. **受付/確認** — Thông tin khách + danh sách hàng dự kiến trả + ảnh khách gửi (nếu có) → **「検品を開始」**.
2. **検品/再検品** — Quét QR + đếm + báo sự cố (giống bước thu hồi).
3. **サイン/確定** — Tóm tắt, ghi chú kiểm phẩm **「検品メモ」**. **Nếu là xe + kiểm cuối:** thêm **「保安車両 返却チェック」** (số km trả, tình trạng, checkbox **「燃料は満タン」**; nếu không đầy bình → nhập tiền đổ xăng + ảnh hóa đơn). Khách ký, hoặc hiện lại chữ ký đã lấy lúc tiếp nhận.
4. **完了** — Tiếp nhận: **「一次検品完了」** + nhắc còn kiểm cuối. Kiểm cuối: **「最終検品完了・入庫済み」** với **bước xác nhận chốt** (cảnh báo: 「確定すると在庫・請求に反映され、取り消せません」).

**Nhánh quan trọng:**
- **再検品（差し戻し） (Kiểm lại / Trả về):** từ tab lịch sử, đơn nào **「要確認」**(có thiếu/hư) bấm để đẩy lại vào hàng đợi kiểm cuối.

---

## 7. Tab `入出庫` (Nhập/Xuất kho) — `WhStock`

Sổ cái nhập–xuất kho.

**Bố cục:**
- Tiêu đề **「入出庫管理」**.
- 3 thẻ số: **「現在庫」**(tồn hiện tại) ・ **「本日入庫」**(nhập hôm nay) ・ **「本日出庫」**(xuất hôm nay).
- Tab lọc: **すべて / 入庫 / 出庫**.
- Ô tìm kiếm **「品名・ID・日付で検索」**.
- Danh sách giao dịch: ảnh món, tên, ID・giờ・loại tham chiếu, số lượng (**+N** xanh cho nhập, **−N** cho xuất).
- 2 nút dưới cùng: **「入庫」**(Nhập) / **「出庫」**(Xuất).

**Thao tác:**
- **Đăng ký nhập/xuất:** mở sheet **「入庫スキャン / 出庫スキャン」** → quét QR (hoặc nhập tay ID) → chọn số lượng (xem trước **「入庫後の在庫」**) → **「入庫を確定 / 出庫を確定」**.
- **Xem chi tiết & Hủy (取消):** bấm 1 giao dịch → sheet **「入出庫の詳細」**.
  - ⚠️ **Quy tắc quan trọng:** chỉ **hủy được giao dịch đăng ký tay (手動)**. Giao dịch tự động (xuất do cho thuê / nhập do thu hồi) **không hủy được** ở đây (vì kho đã được hệ thống thuê/thu hồi quản lý — hủy sẽ làm sai tồn). Hiển thị dòng giải thích read-only.

---

## 8. Màn `棚卸し` (Kiểm kê thực tế) — `WhStocktake`

Đếm tồn kho thực tế bằng QR.

**Bố cục:**
- Tiêu đề **「棚卸し」**.
- Khung quét QR (có animation).
- Thẻ tiến độ: **「棚卸し進捗 X / Y品目」** + thanh tiến độ + **「差異」**(số sai lệch).
- Ô tìm kiếm + bộ lọc: **すべて / 未カウント / 差異あり**.
- Nút **「+ リストにない商品を記録」** (Thêm món ngoài danh sách — EX line).
- Danh sách món: tên, QR・棚番(vị trí kệ)・**帳簿 XX**(tồn sổ sách), giá trị đếm + dòng chênh lệch (**一致**=khớp / **差異 +X / −X**).

**Thao tác:**
- Bấm món → sheet **「実数量を入力」** đếm số thực; nếu thiếu hiện **「帳簿より X 不足」**.
- Báo sự cố thiếu/hư qua DamageReportSheet (chụp ảnh).
- Thêm món ngoài master (EX): nhập tên + số lượng → ghi nhận như chênh lệch.
- Đếm hết → **「棚卸しを確定」**: cập nhật tồn, tạo bản ghi điều chỉnh (audit), **đẩy phiên kiểm kê lên admin**. Sau đó hiện **「棚卸し確定済み ✓」** + **「新規棚卸し」**(kiểm kê mới).

---

## 9. Tab `点検・車両` (Kiểm định & Quản lý xe) — `WhInspect`

**Màn chính:**
- Tiêu đề **「点検管理」**.
- 2 thẻ số: **「車両アラート」**(cảnh báo xe) ・ **「整備超過」**(quá hạn bảo dưỡng).
- Tab: **「車検・車両」**(đăng kiểm & xe) / **「メンテ」**(bảo dưỡng).
- **Tab 車検・車両:** ô tìm xe + danh sách xe (ảnh/biển số/trạng thái **使用中/空車/整備中** + **「次回車検」**(đăng kiểm kế tiếp) + số ngày còn lại, đỏ nếu quá hạn).
- **Tab メンテ:** danh sách hạng mục bảo dưỡng (chu kỳ, lần trước, lần kế, số ngày còn).

**Sheet ghi nhanh:**
- **車検記録 (Ghi đăng kiểm):** nhập ngày đăng kiểm kế → **「車検完了を記録」** (có dialog xác nhận).
- **メンテナンス記録 (Ghi bảo dưỡng):** chọn **合格**(đạt) / **要整備**(cần sửa) → nút tương ứng.

### `車両詳細` (Chi tiết xe) — `VehicleDetail` (4 tab con)

| Tab | Label | Nội dung |
|----|-------|----------|
| 1 | **基本** (Cơ bản) | Cảnh báo tự động (車検/保険/税/オイル), thông tin xe (biển số, hãng, đời, số khung…), đổi trạng thái **使用中 / 空車 / 整備中** (đồng bộ admin). |
| 2 | **法的** (Pháp lý) | **自動車検査証**(giấy đăng kiểm) + **自賠責保険**(BH bắt buộc) + **任意保険**(BH tự nguyện) + **自動車税**(thuế xe) + **走行距離**(số km). Có nút **「編集」/「保存」** để sửa từng mục, đính kèm/tải file. |
| 3 | **履歴** (Lịch sử) | **整備・点検履歴**(lịch sử bảo dưỡng) + **修理履歴**(lịch sử sửa chữa), có form **「+ 追加」** thêm bản ghi, đính kèm ảnh hóa đơn. |
| 4 | **資料** (Tài liệu) | **添付資料**(file đính kèm: giấy đăng kiểm…) + **車両写真**(ảnh xe), chụp/xóa/tải. |

---

## 10. Tab `マイページ` (Trang cá nhân) — `ProfileTab`

- Thẻ hồ sơ: avatar, tên, chức vụ, mã NV, team.
- 2 thẻ số: **「本日完了」**(hoàn tất hôm nay) / **「残り業務」**(việc còn lại).
- Nút **「完了履歴を見る」** → màn **「完了履歴」** (lịch sử công việc đã xong).
- Công tắc **「屋外モード」** (Chế độ ngoài trời — nền đen tương phản cao).
- Nút **「編集」**(sửa hồ sơ — có chụp ảnh đại diện) / **「ログアウト」**.

---

## 11. Component dùng chung (cần thiết kế đồng bộ)

| Component | Dùng ở | Mô tả |
|-----------|--------|-------|
| **ProductQrScanner** | Thu hồi, Trả quầy, Nhập/Xuất, Kiểm kê | Camera quét QR + khung ngắm + **đèn pin (ライト点灯/消灯)** + nhập tay dự phòng. Khi khớp: **rung + beep 880Hz**. |
| **SignaturePad** | Giao, Thu hồi, Trả quầy | Bảng ký tay. |
| **DamageReportSheet** | Mọi flow | Báo sự cố: chọn loại + số lượng + ảnh + ghi chú (nhập giọng nói). |
| **PhotoCaptureButton / PhotoTile** | Mọi flow | Chụp ảnh, hiển thị lưới ảnh, xóa. |
| **DocumentViewer** | Giao, Thu hồi, Lịch sử | Xem PDF 納品書(phiếu giao)/回収書(phiếu thu). |
| **Stepper / QtyStepper / Badge / MetricCard / SegmentControl / Empty** | Toàn app | Các phần tử UI nền tảng. |

---

## 12. Trạng thái & dữ liệu thật chạy qua app (để designer hiểu ngữ cảnh)

- **liveDeliveries** — đơn cần giao hôm nay/sắp tới (sắp theo ngày giao gần nhất).
- **liveRecoveries** — đơn cần thu hồi (gần hạn trả ≤7 ngày hoặc đã đánh dấu 回収予定).
- **walkin** — hàng đợi khách trả tại quầy + kiểm phẩm cuối.
- **stockMoves** — lịch sử nhập/xuất kho.
- **vehicles / maint** — dữ liệu xe & lịch bảo dưỡng (đồng bộ từ admin).
- **staffMessages** — thông báo từ admin gửi nhân viên.
- **connected / 送信待ち** — trạng thái online + số bản ghi chờ gửi (mạng yếu).

> Mọi thao tác hoàn tất đều **gửi ngược về admin** (có cơ chế gửi lại khi offline). Designer nên thiết kế rõ các trạng thái: **đang chờ gửi / offline / đã đồng bộ**.

---

## 13. Màn hình KHÔNG dùng (orphan — bỏ qua khi vẽ lại)

Các file sau **đã đăng ký route nhưng không màn nào điều hướng tới**, app thực tế **không dùng**:
- `StaffJobList.tsx`, `StaffJobDetail.tsx`, `StaffVehicleDetail.tsx`

→ Designer **không cần** thiết kế các màn này. Màn hình xe thực dùng là **VehicleDetail** trong `WarehouseViews` (mục 9), điều hướng/nghiệp vụ thực dùng là **các tab trong StaffDashboard**.

---

## Tóm tắt danh sách màn hình cần vẽ

1. Đăng nhập
2. Home (trang chủ) + Popover thông báo + Lộ trình hôm nay
3. Flow Giao hàng — 5 bước (+ sheet báo sự cố, ký, chụp ảnh, vắng mặt)
4. Flow Thu hồi — 5 bước (+ quét QR, đếm, báo sự cố, vắng mặt)
5. Flow Trả tại quầy — hàng đợi + 4 bước × 2 giai đoạn (+ kiểm xe/xăng, kiểm lại)
6. Tab Nhập/Xuất kho + sheet nhập/xuất/chi tiết-hủy
7. Màn Kiểm kê + sheet nhập số + báo sự cố
8. Tab Kiểm định & Xe + sheet ghi đăng kiểm/bảo dưỡng
9. Chi tiết xe — 4 tab con (基本/法的/履歴/資料)
10. Trang cá nhân + Lịch sử hoàn tất + Sửa hồ sơ
11. Chế độ ngoài trời (biến thể tương phản cao cho mọi màn)
