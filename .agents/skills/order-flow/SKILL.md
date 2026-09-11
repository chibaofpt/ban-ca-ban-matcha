---
name: order-flow
description: Define order creation, validation, status transitions, cancellation, store-hours, and points rules for customer and counter orders.
---

# Order Flow Skill

> This skill covers the **full order lifecycle**: creation, status transitions, auto-cancel, store hours, and points.
> For pricing logic during order creation, see the `pricing-logic` skill.
> For voucher application during order creation, see the `voucher-flow` skill.

---

Follow the discovery and resource-routing rules in [AGENTS.md](../../../AGENTS.md).

## Order Types

| Type | Creator | Initial Status | order_code | auto_cancel_at | Store Check |
|---|---|---|---|---|---|
| `COUNTER` + CASH | Staff | `COMPLETED` | NULL | NULL | ❌ Bypass |
| `COUNTER` + BANK_TRANSFER | Staff | `PENDING` | Generated | +20 min | ❌ Bypass |
| `PICKUP` | Customer | `PENDING` | Generated | +20 min | ✅ Required |
| `DELIVERY` | Customer | `PENDING` | Generated | +20 min | ✅ Required |

---

## Status Workflow

```
Customer orders:  PENDING → ADMIN_CONFIRMED → STAFF_DONE → COMPLETED
                  PENDING → CANCELLED (auto or manual)

Counter CASH:     COMPLETED (immediate — no intermediate states)
Counter transfer: PENDING → COMPLETED (creator Staff or any Admin confirms payment)
                  PENDING → CANCELLED (manual or auto-expiry)
```

- `PENDING → ADMIN_CONFIRMED`: Admin confirms VietQR payment received.
- At `ADMIN_CONFIRMED`, redeem all applied online vouchers exactly once.
- `ADMIN_CONFIRMED → STAFF_DONE`: Staff finishes preparing the order.
- `STAFF_DONE → COMPLETED`: Customer receives the order.
- At `COMPLETED`, award order points and aggregate PRODUCT surplus in the same transaction.
- Do not redeem vouchers again at `COMPLETED`.
- Claim an unassigned online order with an expected-status/expected-owner conditional write. After
  Staff A claims it, only Staff A or an Admin may finish it; another Staff cannot replace the owner.
- A COUNTER bank transfer moves directly from `PENDING` to `COMPLETED`. Confirm its BUNDLE voucher
  and order application together as `REDEEMED`, with voucher channel `OFFLINE`.

---

## Order Creation Steps (Server)

> Follow this exact order. Never skip or reorder steps.

Capture one `acceptanceDate` at handler entry, before parsing. Use it for every voucher eligibility
and lazy-expiry decision in all transaction attempts. A voucher with `expires_at > acceptanceDate`
remains valid through processing and retry; `expires_at <= acceptanceDate` is rejected.

1. **Parse + Validate**: `req.json()` → Zod validate body
2. **Auth**: `getSession(req)` — customer routes require CUSTOMER role, staff routes require STAFF/ADMIN
3. **Store hours check** (skip for COUNTER):
   - Call `checkStoreOpen()` from `lib/storeSchedule.ts`
   - PICKUP/DELIVERY rejected with `STORE_CLOSED` (HTTP 503) when closed
4. **Inside the retryable Serializable `prisma.$transaction()` for both customer and staff**:
   - a. Re-fetch all item prices from DB (never trust client)
   - b. Validate each item: drinks require `size` and a non-null `base_price_vnd` for that size;
     `extras` have no size and use their current `unit_price_vnd`.
   - c. Resolve powder:
     - Latte → server sets `selected_powder_id` from `menu_item.matcha_powder_id`
     - Fusion → validate `selected_powder_id` is default OR in `fusion_allowed_powder`
   - d. Resolve Base Liquid:
     - Prefer `selected_base_liquid_id`; accept `selected_milk_type_id` as a compatibility alias only when the values do not conflict.
     - Latte default = global `milk_type.is_default`; Fusion default = `menu_item.default_base_liquid_id`.
     - Validate a selection is active and either the default or in `menu_item_allowed_base_liquid`.
     - A legacy Fusion with no default accepts no Base Liquid selection and keeps the old price behavior.
     - Resolve effective ml as item-size override → system size fallback and carry it into the processed item.
   - e. Resolve addons as opt-in selections:
     - Empty `addon_option_ids` is valid and means no addons.
     - Re-fetch option + group lifecycle; reject inactive groups/options and duplicate option IDs.
     - Each selected option is distinct and has quantity exactly 1.
     - Enforce at most `addon_groups.max_select` options per group.
     - Dynamic-gram groups must keep `max_select = 1`.
   - f. **Compute server prices** — see `pricing-logic` skill for formulas and COALESCE rules
   - g. Compare `client_price_vnd` vs server price per item. Mismatch → abort with `PRICE_CHANGED`
   - h. **Apply vouchers** using the shared calculator — see `voucher-flow`; strict order is
     BUNDLE → ITEM/PRODUCT/PRODUCT_DISCOUNT → ADDON → DISCOUNT → FREESHIP
   - i. Compute gross `subtotal_vnd`, merchandise-only `total_vnd`, shipping,
     `freeship_discount_vnd`, and payable `grand_total_vnd`
   - j. Create `order` + `order_items` + `order_item_addons`; snapshot effective Base Liquid ml in
     `order_items.base_liquid_ml` for both customer and staff entry points.
   - k. For PICKUP/DELIVERY and COUNTER BANK_TRANSFER: generate `order_code`, set
     `auto_cancel_at` (+20 min)
   - l. For COUNTER CASH: set status = `COMPLETED`, redeem applied vouchers and award order plus
     aggregate surplus points immediately in the same transaction
   - m. For COUNTER BANK_TRANSFER: set status = `PENDING`, reserve applied vouchers, and defer
     all points until the direct `COMPLETED` payment-confirmation transition
5. **Return**: customer/pending counter transfer with payment QR URL, or completed cash order

Fulfillment/external preflight and auto-grant issuance remain outside the order transaction. An
auto-granted voucher may therefore persist if checkout later fails; every voucher actually consumed
must still be re-fetched and conditionally claimed inside the order transaction. Clone mutable input
for each retry and keep the original `acceptanceDate`.

## Counter Transfer POS Recovery

For POS/cart recovery behavior, read [the cart feature specification](../../../docs/specs/cart.md).

---

## Points

- Earned when status → `COMPLETED`: `floor(total_vnd / 10000)`, integers only.
- `total_vnd` excludes shipping. Never calculate points from `grand_total_vnd`.
- PRODUCT surplus is summed in VND across the entire order, then converted once with
  `floor(order_surplus_vnd / 10000)` at `COMPLETED`.
- Points log created in **same transaction** as status change.
- Staff COUNTER CASH orders: points awarded at creation (already COMPLETED).
- Staff COUNTER BANK_TRANSFER orders: points awarded only on payment confirmation to COMPLETED.
- Anonymous orders: `points_earned = 0`, no `points_log` entry.

## Completed COUNTER Cancellation

- Only Admin may cancel a completed COUNTER order. Completed PICKUP/DELIVERY orders remain final.
- Reverse the full outstanding `order_complete` plus aggregate `voucher_surplus` award. Count a prior
  negative reversal only when its user, order, reason and parent link match the positive audit row;
  never edit an existing `points_log` row.
- If the current balance is short, recover newest whole vouchers belonging to the same user that are
  `POINTS_EXCHANGE`, `ACTIVE` and unexpired. Refund their exact immutable negative
  `voucher_purchase` cost, not the package's current cost.
- Exclude free/granted, reserved, redeemed, expired, refunded, already-refunded vouchers and vouchers
  restored by the cancelled order. Stop after the balance is sufficient; any excess refund remains.
- Missing trustworthy audit or a remaining shortfall aborts the whole transaction with
  `422 BUSINESS_RULE_VIOLATION` and `details.reason = INSUFFICIENT_REVERSIBLE_POINTS`. Never create
  debt, a partial reversal or a partially cancelled order.
- On success, return `cancellation_adjustment` with `reversed_points`, `revoked_voucher_count` and
  `refunded_points` so Admin can show the committed outcome.

## Shared Order Calculator

- Use the same server calculation function for customer and staff order creation.
- Keep API routes responsible for auth, request validation, DB resolution, transactions, and
  response mapping; keep price/voucher arithmetic out of route handlers.
- Re-fetch price and voucher snapshots from DB before calculation; never trust client totals.
- Return gross subtotal, ITEM/PRODUCT discount, ADDON discount, discountable subtotal, order
  DISCOUNT, merchandise total, shipping, FREESHIP, grand total, aggregate surplus, applied
  voucher identifiers, and ignored no-benefit voucher identifiers.
- Apply an item-level voucher to one unit only. Split a voucher-bearing unit into a separate
  line when an original cart line has quantity greater than one.

---

## Auto-Cancel

- PENDING customer and COUNTER BANK_TRANSFER orders have `auto_cancel_at` = `created_at + 20 minutes`.
- Checked actively by the authenticated Supabase Cron route every 5 minutes. GET order detail/list
  handlers are read-only and never perform cancellation.
- The authenticated cancellation cron contract belongs to [API.md](../../../API.md); Vercel daily cron is backup only.
- Staging may omit the Supabase schedule when explicitly accepted for that staging cycle. Production
  must have the schedule installed and smoke-tested before release.
- On cancel: revert voucher status from `RESERVED` → `ACTIVE` and mark any BUNDLE order
  application `CANCELLED` (see `voucher-flow` skill).

---

## Anonymous Orders

- `orders.user_id` is nullable — `NULL` = anonymous walk-in, no loyalty tracking.
- `points_earned = 0` — no points awarded, no `points_log` entry.
- Vouchers rejected: if `product_voucher_id`, `addon_voucher_ids`, `discount_voucher_ids`,
  `freeship_voucher_id`, or non-empty `bundle_applications` are sent → `VALIDATION_ERROR`.
- Display as **"Khách vãng lai"** in all order list views.
- Staff customer-search behavior:
  - All-digits → phone suffix match
  - Has-letters → ILIKE on name
  - Min 2 chars, max 10 results, sorted by `created_at DESC`, CUSTOMER role only.

---

## Order Options (Hardcoded — Not Addon System)

- `sweetness`, `ice_option`, `coldwhisk` are columns on `order_items`, **not** in `addon_groups`.
- These options currently have **no price**. If any ever needs a price, a schema change is required — see `NOTES.md`.
- Defaults: `sweetness = FULL`, `ice_option = NORMAL` (hidden in UI), `coldwhisk = false`.
- Constants defined in `src/constants/orderOptions.ts` — not fetched from API.

---

## Store Hours

- `store_schedule`: dynamic rows — no row for a day = that day is closed. Max 14 rows (7 days × 2 slots).
- `open_time` / `close_time` stored as `"HH:mm"` strings, interpreted in Asia/Ho_Chi_Minh (UTC+7).
- `store_temporary_closure`: at most 1 active row. **Takes precedence** over weekly schedule.
- Store status is public and cached by the frontend; its endpoint contract belongs to [API.md](../../../API.md).
- Customer and staff order creation share the same store-open check for PICKUP/DELIVERY.
- COUNTER orders **bypass** the store-closed check.
- Schedule edits replace the full week atomically in one transaction; the payload belongs to [API.md](../../../API.md).
