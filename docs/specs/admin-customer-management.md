# Admin customer management

> **Authority:** observable Admin Users UI, navigation and feedback.
> **Read when:** changing the Admin Users tab, customer detail surface, account actions, gifts,
> customer order history/detail, or wallet presentation.
> **Update when:** an Admin-visible state, transition, grouping, label or error branch changes.
> **Does not own:** HTTP payloads, order/points rules, voucher lifecycle, or persistence semantics.

API fields and failures belong to [API](../../API.md#admin-customer-management--admin-only).
Order awards and reversals belong to [order-flow](../../.agents/skills/order-flow/SKILL.md#points).
Voucher types, lifecycle and grants belong to
[voucher-flow](../../.agents/skills/voucher-flow/SKILL.md). Shared overlay and form behavior belongs
to [SPECIFICATION](../../SPECIFICATION.md#ui-system) and `mobile-ux`.

## Customer list

The Admin shell exposes a `Users` tab. Its list has ten customers per page and submits search against
name, phone or Instagram alias. Customers with completed orders appear first, sorted by the most
recent completed-order update across full history; customers with no completed order form the tail.

Each row shows identity, registration, verification and block state, points balance and the current
Vietnam-year completed spend. Spend uses the server summary; the UI does not recompute money or
derive registration from visible fields. Selecting a row opens its customer surface.

## One customer overlay

One `ResponsiveOverlay` owns the selected-customer session. It switches its body between customer
summary, points gift, voucher gift and order detail instead of stacking another detail sheet.
Closing is locked while a mutation is pending. A back control returns gift and order views to the
customer summary without losing the selected customer.

The customer summary provides two keyboard-navigable tabs:

- `Orders` is the initial tab and retains its own page while the overlay remains open.
- `Vouchers` loads on selection and retains a separate page.

Loading, empty, error and retry states remain visible within the active surface. Closing the customer
resets subview, tab and pagination state for the next selection.

## Account actions

Admin can manually verify/unverify and block/unblock a customer through explicit confirmation.
Blocking revokes sessions. Password reset is disabled for a ghost customer; for a registered
customer it generates a unique 24-character URL-safe temporary password, revokes sessions, and shows
the plaintext only in an explicit-only result surface so Admin can copy it once.

A ghost row is labeled `Chưa đăng ký`. When that phone completes public registration, registration
claims the same customer identity and its existing loyalty history; blocked or concurrently claimed
ghosts show the API error and are not presented as successful registration.

## Gifts

Points gift accepts an integer from 1 through 100, disables submission while pending, and returns to
the customer summary after success. The refreshed summary is authoritative for the new balance.

Voucher gift lists ten active, unended packages per page. Its filters are exact:

| Filter | Package types |
|---|---|
| `Tất cả` | all types |
| `Discount` | `DISCOUNT`, `PRODUCT_DISCOUNT` |
| `Tặng món` | `ITEM`, `PRODUCT`, `ADDON`, `BUNDLE` |
| `Shipping` | `FREESHIP` |

Choosing a package starts the idempotent grant flow. When the server requires additional-gift
acknowledgement, the UI shows the warning and continues with the same request identity only after
Admin confirms. Success refreshes the customer summary and returns to it.

## Orders

The order tab shows ten newest stored snapshots per page. Its compact summary groups lines only when
menu item, size, Base Liquid, Fusion powder and addon composition match; displayed quantity is the
sum for that group. Receipt totals and payable values come from the server snapshot.

Selecting an order replaces the overlay body with detail. Detail shows receiver/address, every
stored line and option, addons, voucher names, BUNDLE qualifier/reward relationships, stored gross
line value, discount and non-negative payable line value. It also shows stored subtotal, discounts,
shipping and final payable total.

Completed-order points are presented as order award plus voucher-surplus award minus reversal.
Unfinished orders show no points breakdown. A cancelled order shows reversal only when lifecycle
logs support it; the UI does not infer missing historical awards.

## Voucher wallet

The voucher tab shows ten newest wallet entries per page with package name, issuance time, effective
status and expiry presentation. Status labels cover active, reserved, redeemed, expired and refunded.
Entries without expiry say so; active entries show remaining days, and elapsed expiry is shown as
expired using the server projection. Reads do not mutate voucher lifecycle.

## Acceptance

- Khi danh sách đi qua ranh giới trang giữa khách có và không có đơn hoàn tất, thì thứ tự vẫn giữ
  nhóm completed trước và tail sau, mỗi trang tối đa mười dòng.
- Khi Admin mở gift hoặc order detail rồi quay lại, thì chỉ một customer overlay còn mở và customer
  đang chọn không đổi.
- Khi reset ghost, grant thất bại, hoặc load tab thất bại, thì UI hiển thị failure và không claim
  success; mutation đang chạy khóa thao tác đóng hoặc gửi lặp tương ứng.
- Khi xem order hoặc voucher, UI trình bày server snapshot/projection và không tính lại business rule.
