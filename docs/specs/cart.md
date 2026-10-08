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

Khi catalog thay đổi bột, giữ nguyên lựa chọn của line đã có. Bột inactive hoặc không còn quyền
dùng thì hiện yêu cầu chọn lại và khóa checkout; không tự đổi sang bột mặc định mới. Khi bột gốc
được mở lại, line dùng bột thay thế chỉ tiếp tục hợp lệ nếu bột đó còn active và nằm trong allow-list.
Lượt chọn món mới dùng mặc định đang phục vụ. Định giá dựa vào các neo Latte trong menu DTO,
bao gồm neo inactive; xem [pricing-logic](../../.agents/skills/pricing-logic/SKILL.md) và
[API](../../API.md#get-apimenu).

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
quà/topping được ghi nhận là tự thêm. Nút xóa món là thao tác khác: nếu dòng thuộc
BUNDLE, ConfirmModal giải thích rõ việc xóa cả các nhóm món mua/quà liên quan, rồi owning
cart gọi transition chung nguyên khối. Giữ số lượng ngoài nhóm và nhóm không liên quan;
đóng cart rỗng sau lifecycle after-close của xác nhận. Quy tắc allocation và dọn quà theo
[voucher BUNDLE](../../.agents/skills/voucher-flow/references/bundles.md).
Footer của picker bao gồm bundle; Bỏ tất cả xử lý mọi lựa
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

## Mobile cart layout và overlay lifecycle

Nút giỏ customer dùng vị trí và hình pill theo launcher POS, màu primary xanh lá. Chỉ hiển thị
icon giỏ hàng rồi số lượng unit và tổng thanh toán dạng `3 món • 36 ká`; không có icon cá.
Nút giữ action mở cart hiện có và ẩn khi giỏ rỗng.

Staff/Admin dùng cart gọn với header giảm padding, chữ và nút đóng; vẫn giữ drag handle
và swipe-to-dismiss của shared overlay. Size render bằng `SizeLabel`; size, Base Liquid,
độ ngọt và đá chung hàng, tự wrap khi hết chỗ, dùng nền primary và chữ primary-foreground.
Addon dùng nền primary nhạt/chữ primary. Voucher món/addon đang áp dụng dùng nền card,
chữ primary, viền border-2 primary/20, bo góc nhẹ rounded-sm, px-1, py-0 và gap-1; mỗi token giữ tên, mức giảm thực tế và nút X đỏ bên trong.
Voucher ngắn có thể cùng hàng; không dành vùng trống khi chưa có voucher. Vùng voucher/giá
trải ngang bên dưới nội dung item.
Customer, Staff và Admin dùng một component cart item chung theo thiết kế POS, kể cả
các dòng Mua/Quà trong nhóm BUNDLE. Ảnh và khung thay thế dùng h-20 w-20 (80 px).
Voucher đã áp và nút Chọn ưu đãi nằm bên trái, cùng hàng flex với giá căn phải trên
mobile và desktop; khoảng cách giữa vùng voucher và giá dùng gap-2, không chia tỷ lệ cột.
Các voucher tự wrap theo chiều rộng còn lại: nếu hai voucher tên dài không đủ chỗ,
voucher thứ hai xuống dòng trong vùng trái. Giá không co lại và không wrap.
Nhãn Chọn ưu đãi (số lượng) luôn đủ một dòng trong nút.
Nút chỉ hiện khi còn voucher khác có thể áp vào dòng theo scope/cấu hình, trạng thái ví,
lợi ích và allocation hiện tại; số đếm không gồm token đã áp hoặc đang dùng ở dòng khác.
Món không còn phục vụ dùng card cảnh báo chung, giữ nút xóa và yêu cầu xóa để tiếp tục.
Các khóa xác minh ví/catalog và hành vi số lượng vẫn thuộc owning adapter.
Header customer giữ tên Giỏ cá, bỏ icon cá và giảm padding; navbar nằm dưới lớp base
của shared overlay để không che cart khi mở. Xóa tất cả nằm cạnh title/badge số lượng,
chỉ hiện khi có món, nền đỏ/chữ trắng/rounded-lg và khóa khi đang checkout; dùng lại ConfirmModal.

Cuối body cuộn, sau items/BUNDLE, hiển thị bảng Tổng tiền, Giảm giá món, Giảm giá topping,
Tiền ship, Giảm tiền ship, Giảm toàn đơn và Thanh toán từ shared calculator. Khoản bằng 0
ẩn, riêng Thanh toán luôn hiện; toàn bộ giảm BUNDLE gộp vào Giảm giá món.
Header POS đặt Xoá tất cả ngay bên phải badge số lượng, dùng lại action xác nhận hiện có
và chỉ hiện khi cart có món. Footer POS giữ hai cột: trái là nút chọn voucher màu primary
rồi Tiền mặt/Chuyển khoản; phải đặt nhãn Tổng căn trái cùng tiền/điểm ở phía trên,
Được giảm căn phải khi có giảm, và nút Chốt đơn phía dưới trong cùng cột.
Các khoản giảm tiền trong bảng chi tiết, trên voucher món/topping và dòng Được giảm dùng màu đỏ. Các action chốt/xóa đơn giữ lifecycle hiện có. Customer dùng chung bảng tiền ở cuối body. Footer customer giữ lựa chọn nhận tại quán/giao hàng,
địa chỉ và checkout. Hàng trên giữ Delivery/Pickup và giờ nhận ở vị trí hiện có.
Phần dưới chia hai cột voucher/địa chỉ và tổng tiền theo số tiền khách phải trả sau giảm giá, gồm phí ship:
dưới 1.000.000 VND dùng tỷ lệ 5:5; từ 1.000.000 VND dùng tỷ lệ 4:6. So sánh bằng VND nguyên,
không dùng số ká đã làm tròn. Cột trái xếp dọc nút Voucher nền gradient amber nhẹ #e4a132 → #f1be60 (hover #d99529 → #e9b354) và nút Địa chỉ
nền gradient hồng nhẹ #c9799f → #dda0be (hover #be6d93 → #d494b2, chỉ hiện khi giao hàng); gradient chéo 135 độ; tiêu đề trắng đậm 13 px, mô tả trắng nét thường 12 px; cả hai có viền chữ mỏng 0,3 px màu đen opacity 25%, bỏ chevron.
Voucher đã có giảm hiển thị thẳng Giảm … ká, không có tiền tố Đã áp dụng.
Cột phải có nhãn Tổng, giá phải trả và điểm cùng hàng, căn phải. Khi có giảm giá, hàng dưới hiển thị
tổng gốc (tiền món và phí ship trước giảm) gạch ngang, tiếp theo là Bạn đã được giảm ….
Không giảm thì ẩn hàng này. Nút thanh toán nằm phía dưới
và chiếm chiều rộng cột phải, chiều cao tối thiểu 40 px, dùng nền primary xanh đậm với chữ trắng.
Action xóa chỉ nằm trên header.
Không lặp lại Tạm tính, Phí ship và Giảm giá trong footer; các khoản này thuộc bảng chi tiết cuối body.


### Đơn vị tiền hiển thị trong cart

Customer, Staff và Admin hiển thị mọi số tiền trong cart bằng `ceil(VND / 1000)` và
hậu tố `ká` qua component chung `CartMoney` trong `src/components/shared/CartMoney.tsx`.
Component dùng `formatCartMoney` trong `src/utils/display.ts`; nhãn accessibility và thông báo
cần chuỗi cũng gọi formatter này, không tự chia/làm tròn hay thêm đơn vị tiền tại consumer.
Áp dụng cho nút mở cart, giá item, giá mục tiêu có cấu hình cart, tóm tắt BUNDLE,
voucher ticket, bộ chọn voucher và điều kiện voucher trong cart, bảng chi tiết thanh toán,
tổng/giảm trong footer, số tiền trong sheet
điểm và thông báo xung đột giá. Ví dụ: 35.500 VND → 36 ká; 1.001 VND → 2 ká; 0 VND → 0 ká.
Đây chỉ là định dạng hiển thị: calculator, giá gửi server và thanh toán vẫn dùng VND nguyên;
không cộng các dòng đã làm tròn để tính tổng. Điểm vẫn tính từ VND theo pricing owner,
không tính từ số ká hiển thị. Formatter hiện có của các màn hình ngoài cart giữ contract riêng.

Khi customer hoặc POS refetch ví nền đã có cache của đúng owner, tên/giá/cấu hình/voucher và preview
trong cart/picker tiếp tục dùng display projection từ cache; không đổi sang nhãn tải hoặc
tạm về 0. Kết quả mới thay display khi dữ liệu đổi; chỉnh cart vẫn phản ánh cấu hình hiện tại.
Cache chỉ phục vụ display, không cấp quyền mutation/checkout: verification projection và
owning adapter tiếp tục khóa thao tác khi chưa xác minh xong. Lần tải đầu chưa có cache
vẫn dùng trạng thái tải hiện có.

Cart và shared voucher picker ở cùng OverlayStackProvider; picker POS render trong content
slot của cart để nhận đúng parent scope. Picker nhận controlled open, giữ mounted qua animation
và reset sau onAfterClose. Managed ProductModal của target đóng trước wallet; parent giữ mở
cho tới khi child giải phóng lifecycle. Dismissal chỉ thuộc surface trên cùng. Còn cart mở thì
trang nền vẫn khóa và content cart cuộn được; đóng hết surface trả lại vị trí cuộn ban đầu.
Đổi/bỏ khách giữ surface owner cũ qua close, khóa mutation ngay và chỉ commit owner mới sau
close; callbacks async đối chiếu owner trước khi ghi. Không sửa body style hoặc dùng timer feature
để sửa scroll lock. Cached wallet data chỉ phục vụ display trong lúc refetch/lỗi; mọi voucher
mutation dùng verification hiện tại tại owning adapter, giữ nguyên lựa chọn đã lưu. Lifecycle
BUNDLE customization và wallet detail theo [voucher UI](voucher-ui.md#eligible-target-display-và-owning-cart-adapters).

## Voucher selection và checkout payload

Cart giữ riêng token order voucher đã chọn và token thực sự được projection áp dụng.
Voucher tạm thiếu minimum giữ selection để áp lại khi đủ điều kiện; request checkout
chỉ gửi DISCOUNT/FREESHIP có hiệu lực. Việc giảm/xóa món, toast thay voucher, ưu tiên
danh sách và đóng voucher surfaces theo [Voucher UI](voucher-ui.md).
Giá và điều kiện tiếp tục theo voucher-flow; không tính từ số ká hiển thị.
