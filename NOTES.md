# Bạn Cá Bán Matcha — Deferred, Notes & Env Vars

> Read this file when encountering edge cases, unresolved decisions, or setting up env.
> Do not implement anything in this file without explicit architect sign-off.

---

## Confirmed Business Rules Awaiting Code Alignment

> Superseding order for the unified architecture: `BUNDLE → PRODUCT → ADDON → DISCOUNT → FREESHIP`.
> PRODUCT selections are resolved before BUNDLE eligibility so their units can be excluded from X,
> but BUNDLE monetary reductions are recorded first.

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

### Addon opt-in rollout — Phase 2 cleanup

After Phase 1 has soaked in staging/production and no old client depends on the legacy fields,
create a separate migration to drop `addon_groups.is_required`, `addon_groups.min_quantity`, and
`addon_options.is_default`. Until then they remain physical compatibility columns fixed at
`false`, `NULL`, and `false`; they must not re-enter API contracts or business logic.

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
| Image cleanup (old Supabase Storage files orphaned on replace/delete) | Implemented | Daily job; protects menu, addon, and powder references including soft-deleted rows; 48h grace; dry-run first 7 days |
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

## Launch Hardening Decisions

- **BUNDLE vouchers approved (2026-08-11, unified 2026-08-12)**: buy-X-get-Y product/addon rules
  live directly under VoucherPackage; the legacy Promotion layer is removed. OTP, SMS/ZNS, and
  application caching remain deferred. Rules are immutable after creation. AUTO_GRANT is attempted at registration and retried
  lazily from wallet/order flows, so a newly registered account during an active campaign receives
  the default voucher without requiring a pre-existing ghost user. Anonymous checkouts remain
  ineligible; staff-created ghost users become eligible once persisted.

- **Public identifiers**: API/UI outputs contain `qr_token` for users and vouchers and strip their
  database IDs from nested order/voucher DTOs. Resolver-backed inputs retain a one-release,
  token-first legacy UUID fallback with ownership/role checks and identifier-free telemetry. Keep
  existing `_id` request field names during the bridge; remove the fallback after migration
  telemetry is quiet for the agreed release window.
- **Persisted cart compatibility**: customer cart schema v3 keeps cart items but clears all
  persisted PRODUCT, ADDON, and order-level voucher selections/credits from older schemas and
  restores undiscounted client prices. This prevents a stale localStorage database UUID from being
  resubmitted after the public-identifier rollout.
- **Delivery authority**: saved delivery address IDs are ownership-scoped. When one is supplied,
  its database address, coordinates, and distance win; receiver details alone may be overridden.
  For an unsaved address, coordinates and receiver fields are required and the server obtains the
  Goong road distance, enforces the radius, and recalculates the shipping fee.
- **Map provider**: MapLibre is the primary browser renderer over Goong style/tiles. The public
  maptiles key is attached only to Goong HTTPS tile requests. Authenticated Goong proxy search and
  geocoding remain available as the address-selection fallback when the renderer/style is down.
- **Push/Sentry privacy**: `/api/push/test` is deleted. Client and server before-send scrubbers
  remove user context, request bodies/headers/cookies/query metadata, URL query/fragment values,
  phones, bearer/JWT credentials, addresses, coordinates, QR tokens, and internal IDs across
  messages, exceptions, tags, contexts, extras, and nested breadcrumbs. Map telemetry accepts only
  fixed enums and duration buckets. Replay masks all text and blocks media.
- **Pre-Phase-5 Upstash exception**: Upstash is approved now only for distributed security rate
  limits. It remains forbidden for application caching, promotion caching, OTP, SMS/ZNS, or other deferred Phase 5
  functionality. Counters are fixed-window, TTL-bound, HMAC-keyed, and fail open with a sanitized
  Sentry event when Redis is unavailable.

### Dependency audit resolution

Next.js and `eslint-config-next` are pinned at stable `16.3.0`. This removes the vulnerable
Next-owned `postcss` and `sharp` dependency paths without transitive overrides. The production
audit on 2026-08-08 reported zero vulnerabilities at every severity. Continue running
`npm audit --omit=dev` at every release gate; a later non-zero result is a new release blocker.

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
SUPABASE_SECRET_KEY=""                          # preferred server-only credential
SUPABASE_SERVICE_ROLE_KEY=""                    # one-release legacy fallback; never NEXT_PUBLIC_

# Delivery maps / proxy
GOONG_API_KEY=""                                # server-only Goong REST API key
NEXT_PUBLIC_GOONG_MAPTILES_KEY=""               # public; restrict to approved domains
STORE_LAT=""
STORE_LNG=""

# Sentry (one project, environment separates staging/production)
SENTRY_DSN=""
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_ORG=""
SENTRY_PROJECT=""
SENTRY_AUTH_TOKEN=""                            # build-time only; rotate if exposed
NEXT_PUBLIC_APP_ENV="staging"                   # staging | production
CSP_MODE="report-only"                          # report-only | enforce | off (emergency only)

# Cron / Storage cleanup
CRON_SECRET=""
IMAGE_CLEANUP_DRY_RUN="true"                    # switch to false after reviewing 7 daily runs

# Upstash Redis — security rate-limit exception only before Phase 5
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

## Launch Gates / Operational Runbook

1. **Preview — report only.** Set `CSP_MODE=report-only`, `NEXT_PUBLIC_APP_ENV=staging`, and
   `IMAGE_CLEANUP_DRY_RUN=true`. Use Preview-only Supabase and Upstash resources. Confirm Sentry
   receives sanitized errors/CSP violations, rate limits issue `Retry-After`, delivery can continue
   through Goong search when MapLibre is unavailable, and `/api/push/test` returns 404.
2. **Verify dependencies.** Run `npm audit --omit=dev` and require zero production
   vulnerabilities. Confirm `next` and `eslint-config-next` remain on stable `16.3.0` or a later
   reviewed security patch, and confirm `@goongmaps/goong-js` is absent.
3. **Staging database preflight.** Before applying
   `20260804000000_harden_supabase_data_plane`, save the object ACL/RLS and default-ACL query
   results embedded at the top of that migration. Apply with `prisma migrate deploy`, never
   `db push`. Verify direct Prisma CRUD and the Edge refresh-session flow still work.
4. **Verify the Supabase data plane.** With staging keys, prove `anon` and `authenticated` cannot
   read or mutate any application table. Prove `service_role` has only schema usage, CRUD on
   `sessions`, and column-limited SELECT of `users.id`, `users.role`, and `users.phone_number`.
   Confirm all 26 application tables have RLS enabled and no accidental public policies/grants.
   Separately verify menu image list/upload/copy/delete through the Storage wrapper.
5. **Promote secrets deliberately.** Prefer `SUPABASE_SECRET_KEY`; retain
   `SUPABASE_SERVICE_ROLE_KEY` only for the one-release fallback. Rotate any launch/shared
   database, Supabase, JWT, cron, Upstash, Goong, VAPID private, or Sentry auth credential, update
   Vercel atomically, revoke the old value, and expect JWT rotation to sign users out. Never put a
   server secret in a `NEXT_PUBLIC_` variable.
6. **Production CSP enforcement.** Review Preview and staging CSP reports until expected customer,
   staff scan/camera, geolocation, Supabase, Goong, Sentry, VietQR, and worker flows are clean. Then
   set Production `CSP_MODE=enforce`. `off` is an emergency rollback only and requires an incident
   record; it is not a normal rollout state.
7. **Configure and verify Supabase Cron.** Send `Authorization: Bearer <CRON_SECRET>` to
   `/api/cron/cancel-expired-orders` at `*/5 * * * *` UTC, `/api/cron/clean-sessions` at
   `15 20 * * *` UTC, and `/api/cron/cleanup-menu-images` at `0 17 * * *` UTC. Keep only the Vercel
   Hobby backup for cancellation at `0 0 * * *` UTC. Confirm expected Sentry cron check-ins and
   that missing server secret fails `500`, while missing/wrong bearer credentials fail `401`,
   before a worker starts.
8. **Run the seven-day image dry run.** Leave `IMAGE_CLEANUP_DRY_RUN=true` for seven consecutive
   daily executions. Review and retain each candidate report; confirm referenced and soft-deleted
   item images never appear. Only then set it to `false`; deletion still requires a 48-hour orphan
   age.
9. **Close compatibility bridges.** Monitor identifier-fallback telemetry for the agreed release
   window. Migrate remaining clients, remove the legacy user/voucher UUID and Supabase service-role
   fallbacks in the next approved release, and keep `qr_token` as the only public identifier.
10. **Rollback by compensation only.** Never edit/delete an applied migration. Create a new
    compensating migration from the captured staging/production ACL snapshot. Prefer restoring only
    a proven missing `service_role` grant while retaining RLS. Disable RLS only after prior ACLs are
    restored and the incident owner explicitly accepts renewed Data API exposure.
