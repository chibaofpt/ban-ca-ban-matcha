---
name: voucher-flow
description: Define voucher eligibility, stacking, application order, lifecycle, surplus, points, packages, and QR business rules.
---

# Voucher Flow Skill

Treat this file and its references as the business source of truth for vouchers and voucher-related points.
Load `order-flow` only for order status or order-point transitions; load `pricing-logic` only when
resolving price components or rounding.

---

Follow the discovery and resource-routing rules in [AGENTS.md](../../../AGENTS.md).

## Voucher Types

| Type | Level | What It Covers |
|---|---|---|
| `ITEM` | Item-level | One fixed-price `extras` unit selected from an explicit 1–100 target scope at its current server price; no surplus. |
| `PRODUCT` | Item-level | One drink unit selected from an explicit 1–100 target scope; each target owns an immutable configured credit and covers drink components only. |
| `PRODUCT_DISCOUNT` | Item-level, selected from main cart | Discounts one configured drink/size using `FIXED_AMOUNT` or `PAY_AS_SIZE`; excludes addons. |
| `ADDON` | Addon-level | One unit selected from an explicit 1–100 fixed-price addon scope; never Extra Matcha. |
| `DISCOUNT` | Order-level | Reduces `total_vnd`. `PERCENT` or `FIXED` via `discount_type`. |
| `FREESHIP` | Order-level | Covers delivery fee up to `covered_delivery_fee_vnd`. |
| `BUNDLE` | Cross-item | Applies one immutable qualifier/reward rule through explicit unit allocations; detailed qualification and overlap rules are conditional. |

---

## Canonical Application Order and Totals

An order may combine eligible item-level, addon-level, order-level, and shipping vouchers simultaneously. Always use one shared server
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
- `item_discount_vnd`: total BUNDLE, ITEM, PRODUCT, PRODUCT_DISCOUNT, and ADDON reductions.
- `discountable_subtotal_vnd = max(0, subtotal_vnd - item_discount_vnd)`.
- `total_voucher_discount_vnd`: order-level DISCOUNT reduction only.
- `total_vnd = max(0, discountable_subtotal_vnd - total_voucher_discount_vnd)`.
- `grand_total_vnd = max(0, total_vnd + shipping_fee_vnd - freeship_discount_vnd)`.

Use `grand_total_vnd` for VietQR and final payable displays. Use `total_vnd`, not
`grand_total_vnd`, to earn order points.

---
## Conditional References

- For checkout eligibility, PRODUCT, PRODUCT_DISCOUNT, ITEM, ADDON, DISCOUNT, FREESHIP, and
  no-benefit behavior, read [references/checkout.md](references/checkout.md).
- For BUNDLE qualification, allocation, overlap, acquisition, and reward rules, read
  [references/bundles.md](references/bundles.md).
- For reserve/redeem/restore/expiry, issuance copies, exchange/refund, voucher-related points, or QR,
  read [references/lifecycle.md](references/lifecycle.md).
- API paths, payloads, response DTOs and error envelopes belong to [API.md](../../../API.md).
- Database fields and enum semantics belong to [SCHEMA.md](../../../SCHEMA.md).

Keep the business rules in this skill and its references canonical; do not copy them into API or UI
documentation. Read only the conditional reference needed by the task.
