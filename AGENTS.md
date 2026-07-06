# Quy trình dự án
- **Danh mục chức năng (tra khi sửa/đọc code):** `docs/CHUC_NANG.md` — ánh xạ tính năng → file → luồng → lưu ý cho cả 3 app (顧客/admin/staff). Khi thêm/sửa tính năng lớn, cập nhật mục tương ứng ở đó.
- Sau khi chỉnh sửa code hoặc fix bug xong, bắt buộc phải chạy lệnh `npm run deploy` ở terminal để kiểm tra lỗi và cập nhật lên XServer.
- Trước khi viết code Backend hoặc sửa logic tương tác dữ liệu, hãy đọc kỹ file `DB_SCHEMA.md` để hiểu cấu trúc bảng `records` và các trường JSON trong cột `data`. Tuyệt đối không làm sai lệch các key JSON hiện có.
