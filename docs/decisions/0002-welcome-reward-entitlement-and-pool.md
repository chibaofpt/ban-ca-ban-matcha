# 0002 — Entitlement và pool cho quà chào mừng

Status: Accepted
Date: 2026-09-13

## Context

Quà đăng ký phải tồn tại qua việc user đóng UI, thay đổi cấu hình và nhiều request đồng thời. Pool
voucher có stock hữu hạn và mốc mở khóa, trong khi việc đặt trước stock cho mọi account mới có thể
giữ phần thưởng vô thời hạn. Thiết kế cũng cần chừa một core chọn thưởng có thể dùng lại nếu sau này
có lượt quay bằng điểm.

## Decision

Tạo một entitlement bền vững cho mỗi user trong transaction đăng ký. `mode` lưu effective mode đã
commit sau khi áp dụng fallback availability, không mặc định sao chép raw settings mode: fixed
voucher không khả dụng commit thành `POINTS`; gacha hợp lệ chụp campaign hiện hành. `POINTS` và
voucher cố định hoàn tất ngay; gacha chỉ ghi outcome ở lần mở đầu tiên. Settings thay đổi sau commit
không viết lại entitlement. Không reserve stock khi tạo entitlement. Lần mở đọc lượng còn lại live,
lọc item đã unlock và còn khả dụng, rồi chọn theo trọng số là số lượng còn lại trong Serializable
transaction.

Draw count được suy từ outcome voucher đã commit. `unlock_after_draws` là số draw phải có trước khi
item tham gia, nên threshold 60 bắt đầu ở draw 61. Campaign dùng state `DRAFT`, `ACTIVE`, `PAUSED`,
`ENDED`; cấu hình nội dung bất biến sau `DRAFT`, còn pause/end xử lý entitlement đang chờ theo rule
canonical. Giữ thuật toán chọn reward tách khỏi welcome orchestration để có thể tái sử dụng, nhưng
không thêm point-to-draw API hoặc points debit trong quyết định này.

## Alternatives

- Chọn outcome ngay lúc đăng ký: giữ xác suất tại thời điểm signup nhưng lãng phí stock cho user
  không bao giờ mở và làm UI reveal không còn là commit point.
- Reserve một pool item lúc đăng ký: bảo đảm quà nhưng cần expiry/release reservation và tăng tranh
  chấp, state vận hành.
- Lưu mutable remaining/draw counter: đọc rẻ hơn nhưng có thêm nguồn state phải đồng bộ với outcome;
  outcome bất biến đã đủ để suy hai giá trị này.
- Dùng trọng số cấu hình độc lập với stock: cho tỷ lệ linh hoạt nhưng không biểu diễn trực tiếp quota
  đã duyệt và có thể chọn phần thưởng đã hết.

## Consequences

Entitlement không mất khi UI bị defer và không đổi theo settings mới. Stock chỉ bị tiêu thụ bởi
outcome đã commit; lượt mở phải chịu transaction conflict/retry và availability có thể thay đổi giữa
signup với open. Pending reward của campaign kết thúc có fallback xác định. Nếu triển khai
point-to-draw, cần quyết định riêng về giá, debit/refund/ticket và HTTP contract.

## Current owners

[Voucher lifecycle](../../.agents/skills/voucher-flow/references/lifecycle.md#welcome-reward-and-gacha),
[Reward UI](../specs/reward-ui.md), [API](../../API.md#customer-welcome-reward),
[SCHEMA](../../SCHEMA.md#welcome_reward_settings), và [deferred work](../../NOTES.md#phase-5).
