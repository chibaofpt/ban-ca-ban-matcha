---
name: order-flow
description: >
  Order creation workflow and business rules for Bạn Cá Bán Matcha.
  Trigger on: tạo order, create order, submit order, order validation,
  order status, order workflow, counter order, pickup order, delivery order,
  auto cancel, auto_cancel_at, store closed, STORE_CLOSED, anonymous order,
  khách vãng lai, points earn, staff order, order_code, lib/orders.ts,
  POST /api/orders, POST /api/staff/orders, order creation, order submit,
  or any task involving the order lifecycle from creation to completion.
---

# Order Flow Skill

> This skill covers the **full order lifecycle**: creation, status transitions, auto-cancel, store hours, and points.
> For pricing logic during order creation, see the `pricing-logic` skill.
> For voucher application during order creation, see the `voucher-flow` skill.

---

## File Map

| File | Layer | Purpose |
|---|---|---|
| `lib/orders.ts` | SERVER | Core order creation business logic (13.7 KB) |
| `lib/cancelOrder.ts` | SERVER | Auto-cancel logic for expired PENDING orders |
| `lib/storeSchedule.ts` | SERVER | `checkStoreOpen()` — store hours validation |
| `lib/vietqr.ts` | SERVER | VietQR payment URL generation |
| `lib/orderCode.ts` | SERVER | Order code generation (e.g. BCBM-A3X7K2) |
| `lib/validations/order.ts` | SERVER | Zod schemas for order request |
| `app/api/orders/route.ts` | SERVER | Customer order route (24.9 KB) |
| `app/api/staff/orders/route.ts` | SERVER | Staff order route (23.7 KB) |
| `app/api/cron/cancel-expired-orders/route.ts` | SERVER | Vercel Cron auto-cancel |
| `src/constants/orderOptions.ts` | CLIENT | Sweetness, ice, coldwhisk constants |

---

## Order Types

| Type | Creator | Initial Status | order_code | auto_cancel_at | Store Check |
|---|---|---|---|---|---|
| `COUNTER` | Staff | `COMPLETED` | NULL | NULL | ❌ Bypass |
| `PICKUP` | Customer | `PENDING` | Generated | +20 min | ✅ Required |
| `DELIVERY` | Customer | `PENDING` | Generated | +20 min | ✅ Required |

---

## Status Workflow

```
Customer orders:  PENDING → ADMIN_CONFIRMED → STAFF_DONE → COMPLETED
                  PENDING → CANCELLED (auto or manual)

Counter orders:   COMPLETED (immediate — no intermediate states)
```

- `PENDING → ADMIN_CONFIRMED`: Admin confirms VietQR payment received.
- `ADMIN_CONFIRMED → STAFF_DONE`: Staff finishes preparing the order.
- `STAFF_DONE → COMPLETED`: Customer receives the order.
- Points earned in **same transaction** as status → `COMPLETED`.

---

## Order Creation Steps (Server)

> Follow this exact order. Never skip or reorder steps.

1. **Parse + Validate**: `req.json()` → Zod validate body
2. **Auth**: `getSession(req)` — customer routes require CUSTOMER role, staff routes require STAFF/ADMIN
3. **Store hours check** (skip for COUNTER):
   - Call `checkStoreOpen()` from `lib/storeSchedule.ts`
   - PICKUP/DELIVERY rejected with `STORE_CLOSED` (HTTP 503) when closed
4. **Inside `prisma.$transaction()`**:
   - a. Re-fetch all item prices from DB (never trust client)
   - b. Validate each item: `size` required, `base_price_vnd IS NOT NULL` for that size
   - c. Resolve powder:
     - Latte → server sets `selected_powder_id` from `menu_item.matcha_powder_id`
     - Fusion → validate `selected_powder_id` is default OR in `fusion_allowed_powder`
   - d. Resolve milk:
     - If `selected_milk_type_id` not sent for Latte → use `milk_type WHERE is_default = true`
   - e. **Compute server prices** — see `pricing-logic` skill for formulas and COALESCE rules
   - f. Compare `client_price_vnd` vs server price per item. Mismatch → abort with `PRICE_CHANGED`
   - g. **Apply vouchers** — see `voucher-flow` skill for stacking rules and reservation flow
   - h. Compute `subtotal_vnd`, `discount_vnd`, `total_vnd` (min 0 — no negative totals)
   - i. Create `order` + `order_items` + `order_item_addons`
   - j. For PICKUP/DELIVERY: generate `order_code`, set `auto_cancel_at` (+20 min)
   - k. For COUNTER: set status = `COMPLETED`, award points immediately
5. **Return**: order with payment QR URL (customer) or completed order (staff)

---

## Points

- Earned when status → `COMPLETED`: `floor(total_vnd / 10000)`, integers only.
- Points log created in **same transaction** as status change.
- Staff COUNTER orders: points awarded at creation (already COMPLETED).
- Anonymous orders: `points_earned = 0`, no `points_log` entry.

---

## Auto-Cancel

- PENDING customer orders have `auto_cancel_at` = `created_at + 20 minutes`.
- Checked **lazily** on read (when fetching order details) AND **actively** via Vercel Cron.
- Cron endpoint: `GET /api/cron/cancel-expired-orders`.
- On cancel: revert voucher status from `RESERVED` → `ACTIVE` (see `voucher-flow` skill).

---

## Anonymous Orders

- `orders.user_id` is nullable — `NULL` = anonymous walk-in, no loyalty tracking.
- `points_earned = 0` — no points awarded, no `points_log` entry.
- Vouchers rejected: if `product_voucher_id`, `addon_voucher_id`, or `discount_voucher_ids` are sent → `VALIDATION_ERROR`.
- Display as **"Khách vãng lai"** in all order list views.
- Staff search customers: `GET /api/staff/users?q=xxx`:
  - All-digits → phone suffix match
  - Has-letters → ILIKE on name
  - Min 2 chars, max 10 results, sorted by `created_at DESC`, CUSTOMER role only.

---

## Order Options (Hardcoded — Not Addon System)

- `sweetness`, `ice_option`, `coldwhisk` are columns on `order_items`, **not** in `addon_groups`.
- These options currently have **no price**. If any ever needs a price, a schema change is required — see `NOTES.md`.
- Defaults: `sweetness = HALF`, `ice_option = NORMAL` (hidden in UI), `coldwhisk = false`.
- Constants defined in `src/constants/orderOptions.ts` — not fetched from API.

---

## Store Hours

- `store_schedule`: dynamic rows — no row for a day = that day is closed. Max 14 rows (7 days × 2 slots).
- `open_time` / `close_time` stored as `"HH:mm"` strings, interpreted in Asia/Ho_Chi_Minh (UTC+7).
- `store_temporary_closure`: at most 1 active row. **Takes precedence** over weekly schedule.
- `GET /api/store-status` — public, no auth. Cached by frontend on app load.
- `checkStoreOpen()` in `lib/storeSchedule.ts` — called in `POST /api/orders` and `POST /api/staff/orders`.
- COUNTER orders **bypass** the store-closed check.
- Schedule edits: `PUT /api/admin/store-schedule` sends full week, server does `deleteMany + createMany` in one transaction.
