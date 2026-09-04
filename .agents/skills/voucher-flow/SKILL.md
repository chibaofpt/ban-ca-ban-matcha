---
name: voucher-flow
description: >
  Standardize voucher eligibility, application order, stacking, lifecycle, surplus,
  points, and QR rules for Bạn Cá Bán Matcha. Use for voucher apply/reserve/redeem,
  PRODUCT credit, PRODUCT_DISCOUNT, FIXED_AMOUNT, PAY_AS_SIZE, ADDON voucher,
  DISCOUNT, FREESHIP, covered_price_vnd,
  min_order_vnd, voucher surplus, voucher expiry, points, QR scan,
  voucher packages, lib/vouchers.ts, or any order calculation involving vouchers.
---

# Voucher Flow Skill

Treat this file as the business source of truth for vouchers and voucher-related points.
Also read `order-flow` for order status and `pricing-logic` for drink price components.

---

Inspect current files, callers and tests with `rg`; do not maintain file paths or sizes in this skill.

## Voucher Types

| Type | Level | What It Covers |
|---|---|---|
| `ITEM` | Item-level | One fixed-price `extras` unit at its current server price; no surplus. |
| `PRODUCT` | Item-level | One drink unit matching `menu_item_id`; covers drink components only. |
| `PRODUCT_DISCOUNT` | Item-level, selected from main cart | Discounts one configured drink/size using `FIXED_AMOUNT` or `PAY_AS_SIZE`; excludes addons. |
| `ADDON` | Addon-level | One unit of a specific `addon_option_id`; never Extra Matcha. |
| `DISCOUNT` | Order-level | Reduces `total_vnd`. `PERCENT` or `FIXED` via `discount_type`. |
| `FREESHIP` | Order-level | Covers delivery fee up to `covered_delivery_fee_vnd`. |

---

## Canonical Application Order and Totals

Allow one order to carry all four types simultaneously. Always use one shared server
calculator for customer and staff orders; never duplicate or reorder these calculations.

**Application order** (strict — never reorder):
```
BUNDLE → ITEM/PRODUCT/PRODUCT_DISCOUNT → ADDON → DISCOUNT → FREESHIP
```

### Canonical money terms

- `drink_price_vnd`: server-computed drink price including base, powder, milk, and
  Premium Latte where applicable; exclude all addons.
- `subtotal_vnd`: gross merchandise subtotal before vouchers; include drinks and addons;
  exclude shipping.
- `item_discount_vnd`: total BUNDLE, ITEM, PRODUCT, and ADDON reductions.
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

## PRODUCT Voucher Details

- Match only `voucher.menu_item_id === order_item.menu_item_id`. Treat size, powder, Base Liquid,
  and included-addon snapshots as descriptive data, not eligibility constraints.
- Apply one PRODUCT voucher to one drink unit. Split a voucher-bearing unit into its own
  cart line when the original line quantity is greater than one.
- At package creation, compute `covered_price_vnd` from the selected drink configuration only.
  Exclude every addon, including IDs retained in `included_addon_option_ids`.
- Keep `covered_price_vnd` fixed from voucher issuance; never recompute an issued voucher.
- “Dùng ngay” must resolve the voucher's saved Base Liquid against the item's current default and
  allow-list, store the resolved selection in cart, and include the normal Latte cost/Fusion delta.
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
- For COUNTER CASH: in the creation transaction (`POST /api/staff/orders`).
- For COUNTER BANK_TRANSFER: at direct `COMPLETED` payment confirmation.

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

## PRODUCT_DISCOUNT Voucher Details

- Present `PRODUCT_DISCOUNT` in the customer's main cart voucher list, while persisting the
  applied token on exactly one qualifying drink unit through the existing product-voucher fields.
- Keep other item-level `PRODUCT`, `ITEM`, and `ADDON` vouchers in their per-item selection flows.
- Match an exact configured `menu_item_id` and an allowed current size. Also require `ACTIVE`,
  `availability.can_apply`, no conflicting BUNDLE allocation, and a positive incremental benefit.
- `FIXED_AMOUNT` benefit:

```text
product_discount_vnd = min(current_drink_price_vnd, discount_value)
```

- `PAY_AS_SIZE` benefit, using the same selected powder and Base Liquid and excluding addons:

```text
product_discount_vnd = max(
  current_eligible_size_drink_price_vnd - current_reference_size_drink_price_vnd,
  0
)
```

- Keep an ACTIVE but currently ineligible voucher visible in the cart picker. Disable only its
  selection control, expose a specific reason, and keep voucher details readable.
- Apply immediately when exactly one cart target qualifies. When multiple targets qualify, require
  explicit target selection in a nested customer bottom sheet.
- If the selected cart line has quantity greater than one, split one unit before applying.
- Replacing a product-level voucher must release only the previous voucher on the selected unit.
- Removing the selected voucher must restore that unit's normal calculated drink price.
- A selected voucher remains visible and removable even if later cart changes make it ineligible.
- Do not allow a PRODUCT_DISCOUNT token and a BUNDLE allocation to overlap on the same cart unit.
- Server order resolution remains authoritative: re-fetch configuration and prices and reject
  stale or invalid client selections before reserving the voucher.

---

## ITEM Voucher Details

- Target `extras` menu items only; match exact `menu_item_id`.
- Apply to one standalone unit, cover its current server price completely, and create no surplus.
- Split a voucher-bearing quantity into its own quantity-one cart/order line.
- A voucher token may appear on only one cart line. Customer and staff cart stores must move the
  voucher to the newest target and restore the previous line price; persisted carts are normalized
  during version migration before checkout.
- Keep `covered_price_vnd`, size, powder, Base Liquid, and addon configuration null.
- ITEM is order-only: direct offline redemption is forbidden. Reserve/redeem/restore it with the
  same order lifecycle as PRODUCT, and refund active vouchers when the target is soft-deleted.
- Admin price changes warn about active valid ITEM vouchers, but existing vouchers continue to
  cover the full new current price.

---

## BUNDLE Voucher Details

- A BUNDLE voucher package owns one immutable BUNDLE rule directly. There is no Promotion layer.
  Deactivation stops new issuance; it does not invalidate vouchers already issued.
- Packages are effective immediately. `ends_at` is optional; there is no `starts_at`. Admin picks
  the final usable Vietnam calendar date; store it as the exclusive next-day 00:00 at UTC+7 and
  require `now < ends_at`.
- Acquisition modes are `POINTS_EXCHANGE`, `FREE_CLAIM`, and `AUTO_GRANT`. Free/auto modes cost
  zero points. `voucher_grants` makes free issuance idempotent under concurrent requests.
- Registration attempts AUTO_GRANT immediately. Wallet and authenticated order entry points retry
  lazily, covering accounts created while a campaign is active. Anonymous orders never receive or
  use BUNDLE vouchers; ghost users are eligible after their user row exists.
- Customer acquisition lists expose the live global `remaining_quantity`, exclude `AUTO_GRANT`,
  and use one shared FREE_CLAIM / POINTS_EXCHANGE catalog in the wallet and cart. A points exchange
  always requires confirmation; BUNDLE vouchers use an in-cart CTA instead of offline QR redemption.
- Accept multiple distinct BUNDLE voucher instances per order through `bundle_applications`. Each
  application owns explicit qualifier and reward allocations keyed by stable `client_line_id`.
  A token appears once, and product/addon unit quantities cannot overlap across applications.
  The server re-resolves products, configuration, addons, and prices before evaluating them.
- Resolve voucher ownership through an explicit `voucher_owner_id`, never by assuming the order
  host owns every line. This boundary is required for future group orders.
- Product scopes may target drinks or `extras`. Extras have null configuration for all reward modes.
- `SAME_CONFIG` means the qualifier and reward use the same menu item. Qualifiers may use any
  configured allowed size; reward baseline is the current server price of the smallest selected
  qualifier size/configuration. `FIXED_CONFIG` has exactly one configured reward product;
  `ALLOWED_SCOPE` has one or more selectable reward products. Both use the current server price of
  the stored default powder/Base Liquid snapshot at the actual reward size as baseline.
- Customer powder/Base Liquid changes remain allowed. Charge only `max(actual reward drink price -
  baseline, 0)`; a cheaper configuration has zero payable difference and creates no surplus.
  Product BUNDLE benefits never cover addons.
- Addon rewards may scale per bundle, once per order, or per qualifying item. Pool allocations
  across eligible items, reject Extra Matcha, and never overlap PRODUCT/ADDON voucher benefits.
- Reward units never count again as qualifiers, including when the same menu item appears in both
  roles. Qualifier and reward allocations may overlap only up to distinct paid units.
- `min_order_vnd` is evaluated from paid merchandise: exclude units covered by ITEM/PRODUCT/BUNDLE
  and exclude addon units covered by ADDON vouchers. A drink carrying only
  an ADDON voucher still counts as a qualifying product.
- Qualifier and reward products are grouped by menu item: one default powder, one default Base
  Liquid, and multiple allowed sizes. Qualifier eligibility matches menu item + allowed size only.
  One BUNDLE package has exactly one reward kind: PRODUCT or ADDON.
- Admin BUNDLE scope configures each product independently as one immutable default configuration
  plus its allowed sizes. Prices are never entered or stored as BUNDLE reference credit.
- Reserve at order creation, redeem both the voucher and its order application on payment
  confirmation/completion, and restore/cancel both sides on cancellation.
  Direct offline QR redemption of BUNDLE vouchers is forbidden.

## ADDON Voucher Details

- Match the exact `addon_option_id` on the selected order item.
- New issuance, exchange, and package reactivation require the target option and its group to be
  active. Dynamic-gram options are never eligible.
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
- If `max_discount_vnd` is set, cap the PERCENT reduction at this maximum limit.
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
- Copy voucher type, discount data including `max_discount_vnd`, product/addon snapshots, `covered_price_vnd`,
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

- **Eligibility**: an unexpired ACTIVE `POINTS_EXCHANGE` voucher whose live target/configuration is
  no longer usable, including a soft-deleted target item.
- Refund **100% of the immutable `voucher_purchase` cost**. Status → `REFUNDED`.
- Customer may request reconciliation through the refund API, but cannot choose arbitrary eligible
  state or refund value; the server re-resolves live availability and purchase audit.
- `points_log.reason = "voucher_refund"`.

### Completed COUNTER cancellation recovery

- Before cancelling, reverse all outstanding `order_complete` and `voucher_surplus` points using
  trustworthy linked audit rows for the same user/order/reason.
- If the balance is insufficient, revoke newest whole vouchers for the same user only when they are
  unexpired `ACTIVE` `POINTS_EXCHANGE` vouchers with an unreversed negative `voucher_purchase` log.
  Refund the immutable purchase cost, never the current package cost.
- Exclude free/granted, reserved, redeemed, expired, refunded, already-refunded vouchers and any
  voucher restored from the order being cancelled.
- If trustworthy recovery cannot cover the full outstanding amount, abort every cancellation write
  with `INSUFFICIENT_REVERSIBLE_POINTS`; never create debt or partially cancel.

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
| `voucher_refund` | Full original purchase-cost refund after target soft-delete or eligible completed COUNTER recovery |
| `reversed_by_admin` | Admin reverses a manual adjustment |

---

## QR Scan Flow

1. Check `users` by `qr_token` first.
2. If not found, check `vouchers` by `qr_token`.
3. **Never return internal `id`** — always use `qr_token`.
4. `redeemed_by` accepts **STAFF or ADMIN** only.
5. Offline redeem: mark `REDEEMED` + `used_channel = OFFLINE`. No order created.
