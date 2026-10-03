# Voucher Lifecycle, Issuance, Refunds, Points, and QR

## Voucher Lifecycle

```
ACTIVE → RESERVED at PENDING order creation
RESERVED → REDEEMED at ADMIN_CONFIRMED
RESERVED/REDEEMED → ACTIVE when order CANCELLED (if expires_at > now)
RESERVED/REDEEMED → EXPIRED when order CANCELLED (if expires_at <= now)

ACTIVE → REDEEMED + used_channel = OFFLINE       (counter CASH or staff offline scan)
ACTIVE → RESERVED                                (counter BANK_TRANSFER creation)
RESERVED voucher + RESERVED BUNDLE application
  → both REDEEMED + voucher.used_channel = OFFLINE (counter transfer confirmation)
ACTIVE → REFUNDED                                (auto: target item soft-deleted)
```

- Reserve only vouchers the calculator actually applied.
- Redeem online vouchers exactly once at `ADMIN_CONFIRMED` with `used_channel = ONLINE`.
- Do not perform another voucher status transition at `COMPLETED`.
- At `COMPLETED`, award order points and aggregate PRODUCT surplus in the same transaction.
- For COUNTER CASH, create as `COMPLETED`, redeem applied vouchers as `OFFLINE`, and award order
  and surplus points in the creation transaction.
- For COUNTER BANK_TRANSFER, create as `PENDING`, reserve applied vouchers, then redeem as
  `OFFLINE` and award points only when the creator Staff or an Admin confirms payment.

### Expiry

- For order creation, capture one server `acceptanceDate` at handler entry. Treat
  `expires_at <= acceptanceDate` as unusable; a voucher valid at acceptance remains usable through
  later processing and Serializable retries. Do not replace this with commit-time wall clock.
- Outside an accepted order, treat `expires_at <= now` as unusable in list, exchange and scan flows,
  regardless of stored status.
- `lazyExpireVouchers(userId)` may write `status = EXPIRED` only from an explicit mutation or an
  existing mutation flow. Customer wallet reconciliation uses `POST /api/profile/vouchers/sync`;
  GET wallet/staff-list routes project effective expiry without writing.
- Never lazy-expire `RESERVED` vouchers — the reservation is still valid.
- If an order is cancelled after the voucher's `expires_at`, set status = `EXPIRED`, not `ACTIVE`.
  This is handled by `cancelOrder` / `restoreVouchersOnCancel`.

---

## Package → Voucher (Copy Behavior)

- Copy all business fields from the package when issuing a voucher. Package edits never affect
  already-issued vouchers.
- Copy voucher type, discount data including `max_discount_vnd`, all menu/addon scope rows and snapshots, `covered_price_vnd`,
  `covered_delivery_fee_vnd`, `min_order_vnd`, and expiry data.
- Keep PRODUCT size, powder, milk, and included-addon fields for display/audit only. Do not use
  them as application constraints or let included addons expand PRODUCT monetary coverage.

---

## Welcome Reward and Gacha

Mỗi user có đúng một entitlement quà chào mừng bền vững, được quyết định trong transaction đăng ký.
`mode` của entitlement là effective mode đã commit sau khi áp dụng fallback availability, không
nhất thiết là raw settings mode; settings thay đổi sau đó không viết lại entitlement. Ba mode loại
trừ nhau:

- `POINTS`: cộng ngay 5 🐟, ghi `points_log.reason = "welcome_bonus"` và hoàn tất entitlement.
- `FIXED_VOUCHER`: phát ngay voucher từ `fixed_package_id` với `issued_via = WELCOME_GIFT`. Nếu
  package hoặc target không còn khả dụng lúc phát, commit entitlement với mode `POINTS` và cộng
  5 🐟.
- `GACHA`: chụp `active_campaign_id` vào entitlement và để `PENDING` khi campaign đang `ACTIVE` và
  còn ít nhất một allocation chưa phát. Nếu điều kiện đó không còn đúng lúc đăng ký, dùng fallback
  5 🐟 ngay.

Entitlement `GACHA` không giữ chỗ trong pool khi đăng ký hoặc khi user chỉ xem hộp. Stock được giải
quyết đúng một lần ở lần mở đầu tiên thành công, trong Serializable transaction; outcome đã commit
được trả lại cho các lần mở lại. `request_id` là idempotency key của lần mở và không được gắn lại
sang entitlement khác.

Với campaign còn `ACTIVE`, đặt `n` bằng số outcome voucher đã commit của campaign. Mỗi pool item có
`remaining = max(quantity - issued_count, 0)` và đủ điều kiện khi `unlock_after_draws <= n`.
Chọn ngẫu nhiên theo trọng số `remaining` trên các item còn hàng, đã mở khóa và có package/target
đang khả dụng. Vì vậy `unlock_after_draws = 60` bắt đầu tham gia khi đã có 60 voucher outcome và
voucher kế tiếp mang `draw_number = 61`. Nếu item được chọn mất availability, loại item đó khỏi
candidates của transaction và thử phần còn lại; không tự đổi trọng số thành tỷ lệ cấu hình khác.

- `PAUSED` chặn mở với `REWARD_PAUSED` và giữ nguyên entitlement `PENDING`.
- `ENDED`, hoặc pool thực sự hết allocation, hoàn tất lần mở bằng fallback 5 🐟; box đã chọn vẫn
  được lưu trong outcome.
- Nếu campaign `ACTIVE` còn allocation nhưng hiện không có candidate khả dụng, trả
  `REWARD_TEMPORARILY_UNAVAILABLE`; không phát fallback và user có thể thử lại sau.
- Lần mở chỉ chọn box thuộc campaign đã chụp. Box là lựa chọn trình bày/audit; package trúng do pool
  và server quyết định, không phụ thuộc box.

`DRAFT` cho phép đổi tên, thay toàn bộ pool và thêm/sửa/xóa box. Kích hoạt cần pool không rỗng, mọi
package hiện khả dụng, mọi mốc mở đạt được và 3–12 box. Các transition duy nhất là
`DRAFT → ACTIVE`, `ACTIVE → PAUSED`, `PAUSED → ACTIVE`, và `ACTIVE|PAUSED → ENDED`; `ENDED` không
mở lại. Pool, tên và box bất biến sau khi rời `DRAFT`; pause/resume/end dùng revision để phát hiện
ghi đồng thời. Settings có thể trỏ `GACHA` tới một campaign `ACTIVE`, nhưng entitlement đã tạo luôn
giữ campaign snapshot của chính nó.

Voucher `WELCOME_GIFT` và `GACHA_REWARD` vẫn phải qua package/target availability và copy đầy đủ
snapshot phát hành. Hai nguồn này không dùng quota `voucher_packages.quantity` legacy và không tính
vào `max_per_user`; `GACHA_REWARD` bị giới hạn riêng bởi `reward_pool_items.quantity` của từng
campaign. `WELCOME_GIFT` cố định không đặt trước hoặc tiêu thụ pool campaign.

Core chọn thưởng được thiết kế để có thể tái sử dụng cho point-to-draw sau này, nhưng hiện chỉ có
welcome entitlement. Chưa có endpoint mua lượt, trừ điểm, ticket hay refund cho lượt quay; phạm vi
đó vẫn deferred trong [NOTES](../../../../NOTES.md#phase-5).

HTTP payload, DTO và error envelope thuộc [API](../../../../API.md#customer-welcome-reward);
persistence và invariant thuộc [SCHEMA](../../../../SCHEMA.md#welcome_reward_settings); UI thuộc
[Reward UI](../../../../docs/specs/reward-ui.md).

---

## Voucher Exchange (Points to Voucher)

- Require an active package and sufficient customer points.
- In one transaction, deduct the immutable package point cost, copy the package into an owned
  voucher, append a `voucher_purchase` points log, and resolve its expiry.
- The HTTP path, payload and response contract belong to [API.md](../../../../API.md).

---

## Admin Gift Issuance

- ADMIN gifts use issued_via = ADMIN, persist issuing_admin_id and a unique manual request_id, and may issue from either PUBLIC or PRIVATE packages.
- One intentional request issues one voucher. Replaying the same request id for the same admin, package, and customer returns that voucher with its effective lifecycle status; rebinding the id is a 409 CONFLICT. ADMIN gifts never write voucher_grants, deduct points, or create a voucher_purchase log.
- Package quantity counts every source, while max_per_user counts only lifetime self-acquisition through POINTS_EXCHANGE, FREE_CLAIM, and AUTO_GRANT. Warnings require an explicit additional-gift acknowledgement; acknowledgement cannot bypass package validity, live targets, or global stock.

### Recipient History

- ADMIN recipient history is a bounded read. ALL includes every instance, CURRENT includes all RESERVED rows plus unexpired ACTIVE rows, and USED includes REDEEMED rows.
- History projects effective expiry without writing rows, uses a stable (created_at, id) cursor, and returns source, timestamps, public QR tokens, and a fresh page-independent summary.

## Voucher Refund

- **Eligibility**: an unexpired ACTIVE `POINTS_EXCHANGE` voucher whose live target/configuration is
  no longer usable, including a soft-deleted target item.
- Refund **100% of the immutable `voucher_purchase` cost**. Status → `REFUNDED`.
- Customer may request reconciliation through the refund API, but cannot choose arbitrary eligible
  state or refund value; the server re-resolves live availability and purchase audit.
- `points_log.reason = "voucher_refund"`.

### Completed COUNTER cancellation recovery

Follow [order-flow](../../order-flow/SKILL.md#completed-counter-cancellation) for reversal and
recovery rules. Voucher refund eligibility and immutable purchase-cost semantics above still apply.

---

## Points System

Order earning and completion timing belong to [order-flow](../../order-flow/SKILL.md#points).
Voucher-specific point rules remain:

| Action | Formula / Rule |
|---|---|
| PRODUCT surplus | `floor(sum(order surplus VND) / 10000)` on `COMPLETED` |
| Spend on voucher | Deduct the immutable `package.points_cost` |
| Manual add | ADMIN only, max 100/action, `performed_by` = admin user id |
| Reversal | Append an immutable linked reversal row |

- `points_log` is **immutable** — never UPDATE, only INSERT.
- 1 🐟 = 1,000 VND là đơn vị hiển thị. Ngưỡng doanh thu để nhận một điểm là 10,000 VND;
  đây là earning rate, không phải giá trị quy đổi hiển thị. Xem SCHEMA `Currency & Units`.
- Create one aggregate `voucher_surplus` log for the order, not one log per PRODUCT voucher.

Valid `points_log.reason` values and persistence semantics belong to
[SCHEMA.md](../../../../SCHEMA.md#points_log). Preserve one aggregate `voucher_surplus` row per order.


## QR Scan Flow

- Resolve users before vouchers when scanning a `qr_token`; never expose an internal `id`.
- Only STAFF or ADMIN may be recorded as `redeemed_by`.
- Scanning, target selection, and redemption are distinct steps. Whether a voucher can be redeemed
  directly, needs selection among multiple scopes, or is order-only depends on its voucher type.
  Use [API.md](../../../../API.md) for the current singleton/multi-target scan DTO and mutation
  contract; preserve the ITEM and BUNDLE direct-redemption prohibitions in the relevant checkout and BUNDLE references.
- An allowed direct offline redemption marks the voucher `REDEEMED` with `used_channel = OFFLINE`
  and creates no order.
