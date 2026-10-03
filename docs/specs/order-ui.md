# Order list, detail và recipient UI

> **Authority:** customer/admin/staff order presentation và address recipient interaction.
> **Read when:** task chạm order cards/details hoặc shared address form.
> **Update when:** behavior UI được chấp nhận thay đổi; không phải chứng nhận nghiệm thu.

Nghiệp vụ thuộc [order-flow](../../.agents/skills/order-flow/SKILL.md) và
[voucher-flow](../../.agents/skills/voucher-flow/SKILL.md); wire fields thuộc
[API.md](../../API.md), primitives thuộc [UI system](../../SPECIFICATION.md#ui-system).

## Order cards và shared detail

DELIVERY đang PENDING/ADMIN_CONFIRMED/STAFF_DONE hiển thị tên người nhận, số điện thoại và
địa chỉ đầy đủ ngay trên card của cả ba actor. Dùng snapshot delivery_receiver_name,
delivery_receiver_phone, delivery_address của order; không dùng account/address book hiện tại.
Legacy thiếu dữ liệu ghi rõ phần thiếu. COMPLETED và CANCELLED giữ card gọn; thông tin giao hàng
nằm trong detail riêng của order.

Card ADMIN hiển thị sẵn toàn bộ món khi đơn chưa COMPLETED/CANCELLED; hai trạng thái cuối
ẩn món trên card và vẫn xem đủ trong detail. Tên người tiếp nhận hiển thị trực tiếp, không có
nhãn “Người nhận”: dùng tên người xác nhận thanh toán đã lưu, fallback người xử lý đã lưu;
không suy từ khách hàng, role hoặc admin đang đăng nhập.

Mọi card có action “Chi tiết đơn”, kể cả ít món. Shared ResponsiveOverlay detail hiển thị trạng
thái, phương thức trả tiền, recipient snapshot, items/vouchers và totals; operational actions ở
list. Customer detail giữ Đặt lại. Mỗi item voucher do shared item renderer sở hữu một lần, kể cả
ITEM được mapper đưa qua productVoucher và nhiều ADDON voucher. Giữ các persisted line riêng
để không mất voucher khác token; không gộp/dedupe theo tên package. Order DISCOUNT nằm riêng.

Màu list/detail/progress/countdown/voucher/payment dùng semantic theme dịu, giữ nhãn/icon trạng
thái rõ ràng trong light/dark. Không đổi toàn bộ palette hoặc thiết kế desktop riêng.

## New-address recipient

Checkout và profile container truyền default name/phone từ account vào shared AddressForm.
Form mới hiển thị tóm tắt và “Người nhận khác”; action mở field đã điền sẵn để sửa, có
“Dùng thông tin tài khoản” để quay lại. Account thiếu name/phone mở field bắt buộc ngay.
Hydration chỉ khởi tạo receiver còn pristine; không ghi đè dữ liệu đã gõ. Edit địa chỉ dùng
receiver đã lưu. Validation, phone normalization, map và default-address payload không đổi.

## Admin orders badge theo ngày

Badge tab “Đơn hàng” dùng shared query/service cho tổng PENDING + BANK_TRANSFER ở mọi loại đơn
được tạo trong hôm nay theo UTC+7, độc lập page/search và các bộ lọc tùy chọn của danh sách.
Service gửi startDate/endDate qua endpoint hiện có, lấy limit=1 nhưng đọc meta.total.
Poll 20 giây/refocus; create/confirm/cancel invalidate admin orders prefix. Zero ẩn badge; lỗi
refetch giữ giá trị thành công cuối. POS “Chờ CK” giữ nguồn server riêng hiện có.
