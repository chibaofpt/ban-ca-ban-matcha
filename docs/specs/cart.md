# Cart và POS

> **Authority:** behavior UI/composition của feature; shared primitives thuộc [SPECIFICATION](../../SPECIFICATION.md#ui-system).
> **Read when:** task chạm feature này; chỉ đọc heading liên quan.
> **Update when:** behavior feature được chấp nhận thay đổi. Đây là current spec, không phải chứng nhận code đã được kiểm tra.

Nghiệp vụ thuộc domain skills [order-flow](../../.agents/skills/order-flow/SKILL.md),
[voucher-flow](../../.agents/skills/voucher-flow/SKILL.md), [pricing-logic](../../.agents/skills/pricing-logic/SKILL.md).
API payload thuộc [API.md](../../API.md); không suy quy tắc tính tiền từ bố cục UI.

## Cart state và persistence

Customer và Staff/Admin dùng chung cart transition engine, projection và order-item serializer.
Zustand/localStorage chỉ giữ ID, cấu hình nguồn, số lượng, voucher token và BUNDLE allocation/effect;
không giữ catalog DTO, tên/ảnh, giá dẫn xuất hoặc UI state. Customer persist owner bằng số điện thoại
đã chuẩn hóa; staff chỉ persist QR token của customer hiện có rồi tải lại profile và wallet sau reload.
Projection join cart với catalog/wallet hiện hành, khóa checkout trong lúc revalidate và giữ raw line
nếu dữ liệu chưa sẵn sàng. Đổi owner/logout giữ paid line nhưng tháo personal/order voucher và chỉ
xóa reward line/addon được ghi trong `created_reward_effects`.

Customer có thể chạm phần nội dung của một cart line để mở `ProductModal` sửa cấu hình; các nút số
lượng, xóa và voucher vẫn giữ action riêng và không kích hoạt edit. Với POS, sau khi chọn khách hiện
có, cart hiển thị ngay danh sách voucher của khách cùng trạng thái tải/khả dụng/đang giữ.

## BUNDLE setup và cart

BUNDLE dùng một planner thuần và shared evaluator cho ví, customer cart và staff cart. Setup giữ
draft cục bộ gồm món mua, quà, cấu hình và số lượng; chỉ commit items và application cùng một lần
sau khi toàn bộ phân bổ qua evaluator. Không suy lại món mua từ thứ tự giỏ sau khi khách chọn.
Planner xét candidate theo từng unit, chỉ autofill khi có đúng một complete plan; nhiều plan bắt
khách chọn rõ unit/config. Mở lại application dùng allocation đã commit, không chạy autofill đè lên.
Chỉ hiển thị “Đã áp dụng” khi kết quả hợp lệ và có lợi ích dương; trước đó hiển thị tiến độ và lý do
còn thiếu. Client và server phân biệt giá đồ uống, topping và gross unit price, giữ giảm BUNDLE
riêng. Reload không tin trạng thái READY đã lưu mà revalidate bằng wallet/menu hiện tại.
Ngay sau khi setup commit, Cart dựng nhóm từ các allocation đã lưu để không chớp thành danh sách món
lẻ trong lúc tải ví. Trạng thái đang tải/lỗi tải chỉ khóa checkout và chỉnh cấu hình; không tự đổi
application thành xung đột hoặc không khả dụng trước khi có dữ liệu ví hiện hành.

Cart BUNDLE hiển thị tên voucher, quyền lợi, các phần món có nhãn Mua/Quà, giá gốc, mức giảm và
phụ thu; lỗi nằm tại nhóm liên quan với hành động Chọn lại món/Bỏ ưu đãi. Sửa một phần của dòng
nhiều món phải giữ tổng số lượng và phần còn lại. Gỡ bundle giữ món mua và phần vốn có, chỉ loại
quà/topping được ghi nhận là tự thêm. Footer của picker bao gồm bundle; Bỏ tất cả xử lý mọi lựa
chọn thuộc picker và xác nhận nếu phải loại quà tự thêm. Nhận bundle từ cart chuyển tới voucher
mới và setup, không điều hướng bằng DOM id của panel cũ.

## Counter Transfer POS Recovery

- After creating a COUNTER BANK_TRANSFER order, clear and close the submitted cart before opening
  its QR modal. The QR opens after the cart drawer releases its focus/pointer lock.
- Do not bind a pending transfer to the cart store. The server-authoritative source is
  `GET /api/staff/orders?status=PENDING&order_type=COUNTER&mine=true`.
- This allows one Staff/Admin account to create multiple pending transfers. The POS launcher is
  hidden for zero orders, opens the QR directly for one order, and opens a selection bottom sheet
  for two or more orders.
- Closing a QR does not change order status. Confirm moves that order to `COMPLETED`; cancel moves
  it to `CANCELLED`. Both actions refresh the current-user pending list.
