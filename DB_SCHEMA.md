# Database Schema Context

Hệ quản trị cơ sở dữ liệu: MariaDB 10.5 (XServer Host: localhost)
Database chính: `kansei123_asahi`

## Bảng: `records`
Bảng này dùng thiết kế Hybrid NoSQL để lưu trữ nhiều loại dữ liệu dưới dạng chuỗi JSON.

### Các cột chính:
- `store` (Varchar): Phân loại dữ liệu. Gồm các giá trị chính:
  - `products`: Danh mục sản phẩm (Ví dụ: cọc tiêu, xe tải nhẹ...).
  - `orders`: Thông tin đơn hàng từ khách hàng.
  - `fieldReports`: Báo cáo hiện trường.
- `id` (Varchar): Mã định danh duy nhất (Mã sản phẩm hoặc mã đơn hàng như FR-XXXXXX, 4sqkgascg...).
- `data` (LongText/JSON): Chuỗi JSON chứa thông tin chi tiết.
- `deleted` (TinyInt): `0` là bình thường, `1` là đã xóa tạm.
- `rev` (Int): Số phiên bản cập nhật (bộ đếm).
- `updated_at` (Datetime): Thời gian cập nhật gần nhất.

### Cấu trúc Object bên trong cột `data` (Quan trọng):
1. **Khi `store` = "products"**:
   `{"id": "c1", "name": "レボリューションコーン赤白", "image": "https://..."}`
2. **Khi `store` = "orders"**:
   `{"items": [], "total": 0, "subtotal": 0, "tax": 0, "delivery": 0}`
3. **Khi `store` = "fieldReports"**:
   `{"id": "FR-6726187", "source": "回収", "ref": "#RTN-2026-..."}`
