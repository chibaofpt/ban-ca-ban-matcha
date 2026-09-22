# Voucher UI

> **Authority:** behavior UI/composition của feature; shared primitives thuộc [SPECIFICATION](../../SPECIFICATION.md#ui-system).
> **Read when:** task chạm feature này; chỉ đọc heading liên quan.
> **Update when:** behavior feature được chấp nhận thay đổi. Đây là current spec, không phải chứng nhận code đã được kiểm tra.

Nghiệp vụ thuộc domain skills [order-flow](../../.agents/skills/order-flow/SKILL.md),
[voucher-flow](../../.agents/skills/voucher-flow/SKILL.md), [pricing-logic](../../.agents/skills/pricing-logic/SKILL.md).
API payload thuộc [API.md](../../API.md); không suy quy tắc tính tiền từ bố cục UI.

## Voucher nhiều lựa chọn

Admin dùng `AdaptiveSelect` multiple để cấu hình tối đa 100 target cho PRODUCT,
PRODUCT_DISCOUNT, ITEM, ADDON và BUNDLE; không duy trì selector riêng cho từng loại voucher.
Server lưu ID cụ thể. PRODUCT lưu cấu hình và covered price riêng theo món; ITEM chỉ nhận extras;
ADDON chỉ nhận option fixed-price. Customer chọn đúng một reward trước khi gắn voucher vào một
unit; staff áp dụng cùng rule trên cart item đã chọn. Customer và staff giữ payload order hiện có
và dùng chung server calculator.

Với PRODUCT, PRODUCT_DISCOUNT và ITEM, chi tiết voucher hiển thị trực tiếp danh sách target bằng
`MenuCard` compact; card chỉ render các size thuộc scope mà admin đã cấu hình. Chạm target đồ uống
mở `ProductModal` với size, bột và Base Liquid snapshot làm cấu hình ban đầu; người dùng vẫn customize
và trả phần vượt credit của PRODUCT. ITEM thêm đúng một unit miễn phí. Không mở thêm sheet chỉ để
chọn target. Sau khi cấu hình thành công, đóng ProductModal và toàn bộ surface voucher trước rồi mới
mở cart để shared overlay primitive giải phóng scroll lock.
ADDON nhiều target chọn addon trước, sau đó gắn vào một ly chưa bị BUNDLE chiếm; khi chưa có ly thì
lưu pending intent trong memory và chuyển về menu. Món mới số lượng lớn được tách đúng một unit.
Nếu group addon đã đầy, dùng `ConfirmModal` để hỏi trước khi thay; giữ nguyên món sẽ giữ pending
intent cho ly mới tiếp theo. Pending intent không được persist qua reload và phải xóa khi voucher,
cart hoặc customer owner không còn hợp lệ.

Chi tiết package trước khi nhận hoặc đổi phải liệt kê toàn bộ target còn dùng được. PRODUCT hiển thị
size, bột, Base Liquid và credit riêng của từng món; ITEM và ADDON hiển thị mọi lựa chọn còn active.
Nếu một ly đã có nhiều topping cùng thuộc scope của một voucher ADDON, customer và staff phải chọn
đích cụ thể kèm mức giảm; chỉ tự áp dụng khi còn đúng một lựa chọn. Mọi entry point ADDON phải dùng
allocation BUNDLE hiện tại trước khi sửa giỏ và phải gắn topping cùng voucher trong một cart snapshot;
UI chỉ báo thành công sau khi snapshot có voucher.

## Wallet và voucher surfaces

Customer voucher list/detail/target/setup dùng chung `ResponsiveOverlay`: mobile là bottom sheet,
desktop là centered dialog. Voucher card giữ content button mở detail độc lập với action; wallet dùng
“Dùng ngay”, cart dùng selection button có `aria-pressed`. Voucher không đủ điều kiện vẫn đọc được
và mở detail, chỉ selection bị khóa kèm lý do. Wallet và cart voucher sheet dùng chung
ba tab Voucher của tôi / Nhận ưu đãi / Lịch sử; history chỉ cho xem detail, không cho chọn.
Danh sách chọn voucher tải đủ các trang ACTIVE và RESERVED trước khi coi ví đã xác minh; RESERVED
vẫn hiển thị đang được giữ cho đơn và không được chọn. Lỗi ở bất kỳ trang
nào giữ trạng thái chưa xác minh. Lịch sử dùng cache riêng, chỉ tải khi mở tab và đọc tiếp theo
cursor bằng nút “Xem thêm”; lỗi tải thêm giữ các mục đã tải và cho thử lại. Reconciliation chạy
trước trang đầu của mỗi lần làm mới ví, không lặp lại ở từng trang tiếp theo.
Wallet và cart dùng chung voucher frame edge-to-edge với một lớp padding; detail thay nội dung
trong cùng frame thay vì mở sheet lồng. Cart voucher sheet dùng layer `nested`; target/setup mở
từ sheet này dùng layer `critical`.

Staff/Admin POS chọn khách hàng rồi dùng lại chính cart voucher picker này với adapter của staff
cart; không dựng danh sách ví hoặc order-discount picker riêng. Entry point theo từng món có thể giữ
context của dòng cart nhưng danh sách tổng, detail và target flow thuộc shared picker. Surface phải được key và
commit theo `user.qr_token` đang chọn: đổi hoặc bỏ khách đóng surface, gỡ toàn bộ voucher owner cũ
và kết quả async của khách cũ không được ghi sang cart khách mới. Đơn `COUNTER + BANK_TRANSFER`
đã tạo là snapshot server độc lập: voucher được giữ theo lifecycle của order, còn stack **Chờ CK**
chỉ đọc lại server state và hiển thị phần giảm voucher từ `subtotal_vnd - total_vnd`; không giữ một
queue voucher song song trong client.

## Admin BUNDLE wizard

Admin BUNDLE giữ wizard ba bước. Bước quyền lợi đặt Mua X/Tặng Y cùng hàng, rồi loại quà và mode
Tặng cùng món/Tặng món chỉ định/Chọn quà trong danh sách, sau đó món điều kiện. Mỗi nhóm mua/quà
có size và Base Liquid mặc định chung lấy từ giao cấu hình hợp lệ; Fusion chọn bột riêng, Latte
giữ bột cố định, extras không có cấu hình đồ uống. Không âm thầm đổi lựa chọn khi giao không còn
hợp lệ. Đơn tối thiểu/Lượt mỗi voucher trong đơn cùng hàng. Bước phát hành dùng ba nút cách nhận,
Điểm đổi/Tối đa mỗi khách/Tổng phát hành cùng hàng và ngày kết thúc/số ngày hiệu lực theo tỷ lệ
70/30. Free/auto khóa điểm ở 0 và tối đa mỗi khách ở 1 theo issuance hiện hành. Validation on-blur
và từng bước dùng RHF/Zod với lỗi dưới field. Tạo thành công reset phiên wizard; lỗi giữ draft.
Đóng overlay do backdrop, swipe hoặc Escape giữ nguyên draft, bước hiện tại và phần copy admin đã sửa
trong suốt vòng đời trang; chỉ lần tạo thành công mới reset phiên wizard.
Quy tắc sữa/bột/size và chống chồng voucher thuộc voucher-flow, không được suy từ bố cục form.

Admin có thêm selector `PUBLIC`/`PRIVATE` trong bước phát hành. Gói PRIVATE tự động chuyển sang
`NONE`, điểm về 0, ẩn các control tự nhận/đổi và giải thích rõ ràng chỉ admin mới có thể tặng.

## Admin PRODUCT_DISCOUNT wizard

Chế độ `PAY_AS_SIZE` được trình bày là `Free upsize` và chỉ cấu hình một cặp size. Hai selector
`Size mua` và `Size được up` nằm cùng hàng: size mua chỉ nhận size nhỏ hoặc vừa có trong giao size
của mọi món đã chọn; size được up chỉ nhận một size lớn hơn size mua. API vẫn dùng
`reference_size` cho size mua và mảng `eligible_sizes` một phần tử cho size được up.

Tên gợi ý dùng mẫu `Free upsize lên cá vừa`; mô tả nêu các món và size đích theo mẫu
`Free up size cho A, B lên size vừa.`. Bên dưới mô tả hiển thị dòng tóm tắt
`Món áp dụng: A, B size vừa`. Chế độ giảm số tiền định dạng phân cách hàng nghìn trong input và
khởi tạo mức giảm ở 10.000 VND.

## Nhận, đổi và auth intent

Catalog nhận/đổi của customer wallet và cart ẩn `AUTO_GRANT` và gói có
`(user_redeemed_count ?? 0) >= max_per_user`. Việc ẩn gói không xóa, ẩn hoặc thay đổi voucher đã
sở hữu, quota hay lịch sử đổi. Detail đang mở phải khóa CTA nếu dữ liệu mới cho biết hết lượt.

Footer chi tiết gói chỉ điều phối callbacks hiện có: guest đăng nhập với đúng package intent;
`FREE_CLAIM` dùng “Nhận miễn phí”; `POINTS_EXCHANGE` hiển thị chi phí cá và vẫn cần xác nhận trước
khi trừ cá. Busy, hết hàng, hết lượt, `AUTO_GRANT` hoặc thiếu callback thì không được nhận/đổi.
Thiếu cá khóa đổi và báo đúng số còn thiếu, không thêm điều hướng menu. Eligibility dùng helper
chung, giữ thứ tự kiểm tra hiện có; footer không tự gọi API.

Admin package detail mở managed overlay có badge visibility và khu vực `Tặng cho khách hàng`.
Search dùng service `GET /api/staff/users?q=`, chọn từng customer mới kích hoạt lịch sử package;
việc chọn không phát hành. Lịch sử có tab `Tất cả`, `Đang có`, `Đã dùng`, hiển thị nguồn, ngày nhận,
hạn và trạng thái; RESERVED hiển thị `Đang giữ cho đơn`. Summary luôn hiển thị số khách tự nhận/đổi,
current/used, stock và expiry preview.

CTA `Tặng 1 voucher cho [Tên]` tự sinh request id mới cho mỗi hành động. Cùng request id được giữ
qua warning confirmation và retry mạng không chắc chắn. Warning dùng `ConfirmModal` critical với
CTA `Vẫn tặng 1 voucher`; pending khóa submit và đổi customer. Sau thành công refresh history, stats
package và cache voucher liên quan.

Auth từ voucher sheet mở ngay trên sheet còn mở, không đợi sheet đóng. Hủy auth bỏ intent nhưng
giữ surface nền; đăng nhập thành công tiếp tục intent một lần và giữ bước xác nhận đổi bằng cá.

## Admin overlay composition

Trang admin voucher là flow đầu tiên bật managed stack: page bọc các primitive bằng
`OverlayStackProvider` và dùng một discriminated surface duy nhất (`closed`, `campaign`, `create` hoặc
`detail(packageId)`), vì vậy campaign workspace, wizard tạo và detail package không thể cùng là base surface.
Nút **Tạo campaign** nằm bên trái **Tạo voucher** và mở campaign workspace bằng
`ResponsiveOverlay`: Vaul bottom sheet trên mobile và dialog full-size trên desktop. Admin navigation
không giữ tab reward riêng; URL cũ chuyển về trang voucher. Multi-select
commit ngay mỗi lần chạm; CTA đóng ghi rõ số lựa chọn và query tìm kiếm được xóa sau khi đóng.
Publish thành công và bỏ thay đổi bẩn đều đóng confirmation critical trước, rồi chỉ đóng base sau
lifecycle `onAfterClose`; không thêm timer hoặc điều hướng Browser Back cho flow này.

Trang tổng quan hiển thị ba KPI trên cùng một hàng: tổng cấu hình voucher, tổng voucher đã phát và
tổng voucher đã sử dụng. Danh sách mặc định lọc `ACTIVE` và `PUBLIC`; hai select này không có lựa
chọn tất cả. Select thể loại đứng giữa, mặc định **Không có** để không lọc theo voucher type.
