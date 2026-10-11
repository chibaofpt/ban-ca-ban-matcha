# Đặt món chung — Brainstorm

> Trạng thái: bản nháp thảo luận, chưa phải specification hay quyết định kiến trúc được duyệt.
> Ghi lại cuộc trao đổi ban đầu ngày 02/08/2026; lưu thành tài liệu ngày 10/10/2026.
> Chưa implement. Các tên bảng, field, endpoint và giới hạn bên dưới đều là đề xuất.
> Nhận xét về code hiện hữu phản ánh thời điểm brainstorm, cần kiểm tra lại trước implementation.

## 1. Yêu cầu ban đầu của người dùng

Người dùng muốn brainstorm tính năng đặt món chung với vai trò solution architect:

- Một user bấm tính năng đặt món chung và tạo mã QR.
- Những người khác quét QR bằng Zalo, Camera iPhone hoặc Android để vào website.
- Người quét không cần đăng nhập, chỉ chọn món và bỏ vào giỏ.
- Có thể cho phép hoặc không cho phép người tham gia xem toàn bộ giỏ hàng chung.
- Chọn món xong có nút thoát chế độ đặt món chung.
- Giao diện vẫn dùng menu hiện tại, có biểu tượng hoặc banner thể hiện đang đặt chung với user tạo QR.
- Chỉ brainstorm trước, chưa yêu cầu implementation.

## 2. Hướng kiến trúc đã đề xuất

Xem đặt món chung là một phiên giỏ hàng cộng tác tạm thời do server quản lý.
Chỉ khi chủ phòng chốt giỏ mới tạo một order PICKUP hoặc DELIVERY thật.

Ba phần có trách nhiệm riêng:

1. Group session: phiên bản nháp, người tham gia, quyền và thời hạn.
2. Shared cart items: cấu hình món, mỗi món có người sở hữu.
3. Order hiện tại: giao dịch được tạo một lần khi host checkout, tiếp tục workflow hiện có.

Các định hướng liên quan:

- LocalStorage không đủ để đồng bộ giỏ giữa nhiều thiết bị; server là nguồn dữ liệu chính của phiên chung.
- Không tạo order PENDING ngay khi mở phòng để tránh kích hoạt payment, auto-cancel và voucher reservation quá sớm.
- Không thêm GROUP vào OrderType: đặt chung là cách nhập món, PICKUP/DELIVERY là cách nhận hàng.
- QR mời dùng token riêng theo phiên, không dùng users.qr_token hoặc QR voucher.
- Guest không cần ghost user hay một tài khoản trong users.
- Personal cart và group cart tách biệt; thoát group mode trở lại giỏ cá nhân nguyên vẹn.

Tại thời điểm thảo luận, giỏ cá nhân dùng Zustand/localStorage; API order customer yêu cầu đăng nhập.
Vì vậy đã đề xuất một domain group-order riêng, tái sử dụng pricing/voucher/order workflow khi checkout.

**Điểm cần duyệt trước implementation:** policy hiện tại ghi cart chỉ localStorage. Giỏ cộng tác trên server
là mở rộng kiến trúc/persistence cần được chấp thuận và cập nhật đúng owner, chưa được bản draft này phê duyệt.

## 3. Chủ phòng tạo phiên

Host là user đã đăng nhập, bấm “Đặt món chung”.

Nếu giỏ cá nhân đã có món, hiển thị các lựa chọn đã đề xuất:

- Chuyển món hiện tại vào giỏ chung.
- Bắt đầu giỏ chung trống.
- Quay lại.

Server tạo phiên, trả về một liên kết HTTPS chứa invite token ngẫu nhiên.
Ví dụ minh họa, không phải domain/route đã chốt:

```text
https://<domain-cua-quan>/group-order/<invite-token>
```

QR chứa toàn bộ URL HTTPS để trình quét phổ biến nhận diện và mở website.
Khả năng mở và duy trì phiên thực tế cần kiểm thử thủ công trên Zalo, iPhone và Android.

Modal của host được đề xuất có:

- QR lớn, tương phản rõ.
- Nút “Sao chép liên kết”.
- Nút “Chia sẻ” qua native share sheet khi thiết bị hỗ trợ.
- Danh sách người đã tham gia.
- Nút “Khoá giỏ và chốt đơn”.

## 4. Guest tham gia và chọn món

Luồng đề xuất:

1. Quét QR và mở website.
2. Nhập tên ngắn, ví dụ “An”, hoặc nhận tên tự sinh “Khách 2”.
3. Server xác thực invite token và cấp participant token riêng qua cookie httpOnly.
4. Vào menu ở chế độ đặt chung.

Guest không phải nhập số điện thoại, mật khẩu hoặc tạo user.
Invite token cấp quyền tham gia; participant token xác định người sở hữu món và quyền sửa món.

## 5. Menu và UX mobile

Tái sử dụng menu hiện tại, thêm banner sticky luôn nhận biết được ngữ cảnh:

> Icon Users — Đang đặt chung với Minh · 4 người tham gia

Các hành vi đã đề xuất:

- Dùng icon từ hệ thống UI hiện có, ví dụ Users, không dùng emoji làm structural icon.
- Hiển thị trạng thái “Đã đồng bộ” hoặc “Đang kết nối lại”.
- CartButton hiển thị “Giỏ chung · 7 món” hoặc “Món của bạn · 2”.
- Guest chỉ sửa/xóa món do mình thêm.
- Host được sửa/xóa mọi món; dùng ConfirmModal cho thao tác cần xác nhận.
- Guest không có nút thanh toán và không thấy phần áp dụng voucher.
- Action hoàn tất của guest là “Xong món của tôi”.
- Có action riêng “Thoát chế độ đặt chung”.

“Xong món của tôi” có thể đánh dấu participant ready, giúp host biết ai đã chọn xong.
Chi tiết cho phép sửa tiếp sau khi ready chưa được chốt.

Đề xuất mặc định: thoát phiên vẫn giữ món đã thêm.
Nếu muốn rút món, cung cấp action rõ ràng “Xóa món của tôi và rời phiên”.
Không tự xóa món chỉ vì guest đóng tab hoặc mất kết nối.

## 6. Quyền xem giỏ

Đề xuất host quyết định visibility ở cấp phiên:

| Chế độ | Host | Guest |
|---|---|---|
| SHARED — mặc định đề xuất | Xem tất cả | Xem tất cả món, tên người chọn và tổng |
| OWN_ONLY | Xem tất cả | Chỉ xem món và tạm tính của mình |

API phải lọc dữ liệu theo quyền. Không gửi toàn bộ giỏ rồi chỉ ẩn bằng CSS.
Guest không thấy địa chỉ giao hàng, thông tin thanh toán, số điện thoại hay dữ liệu tài khoản của host.

## 7. Mô hình dữ liệu khái niệm

Các bảng order hiện tại biểu diễn giao dịch đã submit. Phiên nhiều người cùng sửa cần mô hình draft riêng.
Đây là đề xuất cần audit schema/migrations tại thời điểm implementation, chưa phải migration plan.

### group_order_sessions

- Host user.
- Invite token ngẫu nhiên, lưu dạng hash.
- Trạng thái đề xuất: OPEN, LOCKED, CONVERTED, CANCELLED, EXPIRED.
- Visibility: SHARED hoặc OWN_ONLY.
- Thời điểm hết hạn.
- final_order_id nullable và unique, liên kết order đã tạo và hỗ trợ checkout idempotent.
- created_at, updated_at.

### group_order_participants

- Session sở hữu participant.
- Tên hiển thị.
- Participant access-token hash.
- User liên kết nullable; guest thông thường là null.
- is_ready, joined_at, left_at, last_seen_at.
- Host cũng có participant record để quản lý món theo cùng cơ chế.

### group_order_items

- Session và participant sở hữu món.
- menu_item_id, size, quantity.
- Powder, milk, sweetness, ice, coldwhisk, note.
- Client operation token để chống thêm trùng khi retry request.
- Timestamps.

Addon được đề xuất lưu trong group_order_item_addons, tương tự cấu trúc addon của order.
Không lưu toàn bộ shared cart trong một cột JSON để tránh nhiều guest ghi đè giỏ của nhau.
Draft items không cần chứa voucher, địa chỉ giao hàng hoặc payment.
Không thêm duplicate totals hoặc convenience snapshots nếu có thể derive đúng từ dữ liệu hiện có.

### Tên người trên ly

Một quyết định vận hành còn mở:

- Nếu staff cần biết “ly này của An”, đề xuất snapshot tên ở order_items.ordered_for_name nullable khi checkout.
- Không nhét tên người vào note vì note đang là yêu cầu pha chế.
- Nếu không cần nhận diện người sau checkout thì chưa thêm field này trong MVP.

Field này có lý do vận hành nhưng vẫn cần duyệt và audit schema trước khi implement.

## 8. API khái niệm

Các endpoint được đề xuất, chưa chốt contract:

```text
POST   /api/group-orders
POST   /api/group-orders/join
GET    /api/group-orders/[token]
PATCH  /api/group-orders/[token]
POST   /api/group-orders/[token]/items
PATCH  /api/group-orders/[token]/items/[itemToken]
DELETE /api/group-orders/[token]/items/[itemToken]
POST   /api/group-orders/[token]/leave
POST   /api/group-orders/[token]/checkout
```

- Create, đổi setting, lock và checkout dùng host authentication hiện tại.
- Guest dùng participant credential riêng, không mở quyền anonymous cho API order hiện tại.
- GET giỏ lọc dữ liệu theo visibility và membership.
- Không expose users.id, vouchers.id, participants.id hoặc host phone.
- Giữ response conventions của API owner; dùng các code hiện có khi phù hợp như
  UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, PRICE_CHANGED, STORE_CLOSED.
- Checkout load draft ở backend và gọi shared order workflow/calculator trực tiếp;
  không gọi HTTP nội bộ từ group API sang /api/orders.

## 9. Realtime và đồng bộ

Nguyên tắc đã đề xuất theo realtime owner: realtime chỉ báo phiên đã thay đổi,
client gọi lại API để lấy snapshot giỏ đầy đủ và dữ liệu JOIN.
Không dùng payload WebSocket làm nguồn render giỏ chính.

Lộ trình đề xuất:

1. MVP dùng TanStack Query polling khoảng 2–3 giây, refetch ngay sau mutation.
2. Sau đó bổ sung Supabase private Broadcast, event nhỏ như cart_changed kèm revision.

Supabase Realtime subscription đặt ở client qua adapter/hook; backend Vercel không giữ WebSocket dài hạn.
Backend có thể phát tín hiệu qua HTTP sau write; việc phát tín hiệu lỗi không làm mất dữ liệu đã lưu.
Reconnect phải refetch để bắt kịp; cleanup channel khi rời trang; polling có thể làm fallback.
Presence chỉ phục vụ hiển thị ai online, không xác định món đã lưu hay đã sẵn sàng.

App dùng custom auth, không dùng Supabase Auth. Nếu chọn private Broadcast, cần thiết kế credential
Realtime ngắn hạn tương thích Supabase và policy quyền đọc channel cho participant.
Không mặc định JWT jose hiện tại tự được Supabase chấp nhận; cần xác minh integration trước implementation.
Không expose service-role key; không mở trực tiếp bảng giỏ qua Data API chỉ để nhận event.

Các tài liệu nhà cung cấp đã tham khảo trong brainstorm:

- [Getting started with Realtime](https://supabase.com/docs/guides/realtime/getting_started)
- [Presence](https://supabase.com/docs/guides/realtime/presence)
- [Custom tokens](https://supabase.com/docs/guides/realtime/postgres-changes#custom-tokens)
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)

Các tài liệu này cần xác minh lại khi implement; project policy vẫn thuộc local owners.

## 10. Lock, checkout và order lifecycle

Luồng checkout đã đề xuất:

1. Host bấm khoá giỏ, OPEN chuyển LOCKED.
2. Mutation từ guest đến đồng thời phải kiểm tra trạng thái server; request không còn hợp lệ nhận CONFLICT.
3. Server load draft và re-fetch menu, powder, milk, addon cùng giá hiện tại từ DB.
4. Món hết bán/cấu hình không hợp lệ được báo để host xử lý; giá đổi dùng flow PRICE_CHANGED.
5. Host review giỏ và chọn voucher của host.
6. Host chọn PICKUP/DELIVERY, giờ nhận hoặc địa chỉ và người nhận phù hợp.
7. Tạo đúng một order thuộc host, liên kết phiên với order đó và chuyển CONVERTED.
8. Host thanh toán toàn bộ; tiếp tục VietQR và order lifecycle hiện tại.

Khoá/ghi món phải được kiểm soát ở DB để không lọt mutation sau lock.
Multi-step DB writes dùng transaction. Retry checkout trả lại order đã tạo thay vì tạo order trùng.
Trước khi order được tạo, host có thể mở khoá để chỉnh giỏ; sau khi tạo không quay lại draft.

## 11. Pricing, voucher và points

- Tái sử dụng canonical pricing và shared order/voucher calculator; không có công thức riêng cho group order.
- Server tính lại giá, không tin client totals; tiền integer VND, gram theo schema owner.
- Món trong group là bản nháp, chưa phải price snapshot của giao dịch.
- Đề xuất chỉ host dùng voucher, chọn voucher ở bước review cuối.
- Thứ tự voucher giữ theo owner: PRODUCT → ADDON → DISCOUNT → FREESHIP.
- Không reserve voucher khi mở phiên hoặc khi guest thêm món.
- Reservation/redemption/points theo order lifecycle thật hiện có.
- Đề xuất points thuộc host; guest không tích points riêng trong MVP.
- grand_total_vnd là số tiền thanh toán cuối; total_vnd là cơ sở points theo domain owner.

Các chi tiết nghiệp vụ authoritative nằm ở domain skills, không do bản draft này thay thế.

## 12. Default business rules đã đề xuất, chưa được chốt

| Quyết định | Đề xuất ban đầu |
|---|---|
| Phiên đang mở của một host | Tối đa một OPEN |
| Thời hạn phiên | 2 giờ |
| Số người | Tối đa 20 |
| Số ly | Tối đa 50 |
| Visibility mặc định | SHARED |
| Quyền host | Sửa/xóa tất cả món |
| Quyền guest | Sửa/xóa món của mình |
| Guest thoát | Giữ món đã lưu |
| Voucher/points | Chỉ thuộc host |
| Thanh toán | Host thanh toán toàn bộ |
| Link bị phát tán | Host khoá hoặc huỷ phiên |
| Personal cart | Tách biệt, được bảo toàn |

## 13. Điểm còn mở và bước tiếp theo

Các đề xuất trên chưa được user xác nhận thành rule chính thức.
Cần chốt visibility, hành vi ready/leave, tên trên ly, giới hạn phiên, quyền host và xử lý phiên hết hạn.
Cần làm rõ guest quét lại QR, đổi trình duyệt từ Zalo sang Safari/Chrome và khôi phục participant;
cookie của các browser context có thể khác nhau nên không được mặc định cùng một guest identity.
Cần xác định UX khi mất mạng, host đóng tab, giá đổi, checkout lỗi hoặc cửa hàng đóng trước lúc chốt.

Bước tiếp theo đã đề xuất: chuyển brainstorm thành quyết định sản phẩm/kiến trúc reviewable,
chốt business rules và state machine, sau đó thiết kế API/schema và implementation plan.
Khi bắt đầu, đối chiếu kiến trúc, API, schema, UI/domain owners và decision log hiện tại.
Không tự xem bản draft này là ADR hoặc specification đã duyệt.

## 14. Nguồn quy tắc khi phát triển

- [Kiến trúc](../SPECIFICATION.md)
- [API contract](../API.md)
- [Schema semantics](../SCHEMA.md)
- [File placement](../STRUCTURE.md)
- [Order flow](../.agents/skills/order-flow/SKILL.md)
- [Pricing](../.agents/skills/pricing-logic/SKILL.md)
- [Voucher flow](../.agents/skills/voucher-flow/SKILL.md)
- [API layer](../.agents/skills/api-layer/SKILL.md)
- [Mobile UX](../.agents/skills/mobile-ux/SKILL.md)
- [Supabase](../.agents/skills/supabase/SKILL.md)
- [Realtime](../.agents/skills/supabase-realtime/SKILL.md)
- [Decision log](../docs/decisions/README.md)

Tài liệu trong draft được phép track/commit/push lên GitHub như Markdown thông thường.
Việc tạo tài liệu không đồng nghĩa đã commit/push hay đã duyệt implementation.
