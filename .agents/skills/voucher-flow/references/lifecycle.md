# Voucher Lifecycle, Issuance, Refunds, Points, and QR

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

## Package → Voucher (Copy Behavior)

- Copy all business fields from the package when issuing a voucher. Package edits never affect
  already-issued vouchers.
- Copy voucher type, discount data including `max_discount_vnd`, all menu/addon scope rows and snapshots, `covered_price_vnd`,
  `covered_delivery_fee_vnd`, `min_order_vnd`, and expiry data.
- Keep PRODUCT size, powder, milk, and included-addon fields for display/audit only. Do not use
  them as application constraints or let included addons expand PRODUCT monetary coverage.

---

## Voucher Exchange (Points to Voucher)

- Require an active package and sufficient customer points.
- In one transaction, deduct the immutable package point cost, copy the package into an owned
  voucher, append a `voucher_purchase` points log, and resolve its expiry.
- The HTTP path, payload and response contract belong to [API.md](../../../../API.md).

---

## Voucher Refund

- **Eligibility**: an unexpired ACTIVE `POINTS_EXCHANGE` voucher whose live target/configuration is
  no longer usable, including a soft-deleted target item.
- Refund **100% of the immutable `voucher_purchase` cost**. Status → `REFUNDED`.
- Customer may request reconciliation through the refund API, but cannot choose arbitrary eligible
  state or refund value; the server re-resolves live availability and purchase audit.
- `points_log.reason = "voucher_refund"`.

### Completed COUNTER cancellation recovery

Follow [order-flow](../../order-flow/SKILL.md#completed-counter-cancellation) for reversal and
recovery rules. Voucher refund eligibility and immutable purchase-cost semantics above still apply.

---

## Points System

Order earning and completion timing belong to [order-flow](../../order-flow/SKILL.md#points).
Voucher-specific point rules remain:

| Action | Formula / Rule |
|---|---|
| PRODUCT surplus | `floor(sum(order surplus VND) / 10000)` on `COMPLETED` |
| Spend on voucher | Deduct the immutable `package.points_cost` |
| Manual add | ADMIN only, max 100/action, `performed_by` = admin user id |
| Reversal | Append an immutable linked reversal row |

- `points_log` is **immutable** — never UPDATE, only INSERT.
- 1 🐟 = 1,000 VND là đơn vị hiển thị. Ngưỡng doanh thu để nhận một điểm là 10,000 VND;
  đây là earning rate, không phải giá trị quy đổi hiển thị. Xem SCHEMA `Currency & Units`.
- Create one aggregate `voucher_surplus` log for the order, not one log per PRODUCT voucher.

Valid `points_log.reason` values and persistence semantics belong to
[SCHEMA.md](../../../../SCHEMA.md#points_log). Preserve one aggregate `voucher_surplus` row per order.


## QR Scan Flow

- Resolve users before vouchers when scanning a `qr_token`; never expose an internal `id`.
- Only STAFF or ADMIN may be recorded as `redeemed_by`.
- Scanning, target selection, and redemption are distinct steps. Whether a voucher can be redeemed
  directly, needs selection among multiple scopes, or is order-only depends on its voucher type.
  Use [API.md](../../../../API.md) for the current singleton/multi-target scan DTO and mutation
  contract; preserve the ITEM and BUNDLE direct-redemption prohibitions in the relevant checkout and BUNDLE references.
- An allowed direct offline redemption marks the voucher `REDEEMED` with `used_channel = OFFLINE`
  and creates no order.
