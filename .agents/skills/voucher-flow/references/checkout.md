# Voucher Checkout Rules

## PRODUCT Voucher Details

- New packages store 1–100 unique `menuItemScopes`; each row owns its size, powder, Base Liquid, and immutable drink-only `covered_price_vnd`. The legacy scalar columns remain a compatibility anchor. Issuance copies every scope row to the owned voucher.
- Match the selected order item to one scope row. Treat the saved configuration as the starting customization and credit snapshot; after selection, customers may customize and pay any excess.
- Apply one PRODUCT voucher to one drink unit. Split a voucher-bearing unit into its own
  cart line when the original line quantity is greater than one.
- At package creation, compute each target row's `covered_price_vnd` from that target's selected drink configuration only.
  Exclude every addon, including IDs retained in `included_addon_option_ids`.
- Keep `covered_price_vnd` fixed from voucher issuance; never recompute an issued voucher.
- Use-now must resolve the voucher's saved powder and Base Liquid against the item's current
  default and allow-lists, store the resolved selection in cart, and include the normal Latte
  cost/Fusion delta. A fallback changes only the initial configuration; it never changes the issued
  target's immutable `covered_price_vnd`.
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

Do not round surplus separately per voucher or per item. Award timing and the single aggregate log
belong to [lifecycle — Points System](lifecycle.md#points-system); persisted snapshot derivation and
legacy-field constraints belong to [SCHEMA — points_log](../../../../SCHEMA.md#points_log).

---

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

---

## ITEM Voucher Details

- Target 1–100 explicit `extras` menu items; the customer chooses exactly one and the order must match that scope row. The scalar `menu_item_id` remains the compatibility anchor.
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

---

## ADDON Voucher Details

- Store 1–100 explicit fixed-price addon options in package and owned-voucher scope tables; the customer chooses one option and the order must match that scope row. The scalar `addon_option_id` remains the compatibility anchor.
- New issuance, exchange, and package reactivation require the target option and its group to be
  active. Dynamic-gram options are never eligible.
- Cover the current price of one addon unit only. For quantity three, one voucher discounts
  one unit and the customer pays for two units.
- Allow multiple ADDON vouchers on one menu item only when their `addon_option_id` values
  differ. Allow at most one voucher for the same `addon_option_id` on that item.
- When more than one scoped addon already exists on the selected drink, require the customer or
  staff member to choose the target and show each current discount amount. Auto-apply only a single
  remaining target. Validate the outside-BUNDLE quantity before any topping mutation, then attach
  the topping and voucher in the same cart snapshot.
- Never apply an ADDON voucher to Extra Matcha. Extra Matcha keeps its dynamic price based on
  `gram_value × selected_powder.price_per_gram`.

---

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

---

## FREESHIP Voucher Details

- Allow at most one FREESHIP voucher and only for `DELIVERY`.
- Evaluate `min_order_vnd` against `total_vnd`, after PRODUCT, ADDON, and DISCOUNT, before ship.
- Set `freeship_discount_vnd = min(shipping_fee_vnd, covered_delivery_fee_vnd)`.
- Keep `total_vnd` merchandise-only and add shipping only in `grand_total_vnd`.

---

## No-Benefit Rule

Do not consume a voucher whose incremental benefit is zero after earlier vouchers are applied.

- Do not link it to the order.
- Do not move it to `RESERVED` or `REDEEMED`.
- Keep it available for later use.
- Let the UI explain that the voucher was removed because it added no benefit.

Consume a partially applied voucher because it still creates a benefit. Treat a failed
`min_order_vnd` check as an eligibility error, not as a no-benefit case.

---
