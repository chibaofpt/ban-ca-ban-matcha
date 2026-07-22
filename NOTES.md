# Bạn Cá Bán Matcha — Deferred, Notes & Env Vars

> Read this file when encountering edge cases, unresolved decisions, or setting up env.
> Do not implement anything in this file without explicit architect sign-off.

---

## Confirmed Business Rules Awaiting Code Alignment

The following rules are approved. Treat `order-flow`, `voucher-flow`, and `pricing-logic` as
the target behavior even where current code still differs:

- Apply vouchers in order: PRODUCT → ADDON → DISCOUNT → FREESHIP.
- Limit PRODUCT credit to drink components and match PRODUCT by `menu_item_id` only.
- Cover one addon unit per ADDON voucher; allow multiple only for different addon IDs;
  continue excluding Extra Matcha.
- Check DISCOUNT minimum after item vouchers and FREESHIP minimum after all merchandise vouchers,
  before shipping.
- Ignore and do not consume vouchers that create zero incremental benefit.
- Aggregate PRODUCT surplus VND for the whole order before converting to points.
- Redeem online vouchers at ADMIN_CONFIRMED; award order and surplus points only at COMPLETED.
- Calculate order points from `total_vnd`, excluding shipping.
- Use one shared order/voucher calculator for customer and staff order creation.
- Reuse existing schema fields, relations, API paths, and payload names unless they are proven
  insufficient. Do not add convenience fields or rename APIs as part of the logic refactor.

Do not preserve current behavior merely because it conflicts with these approved rules.

## Unresolved Implementation Policies

> No unresolved policies at this time.

## Resolved Minimal-Change Constraints

- **Voucher expiry status**: Lazy synchronization at read time. Called before list (`GET /api/profile/vouchers`),
  apply (`POST /api/orders`, `POST /api/staff/orders`), and scan (`GET /api/staff/scan`).
  `RESERVED` vouchers are never lazy-expired; if an order is cancelled after expiry the cancel
  logic sets them to `EXPIRED`. No cron job, no Redis required.
- **Aggregate PRODUCT surplus**: At COUNTER order creation and ONLINE order COMPLETED transition,
  compute `Σ max(covered_price_vnd - unit_price_vnd, 0)` across all applied PRODUCT vouchers,
  then `floor(sum / 10000)`. Write one `points_log` row with `reason = 'voucher_surplus'` and
  `voucher_id = null`. Source of truth for "how much surplus was awarded" is `points_log`.
- **DISCOUNT per-voucher amount**: `order_discount_vouchers.discount_applied_vnd` has been dropped
  (migration `20260720201131`). Source of truth is `orders.total_voucher_discount_vnd` and voucher links.
- **PRODUCT surplus recalculation**: Can be derived from `order_items.unit_price_vnd` (drink snapshot)
  and `vouchers.covered_price_vnd` (voucher snapshot). No replacement field needed.
- Preserve current API route names and payload field names throughout the voucher/order refactor.
  A documentation correction that matches an existing route is allowed; a runtime rename requires
  separate explicit approval.

---

## Deferred — Do Not Implement

### Deferred Code-Size Remediation — Approved Temporary Exception (2026-07-22)

The architect approved a staging-first exception for the lint remediation task:

- Fix lint errors and warnings with the smallest behaviour-preserving changes needed to pass the
  `push-to-dev` QA gate.
- Do **not** split the files below during that task, even when a lint edit touches them.
- Do not add new logic to these files or use this exception for feature work.
- Refactor them in a dedicated follow-up with characterization tests, file-by-file review, and
  staging regression testing.

Line counts are the baseline captured on 2026-07-22 and may change slightly before the follow-up.

#### Production UI

| File | Baseline lines |
|---|---:|
| `src/views/admin/AdminVoucherPackagesPage.tsx` | 864 |
| `src/components/admin/MenuItemForm.tsx` | 753 |
| `src/views/staff/StaffOrdersPage.tsx` | 722 |
| `src/components/shared/ProductModal.tsx` | 706 |
| `src/components/menu/CartDrawer.tsx` | 687 |
| `src/views/admin/AdminOrdersPage.tsx` | 645 |
| `src/components/staff/StaffCartDrawer.tsx` | 604 |
| `src/components/report/DailyReportModal.tsx` | 578 |
| `src/views/customer/HistoryPage.tsx` | 554 |
| `src/views/admin/AdminMenuPage.tsx` | 454 |
| `src/components/delivery/MapPicker.tsx` | 423 |
| `src/views/staff/StaffOrdersListPage.tsx` | 393 |
| `src/components/admin/PowderForm.tsx` | 363 |
| `src/components/menu/cart/CartFooter.tsx` | 340 |
| `src/components/shared/VoucherModal.tsx` | 337 |
| `src/views/admin/AdminMilkTypesPage.tsx` | 322 |

#### Server/API

| File | Baseline lines |
|---|---:|
| `app/api/staff/orders/route.ts` | 738 |
| `lib/orders.ts` | 398 |
| `app/api/admin/voucher-packages/route.ts` | 371 |

#### Tests

| File | Baseline lines |
|---|---:|
| `lib/__tests__/orders-route.test.ts` | 817 |
| `lib/__tests__/order-voucher-unify.test.ts` | 773 |
| `lib/__tests__/admin-order-cancel.test.ts` | 716 |
| `lib/__tests__/voucher-routes.test.ts` | 489 |
| `lib/__tests__/pricing.test.ts` | 443 |
| `lib/__tests__/create-latte-with-powder.test.ts` | 417 |
| `lib/__tests__/confirm-payment.test.ts` | 405 |
| `src/__tests__/components/customer/voucherModal.logic.test.ts` | 356 |
| `lib/__tests__/vouchers.test.ts` | 336 |

#### Scratch

`scratch/CartDrawerOriginal.tsx` is also over 300 lines, but `scratch/**` is local tooling and is
outside the application, TypeScript, and lint scope. It does not require a production refactor.

| Issue | Status | Action |
|---|---|---|
| Image cleanup (old Supabase Storage files orphaned on replace/delete) | Deferred | Acceptable for now |
| Cascade delete on `voucher_packages.menu_item_id` | Unresolved | Do NOT add cascade. Ask architect. |
| Hard delete `menu_item` while active vouchers reference it | Deferred | Soft delete only. Ask before any hard delete. |
| Order ready notification (Zalo ZNS via ESMS) | Phase 5 | Alongside OTP |
| Admin first user | Manual | Create via Supabase dashboard. No seed, no setup route. |
| SEO sitemap + robots.txt | After Phase 2 | Next.js built-in. No external library. |
| Structured data JSON-LD | After Phase 2 | Add to menu item pages for product schema. |
| **Mix bột Fusion** | Deferred | min_gram = `default_size_config[size].powder_gram`. max = min + 4g. Free allocation across available powders. Schema: add `is_mix_powder Boolean @default(false)` on `order_items` + new table `order_item_powder_blend (id, order_item_id FK, powder_id FK, grams Decimal, snapshot_price_per_gram Int)`. Additive — safe to add later. |
| **Mix bột Latte** | Deferred | Must keep minimum 2g of the item's fixed powder. Different constraint from Fusion. Same schema additions as Fusion mix. |
| **Per-item milk exclusions** | Deferred | If a Latte item should exclude certain milk types, add `menu_item_milk_exclusions (menu_item_id FK, milk_type_id FK)`. Do not implement until confirmed needed. |
| **Ice option pricing** | Deferred | Ice options are free columns on `order_items`. If any option ever needs a charge, it must move to the addon system. Confirm with business before implementing. |
| **`default_size_config` audit log** | Deferred | No audit trail when admin edits M/L/XL config. If needed: add `updated_at` + `updated_by` columns. Changes apply globally and immediately — admin is responsible. |
| **`PRICE_CHANGED` mid-session edge case** | Not a concern | Admin updates prices at night when shop is closed. No real-time mitigation needed beyond reject + conflict response. |
| **Voucher Gacha / Gamification** | Phase 5+ | Current `VoucherPackage` (template) + `Voucher` (instance) schema fully supports this. Do NOT modify order/voucher logic. Add `GachaPool` table + `POST /api/gacha/play` route to randomly pick a package and mint a voucher. Order logic remains 100% unaffected. |

---

## Backend Separation — Migration Path

> Current: fullstack Next.js — intentional for fast shipping.
> Do NOT pre-optimize or add abstraction layers.
> Only follow this if architect explicitly decides to separate.

If separation becomes necessary:
1. Move `app/api/*` → standalone Express / Fastify / Hono app
2. Move `lib/prisma.ts`, `lib/auth.ts`, `lib/validations/`, `lib/sms.ts`, `lib/storage.ts`, `lib/pricing.ts` → BE repo
3. `src/utils/pricing.ts` stays in frontend — pure functions, no deps
4. In `src/services/*` — swap base URL from `/api` to external URL. No other changes needed.
5. Frontend becomes pure static/SSG Next.js calling external API.

Works cleanly because:
- All business logic isolated in `lib/` — not scattered in components
- `src/services/` is the only layer that knows where data comes from
- `src/utils/pricing.ts` has no server deps — survives separation cleanly
- API contract `{ data: T }` / `{ error, code }` is consistent throughout

---

## Environment Variables

```bash
# Database
DATABASE_URL="postgres://...?pgbouncer=true"   # pooled — used by app at runtime
DIRECT_URL="postgresql://..."                   # direct — used by Prisma CLI only

# Auth
JWT_SECRET=""                                   # openssl rand -base64 32

# SMS (ESMS.vn)
ESMS_API_KEY=""
ESMS_SECRET_KEY=""
ESMS_SANDBOX="1"                                # set to 0 for production

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Supabase Storage
NEXT_PUBLIC_SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""

# Sentry
SENTRY_DSN=""                                   # optional until Phase 3

# Upstash Redis — Phase 5 ONLY
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```
