---
name: voucher-flow
description: >
  Voucher lifecycle, points system, and QR scan rules for Bạn Cá Bán Matcha.
  Trigger on: voucher, voucher exchange, voucher redeem, voucher refund,
  voucher apply, voucher reserve, points, points balance, points earn,
  points spend, points reverse, PRODUCT voucher, ADDON voucher,
  DISCOUNT voucher, FREESHIP voucher, voucher package, voucher stacking,
  scan QR, qr_token, offline redeem, covered_price_vnd, voucher_surplus,
  lib/vouchers.ts, voucher_packages, or any task involving the voucher
  or points lifecycle.
---

# Voucher Flow Skill

> This skill is the **single source of truth** for voucher types, lifecycle, stacking, points, and QR scan.
> For how vouchers are applied during order creation, also read the `order-flow` skill.
> For how covered_price_vnd is computed, see the `pricing-logic` skill.

---

## File Map

| File | Layer | Purpose |
|---|---|---|
| `lib/vouchers.ts` | SERVER | Voucher validation, application, and redemption (8.2 KB) |
| `src/utils/voucherMatchUtils.ts` | CLIENT | Voucher matching utilities (7.2 KB) |
| `src/lib/utils/voucherModalHelpers.ts` | CLIENT | Modal display helpers (7.4 KB) |
| `app/api/profile/vouchers/route.ts` | SERVER | List customer's ACTIVE vouchers |
| `app/api/profile/vouchers/exchange/route.ts` | SERVER | Spend points → get voucher |
| `app/api/profile/vouchers/refund/route.ts` | SERVER | Auto-refund when item unavailable |
| `app/api/staff/scan/route.ts` | SERVER | QR scan → resolve user or voucher |
| `app/api/staff/vouchers/[id]/redeem/route.ts` | SERVER | Offline voucher redemption |
| `app/api/admin/voucher-packages/route.ts` | SERVER | Package CRUD (13.8 KB) |

---

## 4 Voucher Types

| Type | Level | What It Covers |
|---|---|---|
| `PRODUCT` | Item-level | Exact drink config (item + size + powder + addons). `covered_price_vnd` is fixed. |
| `ADDON` | Addon-level | Specific `addon_option_id`. Does NOT apply to Extra Matcha (dynamic price). |
| `DISCOUNT` | Order-level | Reduces `total_vnd`. `PERCENT` or `FIXED` via `discount_type`. |
| `FREESHIP` | Order-level | Covers delivery fee up to `covered_delivery_fee_vnd`. |

---

## Stacking Rules

One order can carry **ALL 4 types simultaneously**.

**Application order** (strict — never reorder):
```
PRODUCT → ADDON → DISCOUNT → FREESHIP
```

**DISCOUNT sub-rules**:
- Multiple FIXED vouchers allowed per order.
- Max 1 PERCENT voucher per order.
- FIXED applied first, then PERCENT on remaining.
- If `discount_vnd > subtotal` → `total_vnd = 0`, no error.

---

## Voucher Lifecycle

```
                    ┌─ order ADMIN_CONFIRMED ──→ REDEEMED
ACTIVE ─→ RESERVED ─┤
                    └─ order CANCELLED ────────→ ACTIVE (revert)

ACTIVE ─→ REDEEMED + used_channel = OFFLINE     (staff offline scan)
ACTIVE ─→ EXPIRED                                (lazy check at scan/apply — no cron)
ACTIVE ─→ REFUNDED                               (auto: target item soft-deleted)
```

- **RESERVED**: set when customer order is `PENDING` (voucher locked, not yet used).
- **REDEEMED**: set when order transitions to `ADMIN_CONFIRMED`.
- **Revert to ACTIVE**: if order is `CANCELLED` (manual or auto-cancel).
- **Expiry**: lazy check at scan/apply time — no background cron job.

---

## PRODUCT Voucher Details

- Snapshots exact config: `menu_item_id`, `size`, `matcha_powder_id`, `milk_type_id`, `included_addon_option_ids`.
- `covered_price_vnd` is **fixed** at package creation — never recomputed.
- Applied to `order_items`: `unit_price_vnd = 0` when PRODUCT voucher covers.
- **Surplus refund**: if actual drink price < `covered_price_vnd` → refund difference as points: `floor(surplus / 10000)`.
  - `points_log.reason = "voucher_surplus"`.

---

## ADDON Voucher Details

- Targets a specific `addon_option_id`.
- Applied to the **first** item in the order containing that addon.
- Does **NOT** apply to Extra Matcha (dynamic price based on `gram_value × price_per_gram`).

---

## Package → Voucher (Copy Behavior)

- All relevant fields **copied from package** at voucher creation time.
- Package edits **never affect** already-issued vouchers.
- Copied fields: `voucher_type`, `discount_type`, `discount_value`, `menu_item_id`, `size`, `matcha_powder_id`, `milk_type_id`, `included_addon_option_ids`, `addon_option_id`, `covered_price_vnd`, `covered_delivery_fee_vnd`.

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
| Earn on order | `floor(total_vnd / 10000)` on `COMPLETED` |
| Spend on voucher | Deduct `package.points_cost` |
| Manual add | ADMIN only, max 100/action, `performed_by` = admin user id |
| Reversal | Insert new negative-delta row, `reason = "reversed_by_admin"`, `reversed_log_id` = original row id |

- `points_log` is **immutable** — never UPDATE, only INSERT.
- 1 🐟 = 1,000 VND. 1 point = 10,000 VND.

### `points_log.reason` Valid Values

| Value | Trigger |
|---|---|
| `order_complete` | Order status → COMPLETED |
| `manual_admin_adjustment` | Admin manually adds/deducts points |
| `voucher_purchase` | Customer spends points to buy a voucher |
| `voucher_surplus` | Actual price < covered_price_vnd → refund difference |
| `voucher_refund` | Target item soft-deleted → full refund |
| `reversed_by_admin` | Admin reverses a manual adjustment |

---

## QR Scan Flow

1. Check `users` by `qr_token` first.
2. If not found, check `vouchers` by `qr_token`.
3. **Never return internal `id`** — always use `qr_token`.
4. `redeemed_by` accepts **STAFF or ADMIN** only.
5. Offline redeem: mark `REDEEMED` + `used_channel = OFFLINE`. No order created.
