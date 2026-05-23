# Bánh Cá Bốn Mùa — Deferred, Notes & Env Vars

> Read this file when encountering edge cases, unresolved decisions, or setting up env.
> Do not implement anything in this file without explicit architect sign-off.

---

## Deferred — Do Not Implement

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
