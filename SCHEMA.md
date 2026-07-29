# Bạn Cá Bán Matcha — Database Schema

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

Apply vouchers in this strict order: `PRODUCT → ADDON → DISCOUNT → FREESHIP`.

```text
subtotal_vnd = gross drinks + gross addons
item_discount_vnd = PRODUCT reductions + ADDON reductions
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

---

## Enums

| Enum | Values |
|---|---|
| `Role` | `CUSTOMER`, `STAFF`, `ADMIN` |
| `VoucherType` | `DISCOUNT`, `PRODUCT`, `ADDON`, `FREESHIP` |
| `DiscountType` | `PERCENT`, `FIXED` |
| `VoucherStatus` | `ACTIVE`, `RESERVED`, `REDEEMED`, `EXPIRED`, `REFUNDED` |
| `UsedChannel` | `ONLINE`, `OFFLINE` |
| `OrderStatus` | `PENDING`, `ADMIN_CONFIRMED`, `STAFF_DONE`, `COMPLETED`, `CANCELLED` |
| `OrderType` | `COUNTER`, `PICKUP`, `DELIVERY` |
| `AddonType` | `SELECTOR`, `TOGGLE`, `QUANTITY` |
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
- `id` uuid PK
- `user_id` uuid FK → users (cascade delete)
- `refresh_token` string UK — UUID, 7-day expiry
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
Global milk options. Applies to all Latte items automatically — no junction table.

- `id` uuid PK
- `name` string — e.g. "Sữa bò", "Sữa Oat"
- `price_per_ml` int — VND/ml (e.g. 40 for sữa bò)
- `is_default` bool — sữa bò = true. Hidden in UI selector, always used as base for `computed_price_vnd`.
- `is_active` bool — default true
- `display_order` int — default 0
- `created_at` timestamp

> Latte items use all `milk_type WHERE is_active = true` — determined by `category` at query time.
> `computed_price_vnd` is always calculated using the default milk (sữa bò). Frontend recalculates on milk swap.
> Seed: sữa bò, is_default=true, price_per_ml=40

---

### menu_items
⚠️ Soft delete only — `is_available = false`. Check `matcha_powder.reference_latte_item_id` before soft-deleting a Latte item.

- `id` uuid PK
- `name` string
- `description` string nullable
- `category` string — `"latte"` or `"fusion"` only
- `is_seasonal` bool — default false
- `matcha_powder_id` uuid FK nullable UK → matcha_powder — Latte only: the fixed powder. 1 powder can only belong to 1 Latte item.
- `default_powder_id` uuid FK nullable → matcha_powder — Fusion only: default powder
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
- Composite unique: (`menu_item_id`, `size`)

---

### fusion_allowed_powder
Which powders can be swapped on a Fusion item. Empty = only default powder, swap UI hidden.
The `default_powder_id` of the item is always implicitly allowed — no row needed here for it.

- `menu_item_id` uuid FK → menu_items (cascade delete)
- `powder_id` uuid FK → matcha_powder (cascade delete)
- PK: (`menu_item_id`, `powder_id`)

> When building `allowed_powder_ids` for API response: filter `powder.is_available = true`.

---

### addon_groups
**Global** — all active groups apply to all items. No junction table.
Soft delete only — set `is_active = false`, never hard delete.

- `id` uuid PK
- `name` string — e.g. "Kem", "Đá dừa", "Extra Matcha"
- `description` string nullable
- `type` AddonType — `SELECTOR` | `TOGGLE` | `QUANTITY`
- `is_required` bool — seed: `true` for all 3 active groups (kem, đá dừa, extra matcha)
- `is_active` bool — default true. `false` = hidden from all items globally.
- `min_quantity` int nullable — QUANTITY type only
- `max_quantity` int nullable — QUANTITY type only
- `created_at` timestamp

> Active groups attached to every item in `GET /api/menu` — no junction join.
> DELETE = set `is_active = false`. Never cascade-delete `addon_options`.

---

### addon_options
- `id` uuid PK
- `addon_group_id` uuid FK → addon_groups (cascade delete)
- `label` string — e.g. "½ viên", "+2g"
- `price_vnd` int — 0 if no charge. Extra matcha: always 0 here — actual price computed from `gram_value × selected_powder.price_per_gram` at order time.
- `gram_value` Decimal nullable — Extra matcha only: gram amount of this option (e.g. 0, 1.0, 2.0, 3.0, 4.0). Null for all other addon types.
- `is_default` bool
- `sort_order` int

> Extra matcha seed options: 0g (default, gram_value=0), +1g, +2g, +3g, +4g.
> Server uses `gram_value` to compute: `unit_price_vnd = gram_value × selected_powder.price_per_gram`.

---

### orders
- `id` uuid PK
- `user_id` uuid FK nullable → users — NULL for anonymous counter orders
- `handled_by` uuid FK nullable → users — Staff who created or accepted this order. NULL if created by customer and not yet accepted.
- `status` OrderStatus — customer default `PENDING`; staff = `COMPLETED` immediately
- `order_type` OrderType — customer default `DELIVERY`; staff auto `COUNTER`
- `order_code` string UK nullable — e.g. "BCBM-A3X7K2". Null for COUNTER orders.
- `subtotal_vnd` int — gross drinks + addons before all vouchers, excluding shipping
- `total_voucher_discount_vnd` int — order-level DISCOUNT reduction only
- `total_vnd` int — merchandise after PRODUCT, ADDON, and DISCOUNT; excludes shipping
- `shipping_fee_vnd` int — 0 for non-DELIVERY
- `freeship_discount_vnd` int — FREESHIP reduction, capped at shipping fee
- `grand_total_vnd` int — `total_vnd + shipping_fee_vnd - freeship_discount_vnd`
- `freeship_voucher_id` uuid FK nullable → vouchers
- `points_earned` int nullable — `floor(total_vnd / 10000)`, set when status → COMPLETED
- `pickup_time` timestamp nullable — customer orders only
- `auto_cancel_at` timestamp nullable — customer orders only (+20 mins from creation)
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
- `size` Size — required. Server validates `base_price_vnd IS NOT NULL` for this size.
- `unit_price_vnd` int — original server-computed drink price before voucher credit
- `addons_price_vnd` int — original addon total before voucher discounts
- `product_voucher_discount_vnd` int — PRODUCT reduction limited to drink price
- `total_discount_vnd` int — PRODUCT + ADDON reductions for this item
- `selected_powder_id` uuid FK nullable → matcha_powder — snapshot at order time (both latte and fusion)
- `selected_milk_type_id` uuid FK nullable → milk_type — Latte only
- `ice_option` IceOption — default `NORMAL`
- `coldwhisk` bool — default false
- `sweetness` SweetnessLevel — default `FULL`
- `product_voucher_id` uuid FK nullable → vouchers
- `note` string nullable

> One PRODUCT voucher applies to one drink unit. Split a voucher-bearing unit into its own
> line when the original cart line quantity is greater than one.

---

### order_discount_vouchers
Junction table mapping an order to one or more DISCOUNT vouchers.

- `order_id` uuid FK → orders (cascade delete)
- `voucher_id` uuid FK → vouchers (no action delete)
- PK: (`order_id`, `voucher_id`)

---

### order_item_addons
SELECTOR / TOGGLE: quantity = 1. QUANTITY: quantity = units chosen.
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
- `points_cost` int
- `discount_type` DiscountType nullable
- `discount_value` int nullable
- `menu_item_id` uuid FK nullable → menu_items — PRODUCT type only
- `size` Size nullable — PRODUCT type only
- `matcha_powder_id` uuid FK nullable → matcha_powder — PRODUCT type only
- `milk_type_id` uuid FK nullable → milk_type — PRODUCT type only
- `included_addon_option_ids` string[] — array of uuid (or jsonb) for PRODUCT type only
- `addon_option_id` uuid FK nullable → addon_options — ADDON type only
- `covered_price_vnd` int nullable — snapshot price for PRODUCT and ADDON
- `covered_delivery_fee_vnd` int nullable — snapshot max delivery fee for FREESHIP
- `min_order_vnd` int nullable — minimum for DISCOUNT or FREESHIP
- `is_active` bool — default true
- `expires_after_days` int nullable
- `quantity` int nullable — maximum total vouchers issued; NULL = unlimited
- `max_per_user` int — maximum issued per customer, default 1
- `created_at` timestamp

> PRODUCT package fields such as size, powder, milk, and included addons remain snapshots for
> package display and issuance. At order application time, PRODUCT eligibility matches
> `menu_item_id` only and its credit applies to drink components only. Compute
> `covered_price_vnd` from the selected drink configuration without addon prices.

---

### vouchers
- `id` uuid PK
- `user_id` uuid FK → users
- `package_id` uuid FK → voucher_packages
- `qr_token` string UK — UUID, NEVER expose `id`
- `voucher_type` VoucherType — copied from package
- `discount_type` DiscountType nullable — copied from package
- `discount_value` int nullable — copied from package
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

> `expires_at` is authoritative for eligibility. Lazy expiry moves only expired `ACTIVE`
> vouchers to `EXPIRED`; never lazy-expire `RESERVED` vouchers. Cancelling an expired
> reservation restores it to `EXPIRED`, not `ACTIVE`.

---

### points_log
Immutable. Reversal = insert new negative-delta row.

- `id` uuid PK
- `user_id` uuid FK → users (cascade delete)
- `delta` int
- `reason` string — see valid values below
- `performed_by` uuid FK nullable → users
- `reversed_log_id` uuid FK nullable → points_log
- `order_id` uuid FK nullable → orders
- `voucher_id` uuid FK nullable → vouchers
- `created_at` timestamp

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
| `voucher_refund` | Customer gets full points back because item was soft-deleted |
| `reversed_by_admin` | Admin reverses a manual adjustment |

---

### promotions — Phase 5 only
- `id` uuid PK
- `title` string
- `description` string nullable
- `starts_at` timestamp
- `ends_at` timestamp
- `max_redemptions` int
- `is_active` bool
- `created_at` timestamp

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
| Seed addon groups | kem, đá dừa, extra matcha — all `is_required = true`, `is_active = true` |
| Seed extra matcha options | 0g (default), +1g, +2g, +3g, +4g with correct `gram_value` |
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

