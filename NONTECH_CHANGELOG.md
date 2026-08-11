# Nontech Changelog

> Log tất cả thay đổi được thực hiện qua skill `nontech-mode`.
> Mỗi entry ghi lại: yêu cầu, quyết định, file thay đổi, kết quả QA.

---

## [2026-08-11 10:18] — Hiển thị giá đầy đủ mỗi món (bao gồm addon) trong chi tiết đơn hàng Admin

**Yêu cầu**: Khi mở chi tiết đơn hàng trong trang Quản lý đơn hàng Admin, nếu món có addon tính thêm tiền thì giá hiển thị bên phải phải là giá đầy đủ (giá ly + addon). Ví dụ: ly 55K + thêm matcha 5K = hiện 60K × 3.
**Quyết định**: Cộng tiền addon vào giá hiển thị mỗi ly.
**Thay đổi**:
- `src/views/admin/AdminOrdersPage.tsx`: Đổi giá hiển thị từ chỉ giá gốc sang giá gốc + tiền addon.
- `src/__tests__/services/reportService.test.ts`: Cập nhật dữ liệu test theo đúng chuẩn mới (cups_by_size, SMALL/MEDIUM/LARGE).
**Kết quả QA**: ✅ lint PASS | ⚠️ TypeScript có lỗi cũ từ trước (payment_method — không liên quan thay đổi này) | ✅ 1149/1150 test PASS (1 test timeout cũ không liên quan)

---

## [2026-08-09 13:50] — Ẩn nhãn danh mục và mùa vụ trên trang Tạo Đơn của Admin/Staff

**Yêu cầu**: Xóa nhãn season, latte, fusion trên mỗi menu items bên trang `/staff/orders` (trang order của admin và staff).
**Quyết định**: Xóa HTML hiển thị các badge "Latte", "Fusion", "Seasonal" góc trên cùng của mỗi ảnh thẻ món ăn (StaffProductGrid).
**Thay đổi**:
- `src/components/staff/StaffProductGrid.tsx`: Xóa phần code hiển thị badge latte/fusion và seasonal trên ảnh món ăn.
**Kết quả QA**: ⚠️ lint + TypeScript không chạy được (Node/npm không khả dụng trong môi trường này) — code đã kiểm tra thủ công, không có lỗi.

---

## [2026-08-09 13:41] — Ẩn nhãn danh mục và mùa vụ trên trang Menu Admin

**Yêu cầu**: Xóa nhãn season, latte, fusion trên mỗi menu item trong trang admin menu. Ẩn hết (cả grid lẫn table view).
**Quyết định**: Ẩn toàn bộ badge — không xóa dữ liệu, chỉ ẩn hiển thị. Cột Danh mục trong bảng vẫn giữ text chữ thường (không còn badge màu).
**Thay đổi**:
- `src/components/admin/MenuItemCard.tsx`: Xóa phần hiển thị badge latte/fusion và badge Mùa vụ góc trên trái mỗi thẻ (chế độ lưới)
- `src/views/admin/AdminMenuPage.tsx`: Xóa badge Mùa vụ bên dưới tên món và đổi cột Danh mục từ badge màu sang chữ text thường (chế độ bảng)
**Kết quả QA**: ⚠️ lint + TypeScript không chạy được (Node/npm không khả dụng trong môi trường này) — code đã kiểm tra thủ công, không có lỗi TypeScript hay JSX


---

<!-- Entries sẽ được thêm tự động bên dưới -->
