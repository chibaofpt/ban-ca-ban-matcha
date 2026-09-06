# Bạn Cá Bán Matcha — Database Semantics

> **Authority:** meaning, invariant, snapshot and compatibility semantics of persisted data.
> **Read when:** changing Prisma schema, migrations or data interpretation.
> **Update when:** an approved schema change alters those semantics.
> **Does not own:** physical fields/indexes (see `prisma/schema.prisma` and migrations), API contract or domain workflow.

> Read this file for any Prisma schema, migration, or DB-level task.
> Read `AGENTS.md` for hard rules and the order/voucher/pricing skills for authoritative
> business behavior. Do not infer business rules from legacy columns alone.

---

## Currency & Units

| Unit | Value | Notes |
|---|---|---|
| 1 🐟 | 1,000 VND | Frontend display unit |
| 1 point | 10,000 VND | Loyalty unit |
| Points formula | `floor(total_vnd / 10000)` | Earned on COMPLETED |
| Manual add cap | 100 points/action | ADMIN only |
| Gram quantities | Prisma `Decimal` | Never use Float for grams |

> All money stored as **integers in VND. Never floats.**
> Grams stored as **Prisma Decimal** — not money, not Float.

## Canonical Order Totals

Apply vouchers in this strict order: `BUNDLE → ITEM/PRODUCT/PRODUCT_DISCOUNT → ADDON → DISCOUNT → FREESHIP`.

`voucher_package_menu_item_scopes` and `voucher_menu_item_scopes` normalize the explicit 1–100
drink targets of PRODUCT_DISCOUNT. Both use `(parent_id, menu_item_id)` composite primary keys;
package/voucher deletion cascades while menu-item deletion is `NO ACTION`. The legacy
`menu_item_id` remains the deterministic compatibility anchor. Issuance copies package scope rows
to immutable voucher scope rows.

```text
subtotal_vnd = gross drinks + gross addons
item_discount_vnd = BUNDLE reductions + ITEM/PRODUCT reductions + ADDON reductions
discountable_subtotal_vnd = max(0, subtotal_vnd - item_discount_vnd)
total_vnd = max(0, discountable_subtotal_vnd - total_voucher_discount_vnd)
grand_total_vnd = max(0, total_vnd + shipping_fee_vnd - freeship_discount_vnd)
```

- Check DISCOUNT `min_order_vnd` on `discountable_subtotal_vnd`.
- Check FREESHIP `min_order_vnd` on `total_vnd`, before shipping.
- Calculate order points from `total_vnd`, excluding shipping.
- Sum PRODUCT surplus VND across the whole order before converting once with
  `floor(order_surplus_vnd / 10000)`.

## Schema Change Gate

- Inspect `prisma/schema.prisma`, committed migrations, relations, and existing snapshots before
  proposing a new table or field.
- Reuse existing columns and relations when the approved behavior can be calculated or persisted
  correctly without schema expansion.
- Do not add aliases, duplicate totals, or convenience fields for values already derivable from
  immutable order/voucher snapshots.
- Require an implementation plan to demonstrate why the existing schema is insufficient before
  adding, renaming, or removing a field. Include data migration and rollback impact when a schema
  change is genuinely required.
- Do not rename existing fields merely to align terminology; document legacy names where needed.

### Approved one-time payment-method backfill (2026-08-09)

- Migration `20260809000000_add_order_payment_method` may update the existing small `orders`
  dataset once: historical `COUNTER` rows become `CASH`; historical `PICKUP`/`DELIVERY` rows become
  `BANK_TRANSFER` before the column is made required.
- This is a release-specific architect-approved exception, not permission for later data rewrites.
- Apply it only through Vercel Preview `prisma migrate deploy`; do not execute it manually during QA.

---

## Enums

| Enum | Values |
|---|---|
| `Role` | `CUSTOMER`, `STAFF`, `ADMIN` |
| `VoucherType` | `ITEM`, `DISCOUNT`, `PRODUCT`, `PRODUCT_DISCOUNT`, `ADDON`, `FREESHIP`, `BUNDLE` |
| `ProductDiscountMode` | `FIXED_AMOUNT`, `PAY_AS_SIZE` |
| `DiscountType` | `PERCENT`, `FIXED` |
| `VoucherStatus` | `ACTIVE`, `RESERVED`, `REDEEMED`, `EXPIRED`, `REFUNDED` |
| `UsedChannel` | `ONLINE`, `OFFLINE` |
| `OrderStatus` | `PENDING`, `ADMIN_CONFIRMED`, `STAFF_DONE`, `COMPLETED`, `CANCELLED` |
| `OrderType` | `COUNTER`, `PICKUP`, `DELIVERY` |
| `PaymentMethod` | `CASH`, `BANK_TRANSFER` |
| `SweetnessLevel` | `NONE`, `QUARTER`, `HALF`, `THREE_QUARTER`, `FULL`, `EXTRA` |
| `Size` | `SMALL`, `MEDIUM`, `LARGE` |
| `PowderType` | `RECOMMEND`, `NEW`, `SEASONAL`, `NONE` |
| `IceOption` | `NORMAL`, `LESS_ICE`, `NO_ICE`, `SEPARATE_ICE` |

---

## Sweetness Mapping

| Display Label | Enum Value | Default |
|---|---|---|
| 0% | `NONE` | |
| 25% | `QUARTER` | |
| 50% | `HALF` | |
| 75% | `THREE_QUARTER` | |
| 100% | `FULL` | ✅ |
| 120% | `EXTRA` | |

## Ice Option Mapping

`NORMAL` is the default — not shown in UI selector.

| Display Label | Enum Value | Default |
|---|---|---|
| (có đá — ẩn) | `NORMAL` | ✅ |
| Ít đá | `LESS_ICE` | |
| Không đá | `NO_ICE` | |
| Đá riêng | `SEPARATE_ICE` | |

---

## Tables

---

### users
- `id` uuid PK
- `name` string
- `phone_number` string UK — normalized to +84 before storage
- `insta_name` string UK nullable — self-declared login alias, normalized without `@` and to lowercase
- `password_hash` string — bcryptjs cost 12. Ghost user = `"GHOST_USER_NO_PASSWORD"`
- `role` Role — default `CUSTOMER`
- `points_balance` int — default 0
- `qr_token` string UK — UUID, encoded in QR, NEVER expose `id`
- `otp_enabled` bool — default false, Phase 5
- `created_at` timestamp
- `updated_at` timestamp

---

### sessions
- `id` uuid PK — stable across refresh; access JWT `sid` references this row
- `user_id` uuid FK → users (cascade delete)
- `refresh_token` string UK — UUID, 7-day expiry
- `previous_refresh_token` string UK nullable — one preceding token, accepted only within 30 seconds
  of `rotating_at`; NULL for legacy or not-yet-rotated rows. Tokens are never public DTO fields.
- `rotating_at` timestamp nullable — last successful in-place rotation; anchors grace and cooldown.
  Rotation conditionally updates an unexpired existing row; logout must not create a replacement.
- `expires_at` timestamp
- `created_at` timestamp

---

### otp_attempts — Phase 5 only
- `id` uuid PK
- `phone_number` string
- `code_hash` string — SHA-256 of 6-digit code
- `expires_at` timestamp — 5 min TTL
- `attempts` int — max 5 before lockout
- `verified` bool — default false
- `created_at` timestamp

---

### matcha_powder
Powder catalogue. Pricing input for all items.

- `id` uuid PK
- `name` string
- `manufacturer` string nullable
- `description` string nullable
- `image_url` string nullable — Supabase Storage public URL
- `price_per_gram` int — VND/g (e.g. 6000 = 6,000 VND/g)
- `type` PowderType — `RECOMMEND` | `NEW` | `SEASONAL` | `NONE`
- `reference_latte_item_id` uuid nullable UK — FK → menu_items, **SET NULL on delete**, UNIQUE. Pricing anchor for `Premium_Latte`. If NULL → Premium = 0.
- `fragrance` int nullable — 1–5, display only
- `body` int nullable — 1–5
- `bitterness` int nullable — 1–5
- `umami` int nullable — 1–5
- `color` int nullable — 1–5
- `is_available` bool — default true
- `created_at` timestamp

---

### powder_size_config
Per-powder gram exceptions. Only powders with grams differing from `default_size_config` have rows here (currently Meyumi + Hana = 6 rows total).

- `powder_id` uuid FK → matcha_powder (cascade delete)
- `size` Size — SMALL / MEDIUM / LARGE
- `grams` Decimal
- PK: (`powder_id`, `size`)

---

### default_size_config
System-wide fallback. Always exactly 3 rows (SMALL, MEDIUM, LARGE). Admin-editable.
⚠️ Changes apply immediately to all computed prices across all items.

- `size` Size PK
- `milk_ml` int — seed: SMALL=130, MEDIUM=200, LARGE=300
- `powder_gram` Decimal — seed: SMALL=3.5, MEDIUM=4.5, LARGE=8.0

---

### milk_type
Global Base Liquid catalog for Latte and Fusion. The physical table name is retained for backward compatibility; there is no `kind` column.

- `id` uuid PK
- `name` string — e.g. "Sữa bò", "Sữa Oat"
- `price_per_ml` int — VND/ml (e.g. 40 for sữa bò)
- `is_default` bool — the single global Latte default (normally sữa bò).
- `is_active` bool — default true
- `display_order` int — default 0
- `image_url` string nullable — Supabase Storage public URL for the milk type avatar shown in MilkSelector OptionCard.
- `created_at` timestamp

> Database constraints enforce at most one `is_default = true` row and require that row to remain
> active. Admin API does not allow unsetting the current default without selecting a replacement.
> Each item exposes its default plus active rows from `menu_item_allowed_base_liquid`. The swap UI is hidden when the resulting list has one or zero entries.
> Admin keeps Latte entries milk-only. Fusion entries are configured according to each drink; schema does not infer or enforce a liquid kind.
> Seed: sữa bò, is_default=true, price_per_ml=40

---

### menu_items
⚠️ Soft delete only — `is_available = false`. Check `matcha_powder.reference_latte_item_id` before soft-deleting a Latte item.

- `id` uuid PK
- `name` string
- `description` string nullable
- `category` string — `"latte"`, `"fusion"`, or `"extras"`
- `unit_price_vnd` int nullable — required for `extras`, at least 1,000 and divisible by 1,000;
  always null for drink categories
- `is_seasonal` bool — default false
- `matcha_powder_id` uuid FK nullable UK → matcha_powder — Latte only: the fixed powder. 1 powder can only belong to 1 Latte item.
- `default_powder_id` uuid FK nullable → matcha_powder — Fusion only: default powder
- `default_base_liquid_id` uuid FK nullable → milk_type — Fusion per-item default; Latte resolves the global `is_default = true` row
- `custom_powder_grams` Json nullable — `{"MEDIUM": 4.5, "LARGE": 8.0}`.
  Keys: "SMALL" | "MEDIUM" | "LARGE" only.
- `base_liquid_note` string nullable — Fusion only, display text
- `image_url` string nullable — Supabase Storage public URL
- `is_available` bool — default true
- `sort_order` int — default 0
- `created_at` timestamp
- `updated_at` timestamp — updated on any field change. `GET /api/menu` returns `MAX(updated_at)` across all items as cache key.

---

### menu_item_sizes
Always 3 rows per item (SMALL, MEDIUM, LARGE), in same transaction as parent. NULL = size not sold.

- `id` uuid PK
- `menu_item_id` uuid FK → menu_items (cascade delete)
- `size` Size
- `base_price_vnd` int nullable — NULL = not sold, hidden from UI. Not the final price — final price computed by `lib/pricing.ts`.
- `base_liquid_ml` int nullable — per-item/per-size override; NULL falls back to `default_size_config.milk_ml`.
- Composite unique: (`menu_item_id`, `size`)

---

### fusion_allowed_powder
Which powders can be swapped on a Fusion item. Empty = only default powder, swap UI hidden.
The `default_powder_id` of the item is always implicitly allowed — no row needed here for it.

- `menu_item_id` uuid FK → menu_items (cascade delete)
- `powder_id` uuid FK → matcha_powder (cascade delete)
- PK: (`menu_item_id`, `powder_id`)

> When building `allowed_powder_ids` for API response: filter `powder.is_available = true`.

### menu_item_allowed_base_liquid
Allowed Base Liquid swaps for either category. The item default is implicitly allowed and is not duplicated here.

- `menu_item_id` uuid FK → menu_items (cascade delete)
- `base_liquid_id` uuid FK → milk_type (restrict delete)
- PK: (`menu_item_id`, `base_liquid_id`)
- Reverse index on `base_liquid_id` supports safe deactivation checks and joins.

---

### addon_groups
**Global** — all active groups apply to all items. No junction table.
Soft delete only — set `is_active = false`, never hard delete.

- `id` uuid PK
- `name` string — e.g. "Kem", "Đá dừa", "Extra Matcha"
- `description` string nullable
- `image_url` string nullable — Supabase Storage public URL
- `max_select` int — default 1. Maximum distinct options allowed.
- `is_dynamic_gram` bool — default false. If true, options use `gram_value` and price is computed from powder.
- `is_active` bool — default true. `false` = hidden from all items globally.
- `sort_order` int — non-negative dense display rank; ties fall back to `id`.
- `created_at` timestamp

> Active groups attached to every item in `GET /api/menu` — no junction join.
> DELETE = set `is_active = false`. Never cascade-delete `addon_options`.
> Every group is opt-in: an empty selection means "no addon". `max_select` specifies the maximum
> number of options a user can select from this group.
> A dynamic-gram group must have `max_select = 1`.
> Public and admin reads use `(sort_order ASC, id ASC)`. Index `idx_addon_groups_sort_order_id`
> supports this catalogue order. The migration backfills legacy groups by
> `(created_at DESC, id ASC)` into dense zero-based ranks.

---

### addon_options
- `id` uuid PK
- `addon_group_id` uuid FK → addon_groups (cascade delete)
- `label` string — e.g. "½ viên", "+2g"
- `image_url` string nullable — Supabase Storage public URL for this option; customer UI falls back to `addon_groups.image_url` when null.
- `price_vnd` int — 0 if no charge. Extra matcha: always 0 here — actual price computed from `gram_value × selected_powder.price_per_gram` at order time.
- `gram_value` Decimal nullable — Extra matcha only: positive gram amount (1.0–4.0 in the current seed). Null for all fixed-price addon types.
- `is_active` bool — default true. Referenced options are retired by setting false, never hard deleted.
- `sort_order` int — non-negative dense rank within its group; ties fall back to `id`.

> Extra Matcha active seed options: +1g, +2g, +3g, +4g. The legacy 0g option is inactive;
> absence represents no extra matcha.
> Index `idx_addon_options_group_sort_order_id` supports stable nested reads. The sort-order
> migration normalizes every group's active and inactive options by legacy `(sort_order, id)`.
> Server uses `gram_value` to compute: `unit_price_vnd = gram_value × selected_powder.price_per_gram`.
> A dynamic-gram group must be `SELECTOR`; every active option must have positive `gram_value` and
> `price_vnd = 0`. Dynamic and fixed-price active options cannot be mixed in one group.
> Phase 1 retains physical `is_default` only for rollout safety; it is always false, absent from
> API contracts, and scheduled for removal in Phase 2.

---

### orders
- `id` uuid PK
- `user_id` uuid FK nullable → users — NULL for anonymous counter orders
- `handled_by` uuid FK nullable → users — Staff who created or accepted this order. NULL if created by customer and not yet accepted.
- `status` OrderStatus — customer default `PENDING`; staff CASH = `COMPLETED`, staff BANK_TRANSFER = `PENDING`
- `order_type` OrderType — customer default `DELIVERY`; staff auto `COUNTER`
- `payment_method` PaymentMethod — `CASH` or `BANK_TRANSFER`; existing staff clients default to `CASH`
- `order_code` string UK nullable — e.g. "BCBM-A3X7K2". Present for every pending bank transfer, including COUNTER.
- `subtotal_vnd` int — gross drinks + addons before all vouchers, excluding shipping
- `total_voucher_discount_vnd` int — order-level DISCOUNT reduction only
- `total_vnd` int — merchandise after PRODUCT, ADDON, and DISCOUNT; excludes shipping
- `shipping_fee_vnd` int — 0 for non-DELIVERY
- `freeship_discount_vnd` int — FREESHIP reduction, capped at shipping fee
- `grand_total_vnd` int — `total_vnd + shipping_fee_vnd - freeship_discount_vnd`
- `freeship_voucher_id` uuid FK nullable → vouchers
- `points_earned` int nullable — `floor(total_vnd / 10000)`, set when status → COMPLETED
- `pickup_time` timestamp nullable — customer orders only
- `auto_cancel_at` timestamp nullable — pending bank-transfer orders only (+20 mins from creation)
- `payment_confirmed_at` timestamp nullable
- `payment_confirmed_by` uuid FK nullable → users
- `address_id` uuid FK nullable → addresses
- `delivery_address` string nullable
- `delivery_lat` float nullable
- `delivery_lng` float nullable
- `delivery_distance_km` float nullable
- `delivery_receiver_name` string nullable
- `delivery_receiver_phone` string nullable
- `note` string nullable
- `created_at` timestamp
- `updated_at` timestamp

> Use `grand_total_vnd` for VietQR and final DELIVERY payment displays. Use `total_vnd`
> for loyalty points so shipping never earns points.

---

### order_items
- `id` uuid PK
- `order_id` uuid FK → orders (cascade delete)
- `menu_item_id` uuid FK → menu_items
- `quantity` int
- `size` Size nullable — required for drinks; null for `extras`.
- `unit_price_vnd` int — original server-computed drink price before voucher credit
- `addons_price_vnd` int — original addon total before voucher discounts
- `product_voucher_discount_vnd` int — PRODUCT reduction limited to drink price
- `total_discount_vnd` int — PRODUCT + ADDON reductions for this item
- `selected_powder_id` uuid FK nullable → matcha_powder — snapshot at order time (both latte and fusion)
- `selected_milk_type_id` uuid FK nullable → milk_type — physical Base Liquid snapshot for Latte and configured Fusion
- `base_liquid_ml` int nullable — immutable effective ml snapshot at order creation; null only on legacy orders created before this field
- `ice_option` IceOption — default `NORMAL`
- `coldwhisk` bool — default false
- `sweetness` SweetnessLevel — default `FULL`
- `product_voucher_id` uuid FK nullable → vouchers
- `item_voucher_id` uuid FK nullable unique → vouchers — one ITEM voucher per extras order line
- `note` string nullable

> One PRODUCT voucher applies to one drink unit. Split a voucher-bearing unit into its own
> line when the original cart line quantity is greater than one.
>
> Consumption reports must prefer `order_items.base_liquid_ml`. For legacy null rows only, fall
> back to the current item-size override and then `default_size_config.milk_ml`; that fallback is
> an estimate and cannot reconstruct a recipe that changed before snapshots existed.

---

### order_discount_vouchers
Junction table mapping an order to one or more DISCOUNT vouchers.

- `order_id` uuid FK → orders (cascade delete)
- `voucher_id` uuid FK → vouchers (no action delete)
- PK: (`order_id`, `voucher_id`)

---

### order_item_addons
Each selected option appears at most once with `quantity = 1`; an addon group accepts at most
`addon_groups.max_select` distinct options. Dynamic-gram groups are single-select.
Extra matcha: `unit_price_vnd` = `gram_value × selected_powder.price_per_gram` (snapshot at order time).

- `id` uuid PK
- `order_item_id` uuid FK → order_items (cascade delete)
- `addon_option_id` uuid FK → addon_options
- `quantity` int
- `unit_price_vnd` int — snapshot at order time

---

### order_item_addon_vouchers
Junction table mapping multiple ADDON vouchers to an order item.

- `order_item_id` uuid FK → order_items (cascade delete)
- `voucher_id` uuid FK → vouchers (no action delete)
- `addon_option_id` uuid FK → addon_options
- `discount_applied_vnd` int — reduction for one addon unit
- PK: (`order_item_id`, `voucher_id`)

> Allow multiple rows for one order item only when their `addon_option_id` values differ.
> Never create a row for Extra Matcha.

---

### voucher_packages
⚠️ Do NOT add cascade delete on `menu_item_id`.

- `id` uuid PK
- `name` string
- `description` string nullable
- `voucher_type` VoucherType
- `acquisition_mode` VoucherAcquisitionMode — `POINTS_EXCHANGE`, `FREE_CLAIM`, or `AUTO_GRANT`
- `points_cost` int
- `discount_type` DiscountType nullable
- `discount_value` int nullable
- `menu_item_id` uuid FK nullable → menu_items — PRODUCT or ITEM target
- `size` Size nullable — PRODUCT type only
- `matcha_powder_id` uuid FK nullable → matcha_powder — PRODUCT type only
- `milk_type_id` uuid FK nullable → milk_type — PRODUCT type only
- `included_addon_option_ids` string[] — array of uuid (or jsonb) for PRODUCT type only
- `addon_option_id` uuid FK nullable → addon_options — ADDON type only
- `covered_price_vnd` int nullable — snapshot price for PRODUCT and ADDON; ITEM uses current price
- `covered_delivery_fee_vnd` int nullable — snapshot max delivery fee for FREESHIP
- `min_order_vnd` int nullable — minimum for DISCOUNT or FREESHIP
- `max_discount_vnd` int nullable — maximum cap for DISCOUNT PERCENT; NULL = no limit
- `is_active` bool — default true
- `expires_after_days` int nullable
- `quantity` int nullable — maximum total vouchers issued; NULL = unlimited
- `max_per_user` int — maximum issued per customer, default 1
- `created_at` timestamp

> PRODUCT package fields such as size, powder, milk, and included addons remain snapshots for
> package display and issuance. At order application time, PRODUCT eligibility matches
> `menu_item_id` only and its credit applies to drink components only. Compute
> `covered_price_vnd` from the selected drink configuration without addon prices.
>
> ITEM packages target `extras` only. Their drink-configuration and covered-price fields are null.
> Applying one makes one matching unit free at the current server price, with no surplus.

---

### vouchers
- `id` uuid PK
- `user_id` uuid FK → users
- `package_id` uuid FK → voucher_packages
- `qr_token` string UK — UUID, NEVER expose `id`
- `voucher_type` VoucherType — copied from package
- `issued_via` VoucherIssuedVia — immutable issuance audit (`POINTS_EXCHANGE`, `FREE_CLAIM`, `AUTO_GRANT`, `ADMIN`)
- `discount_type` DiscountType nullable — copied from package
- `discount_value` int nullable — copied from package
- `max_discount_vnd` int nullable — copied from package
- `menu_item_id` uuid FK nullable → menu_items — copied from package
- `size` Size nullable — copied from package
- `matcha_powder_id` uuid FK nullable → matcha_powder — copied from package
- `milk_type_id` uuid FK nullable → milk_type — copied from package
- `included_addon_option_ids` string[] — copied from package
- `addon_option_id` uuid FK nullable → addon_options — copied from package
- `covered_price_vnd` int nullable — copied from package
- `covered_delivery_fee_vnd` int nullable — copied from package
- `min_order_vnd` int nullable — copied from package
- `status` VoucherStatus — default `ACTIVE`
- `used_channel` UsedChannel nullable
- `expires_at` timestamp nullable
- `redeemed_at` timestamp nullable
- `redeemed_by` uuid FK nullable → users — STAFF or ADMIN only
- `created_at` timestamp

> `expires_at` is authoritative for eligibility at the server's order acceptance time.
> A voucher valid then may be committed after expiry, including a transaction retry. Lazy expiry
> moves only expired `ACTIVE` vouchers to `EXPIRED`; never lazy-expire `RESERVED` vouchers.
> Cancelling an expired reservation restores it to `EXPIRED`, not `ACTIVE`.
>
> Admin package statistics and owner lookup use composite indexes
> `idx_vouchers_package_status (package_id, status)` and
> `idx_vouchers_package_user (package_id, user_id)`. These indexes add no counters or lifecycle
> state; effective expiry remains derived from `status` plus `expires_at`.
> Cursor wallet reads use `idx_vouchers_user_created_cursor (user_id, created_at DESC, id DESC)`.

---

### points_log
Immutable. Reversing awarded points inserts a new negative-delta row; refunding a voucher purchase
inserts a positive-delta row. Neither operation edits or deletes the original audit row.

- `id` uuid PK
- `user_id` uuid FK → users (cascade delete)
- `delta` int
- `reason` string — see valid values below
- `performed_by` uuid FK nullable → users
- `reversed_log_id` uuid FK nullable → points_log
- `order_id` uuid FK nullable → orders
- `voucher_id` uuid FK nullable → vouchers
- `created_at` timestamp

Cursor history reads use `idx_points_log_user_created_cursor (user_id, created_at DESC, id DESC)`.

Completed COUNTER cancellation derives the outstanding award from positive `order_complete` and
`voucher_surplus` logs minus trustworthy linked reversals for the same user, order and reason.
Recovery refunds use the original negative `voucher_purchase` audit, not the current package cost;
missing or inconsistent audit must not silently reduce the amount to reverse. Physical fields and
relations are reused; no debt or derived balance column is added.

`push_subscriptions` fan-out uses partial index `idx_push_subscriptions_active_cursor (id) WHERE
is_active = true`. The shared trigger function `public.update_updated_at()` pins
`search_path = pg_catalog`; PUBLIC, anon, and authenticated have no execute privilege.

> For aggregate PRODUCT surplus, create one `voucher_surplus` log associated with the order.
> Do not create separately rounded surplus logs per PRODUCT voucher.
> Calculate the amount from existing `order_items.unit_price_vnd`, `product_voucher_id`, and
> linked `vouchers.covered_price_vnd`; do not add another surplus snapshot by default.

**`reason` valid values:**

| Value | Trigger |
|---|---|
| `order_complete` | Order status → COMPLETED |
| `manual_admin_adjustment` | Admin manually adds/deducts points |
| `voucher_purchase` | Customer spends points to buy a voucher package |
| `voucher_surplus` | Aggregate PRODUCT surplus awarded when order → COMPLETED |
| `order_complete_reversed` | Reversal of an `order_complete` entry when a completed COUNTER order is cancelled |
| `voucher_surplus_reversed` | Reversal of a `voucher_surplus` entry when a completed COUNTER order is cancelled |
| `voucher_refund` | Full purchase-cost refund for an eligible voucher, including soft-delete reconciliation or completed COUNTER cancellation recovery |
| `reversed_by_admin` | Admin reverses a manual adjustment |

---

### Removed legacy Promotion tables

Migration `20260812000000_merge_promotions_into_vouchers` drops the unused Promotion tables
without backfill. They were never populated or consumed in this deployment; do not reference or
recreate them.

---

## Migration Notes (Phase 1 → Phase 2)

| Action | Detail |
|---|---|
| Rename `menu_item_sizes.price_vnd` → `base_price_vnd` | Make nullable (Int?) |
| `menu_items.category` values | `daily` → `latte`, `recipe` → `fusion`, `seasonal` → assign manually + `is_seasonal = true` |
| Add `menu_items.updated_at` | New timestamp column |
| Remove `menu_items.extra_default_matcha` | Column deleted |
| Drop `menu_item_addons` table | No longer exists |
| Remove old addon groups | Delete rows for: Độ ngọt, Đá, Coldwhisk, Loại sữa |
| Add `is_active` to `addon_groups` | New column, default true |
| Add `gram_value` to `addon_options` | Decimal nullable — set for extra matcha options only |
| Seed new tables | `default_size_config` (3 rows), `matcha_powder` (7 rows), `powder_size_config` (6 rows), `milk_type` (sữa bò) |
| Seed addon groups | kem, đá dừa, extra matcha — all opt-in and `is_active = true` |
| Seed extra matcha options | +1g, +2g, +3g, +4g active; legacy 0g inactive |
| Set `reference_latte_item_id` | After Latte items created — manual step |

> ⚠️ Migrating `seasonal` items to `latte`/`fusion` requires manual review — cannot be automated.

---

### store_schedule
Weekly opening hours. **Dynamic rows** — absence of rows for a day means that day is closed.
Max 14 rows (7 days × 2 slots), min 0 rows. Admin manages via `PUT /api/admin/store-schedule`.

- `id` uuid PK
- `day_of_week` int — 0 = Sunday, 1 = Monday, ..., 6 = Saturday
- `slot` int — 1 = morning slot, 2 = afternoon/evening slot
- `open_time` string — `"HH:mm"` format, Asia/Ho_Chi_Minh (UTC+7). Required — row existence implies open.
- `close_time` string — `"HH:mm"` format. Required.
- Composite unique: (`day_of_week`, `slot`)

> No row for day X = that day is closed (no `is_closed` column needed).
> `open_time` / `close_time` are NOT nullable — a row always has valid times.
> Admin sends full weekly schedule; server does `deleteMany + createMany` in one transaction.
> Seed: 7 rows (all days, slot=1, 06:00–22:00). Admin customizes via modal.

---

### store_temporary_closure
Tracks admin-initiated temporary closures. At most 1 active row at any time.

- `id` uuid PK
- `is_active` bool — default true. `false` = store has been reopened.
- `note` string nullable — Optional message displayed to customers on homepage.
- `closed_at` timestamp — when admin closed the store (default `now()`)
- `opened_at` timestamp nullable — set when admin reopens. `null` = still closed.

> Query: `WHERE is_active = true` — 0 or 1 row at most.
> Close: INSERT new row `is_active = true`. Open: UPDATE `is_active = false, opened_at = now()`.
> Temporary closure takes precedence over weekly schedule.

---

## Current BUNDLE voucher architecture

`voucher_bundle_rules` is a one-to-one immutable child of `voucher_packages`. It stores buy/reward
quantity, reward kind/mode, scaling, and per-order caps. Campaign issuance quantity belongs only
to `voucher_packages.quantity`; the BUNDLE rule has no duplicate global redemption cap.
`voucher_bundle_product_scopes` stores one immutable default powder/Base Liquid snapshot per
`(package, role, menu item)`. `voucher_bundle_product_scope_sizes` stores that product's allowed
sizes. There is no stored reference credit: checkout resolves the snapshot with current canonical
pricing. `voucher_bundle_addon_rewards` stores multiple allowed addon options.

`voucher_grants` uses unique `(package_id, user_id)` for idempotent FREE_CLAIM and AUTO_GRANT.
`order_bundle_applications` is one-to-many from an order and unique by voucher; an order may apply
multiple distinct BUNDLE voucher instances. `order_bundle_qualifier_allocations` persists the
client-selected qualifier unit pools. `order_bundle_rewards` stores each explicit reward allocation
and VND benefit. Product unit quantities cannot overlap across applications; one source line may be
split only while its total allocated quantity remains within the line quantity.

There is no start date and no current Promotion table. An active package is effective immediately;
`voucher_packages.ends_at` is an exclusive instant and optionally stops new issuance. Admin date
input is stored as 00:00 on the following day in Asia/Ho_Chi_Minh. `min_order_vnd` applies to BUNDLE,
DISCOUNT, and FREESHIP. Issued vouchers follow their own `vouchers.expires_at` lifecycle.

### Future group-order compatibility (design only)

Do not add these tables until group ordering is implemented. The intended extension is:

- `group_orders`: host user, share token, lifecycle, checkout order ID, timestamps.
- `group_order_members`: group order, optional authenticated user, guest name, join token.
- `group_order_items`: draft line ownership by member; finalized lines map to `order_items`.
- Member PRODUCT/ADDON vouchers attach only to that member's lines.
- Host BUNDLE/DISCOUNT/FREESHIP vouchers attach to the whole finalized order. BUNDLE qualifier
  counts exclude line units already using a member PRODUCT voucher.
- The resolver receives the selected voucher's explicit owner ID. Guest members cannot use a
  personal voucher because they have no authenticated voucher owner.
- The host pays and receives order points. Guests can join without an account and cannot own a
  personal voucher. Preserve member ownership when copying draft lines into immutable order rows.

