---
name: voucher-flow
description: >
  Standardize voucher eligibility, application order, stacking, lifecycle, surplus,
  points, and QR rules for Bạn Cá Bán Matcha. Use for voucher apply/reserve/redeem,
  PRODUCT credit, ADDON voucher, DISCOUNT, FREESHIP, covered_price_vnd,
  min_order_vnd, voucher surplus, voucher expiry, points, QR scan,
  voucher packages, lib/vouchers.ts, or any order calculation involving vouchers.
---

# Voucher Flow Skill

Treat this file as the business source of truth for vouchers and voucher-related points.
Also read `order-flow` for order status and `pricing-logic` for drink price components.

---

## File Map

| File | Layer | Purpose |
|---|---|---|
| `lib/vouchers.ts` | SERVER | Voucher validation, application, and redemption (8.2 KB) |
| `src/utils/voucherMatchUtils.ts` | CLIENT | Voucher matching utilities (7.2 KB) |
| `src/lib/utils/voucherModalHelpers.ts` | CLIENT | Modal display helpers (7.4 KB) |
| `app/api/profile/vouchers/route.ts` | SERVER | List customer's vouchers in all lifecycle statuses |
| `app/api/profile/vouchers/exchange/route.ts` | SERVER | Spend points → get voucher |
| `app/api/profile/vouchers/refund/route.ts` | SERVER | Auto-refund when item unavailable |
| `app/api/staff/scan/route.ts` | SERVER | QR scan → resolve user or voucher |
| `app/api/staff/vouchers/[id]/redeem/route.ts` | SERVER | Offline voucher redemption |
| `app/api/admin/voucher-packages/route.ts` | SERVER | Package CRUD (13.8 KB) |

---

## 4 Voucher Types

| Type | Level | What It Covers |
|---|---|---|
| `PRODUCT` | Item-level | One drink unit matching `menu_item_id`; covers drink components only. |
| `ADDON` | Addon-level | One unit of a specific `addon_option_id`; never Extra Matcha. |
| `DISCOUNT` | Order-level | Reduces `total_vnd`. `PERCENT` or `FIXED` via `discount_type`. |
| `FREESHIP` | Order-level | Covers delivery fee up to `covered_delivery_fee_vnd`. |

---

## Canonical Application Order and Totals

Allow one order to carry all four types simultaneously. Always use one shared server
calculator for customer and staff orders; never duplicate or reorder these calculations.

**Application order** (strict — never reorder):
```
PRODUCT → ADDON → DISCOUNT → FREESHIP
```

### Canonical money terms

- `drink_price_vnd`: server-computed drink price including base, powder, milk, and
  Premium Latte where applicable; exclude all addons.
- `subtotal_vnd`: gross merchandise subtotal before vouchers; include drinks and addons;
  exclude shipping.
- `item_discount_vnd`: total PRODUCT and ADDON reductions.
- `discountable_subtotal_vnd = max(0, subtotal_vnd - item_discount_vnd)`.
- `total_voucher_discount_vnd`: order-level DISCOUNT reduction only.
- `total_vnd = max(0, discountable_subtotal_vnd - total_voucher_discount_vnd)`.
- `grand_total_vnd = max(0, total_vnd + shipping_fee_vnd - freeship_discount_vnd)`.

Use `grand_total_vnd` for VietQR and final payable displays. Use `total_vnd`, not
`grand_total_vnd`, to earn order points.

---

## Voucher Lifecycle

```
ACTIVE → RESERVED at PENDING order creation
RESERVED → REDEEMED at ADMIN_CONFIRMED
RESERVED/REDEEMED → ACTIVE when order CANCELLED (if expires_at > now)
RESERVED/REDEEMED → EXPIRED when order CANCELLED (if expires_at <= now)

ACTIVE → REDEEMED + used_channel = OFFLINE       (counter or staff offline scan)
ACTIVE → REFUNDED                                (auto: target item soft-deleted)
```

- Reserve only vouchers the calculator actually applied.
- Redeem online vouchers exactly once at `ADMIN_CONFIRMED` with `used_channel = ONLINE`.
- Do not perform another voucher status transition at `COMPLETED`.
- At `COMPLETED`, award order points and aggregate PRODUCT surplus in the same transaction.
- For COUNTER, create as `COMPLETED`, redeem applied vouchers as `OFFLINE`, and award order
  and surplus points in the creation transaction.

### Expiry

- Treat `expires_at <= now` as unusable in every list, apply, exchange, and scan flow,
  regardless of stored status.
- **Lazy synchronization is implemented**: `lazyExpireVouchers(userId)` writes `status = EXPIRED`
  for `ACTIVE` vouchers past `expires_at` before list, apply, and scan flows. No cron needed.
- Never lazy-expire `RESERVED` vouchers — the reservation is still valid.
- If an order is cancelled after the voucher's `expires_at`, set status = `EXPIRED`, not `ACTIVE`.
  This is handled by `cancelOrder` / `restoreVouchersOnCancel`.

---

## PRODUCT Voucher Details

- Match only `voucher.menu_item_id === order_item.menu_item_id`. Treat size, powder, milk,
  and included-addon snapshots as descriptive data, not eligibility constraints.
- Apply one PRODUCT voucher to one drink unit. Split a voucher-bearing unit into its own
  cart line when the original line quantity is greater than one.
- At package creation, compute `covered_price_vnd` from the selected drink configuration only.
  Exclude every addon, including IDs retained in `included_addon_option_ids`.
- Keep `covered_price_vnd` fixed from voucher issuance; never recompute an issued voucher.
- Limit PRODUCT credit to `drink_price_vnd`. Never spill unused credit into addons.

```text
product_discount_vnd = min(drink_price_vnd, covered_price_vnd)
drink_payable_vnd = max(0, drink_price_vnd - covered_price_vnd)
product_surplus_vnd = max(0, covered_price_vnd - drink_price_vnd)
```

Aggregate PRODUCT surplus across the whole order before rounding:

```text
order_surplus_vnd = sum(product_surplus_vnd for all applied PRODUCT vouchers)
surplus_points = floor(order_surplus_vnd / 10000)
```

Award **one** aggregate `voucher_surplus` points entry per order:
- For ONLINE orders: at `COMPLETED` transition in `staff/orders/[id]` route.
- For COUNTER orders: in the creation transaction (`POST /api/staff/orders`).

```ts
// Single log row — never per-item
pointsLog.create({
  reason: "voucher_surplus",
  delta: surplusPoints,
  voucher_id: null,  // Aggregate — not tied to one voucher
  order_id,
})
```

Do not round or award surplus separately per voucher or per item.
Derive the aggregate from `order_items.unit_price_vnd` (drink snapshot) and
`vouchers.covered_price_vnd` (voucher snapshot). The fields `order_items.surplus_points`
and `order_discount_vouchers.discount_applied_vnd` have been **dropped** (migration
`20260720201131`). Do not reference or recreate them.

---

## ADDON Voucher Details

- Match the exact `addon_option_id` on the selected order item.
- Cover the current price of one addon unit only. For quantity three, one voucher discounts
  one unit and the customer pays for two units.
- Allow multiple ADDON vouchers on one menu item only when their `addon_option_id` values
  differ. Allow at most one voucher for the same `addon_option_id` on that item.
- Never apply an ADDON voucher to Extra Matcha. Extra Matcha keeps its dynamic price based on
  `gram_value × selected_powder.price_per_gram`.

## DISCOUNT Voucher Details

- Evaluate `min_order_vnd` against `discountable_subtotal_vnd`, after PRODUCT and ADDON.
- Allow multiple FIXED vouchers and at most one PERCENT voucher per order.
- Apply FIXED vouchers first in request/selection order, then apply PERCENT to the remainder.
- Require FIXED `discount_value` to be an integer multiple of 1,000 VND in UI and server Zod.
- Round a PERCENT reduction down to the nearest 1,000 VND.
- Cap each reduction at the remaining amount; never produce a negative total.
- Link which vouchers were used. Do not evenly distribute or fabricate a per-voucher applied
  amount in `order_discount_vouchers`.

## FREESHIP Voucher Details

- Allow at most one FREESHIP voucher and only for `DELIVERY`.
- Evaluate `min_order_vnd` against `total_vnd`, after PRODUCT, ADDON, and DISCOUNT, before ship.
- Set `freeship_discount_vnd = min(shipping_fee_vnd, covered_delivery_fee_vnd)`.
- Keep `total_vnd` merchandise-only and add shipping only in `grand_total_vnd`.

## No-Benefit Rule

Do not consume a voucher whose incremental benefit is zero after earlier vouchers are applied.

- Do not link it to the order.
- Do not move it to `RESERVED` or `REDEEMED`.
- Keep it available for later use.
- Let the UI explain that the voucher was removed because it added no benefit.

Consume a partially applied voucher because it still creates a benefit. Treat a failed
`min_order_vnd` check as an eligibility error, not as a no-benefit case.

---

## Package → Voucher (Copy Behavior)

- Copy all business fields from the package when issuing a voucher. Package edits never affect
  already-issued vouchers.
- Copy voucher type, discount data, product/addon snapshots, `covered_price_vnd`,
  `covered_delivery_fee_vnd`, `min_order_vnd`, and expiry data.
- Keep PRODUCT size, powder, milk, and included-addon fields for display/audit only. Do not use
  them as application constraints or let included addons expand PRODUCT monetary coverage.

---

## Voucher Exchange (Points → Voucher)

1. Customer calls `POST /api/profile/vouchers/exchange` with `{ package_id }`.
2. Server validates: package `is_active`, customer has enough `points_balance`.
3. Inside `prisma.$transaction()`:
   - Deduct points from `users.points_balance`.
   - Create `vouchers` row (copy fields from package).
   - Create `points_log` row: `delta = -points_cost`, `reason = "voucher_purchase"`.
   - Set `expires_at` if package has `expires_after_days`.

---

## Voucher Refund

- **Trigger**: voucher's target `menu_item.is_available = false` (soft-deleted).
- Auto-refund **100% points**. Status → `REFUNDED`.
- Users **cannot** refund manually — system-triggered only.
- `points_log.reason = "voucher_refund"`.

---

## Points System

| Action | Formula / Rule |
|---|---|
| Earn on order | `floor(total_vnd / 10000)` on `COMPLETED`; exclude shipping |
| PRODUCT surplus | `floor(sum(order surplus VND) / 10000)` on `COMPLETED` |
| Spend on voucher | Deduct `package.points_cost` |
| Manual add | ADMIN only, max 100/action, `performed_by` = admin user id |
| Reversal | Insert new negative-delta row, `reason = "reversed_by_admin"`, `reversed_log_id` = original row id |

- `points_log` is **immutable** — never UPDATE, only INSERT.
- 1 🐟 = 1,000 VND. 1 point = 10,000 VND.
- Create one aggregate `voucher_surplus` log for the order, not one log per PRODUCT voucher.

### `points_log.reason` Valid Values

| Value | Trigger |
|---|---|
| `order_complete` | Order status → COMPLETED |
| `manual_admin_adjustment` | Admin manually adds/deducts points |
| `voucher_purchase` | Customer spends points to buy a voucher |
| `voucher_surplus` | Aggregate PRODUCT surplus awarded when order → COMPLETED |
| `order_complete_reversed` | Reversal after a completed COUNTER order is cancelled |
| `voucher_surplus_reversed` | Reversal of aggregate PRODUCT surplus after cancellation |
| `voucher_refund` | Target item soft-deleted → full refund |
| `reversed_by_admin` | Admin reverses a manual adjustment |

---

## QR Scan Flow

1. Check `users` by `qr_token` first.
2. If not found, check `vouchers` by `qr_token`.
3. **Never return internal `id`** — always use `qr_token`.
4. `redeemed_by` accepts **STAFF or ADMIN** only.
5. Offline redeem: mark `REDEEMED` + `used_channel = OFFLINE`. No order created.
