# Bánh Cá Bốn Mùa — Agent Entry Point

> Load this file **first, every session**. No silent workarounds — if something conflicts, stop and ask.

---

## Current State

- [x] Phase 1 — Supabase, Prisma tables, auth routes, middleware, Login/Register pages
- [x] Phase 2 — Admin menu CRUD (edit + delete)
- [x] Phase 3 — Orders + Points
- [ ] Phase 4 — Vouchers + QR
- [ ] Phase 5 — Promotions + OTP + Redis

> When a task is done: change `[ ]` → `[x]`. Read this section first every session.

---

## Index — Read Before Acting

| Task | File |
|---|---|
| Create / move any file or folder | `STRUCTURE.md` |
| API route, request/response shape, business logic | `API.md` |
| DB schema, Prisma, migration, enum | `SCHEMA.md` |
| Deferred issues, unresolved decisions, env vars | `NOTES.md` |
| Admin/staff UI, flows, form fields, roles | `ADMIN_PLAN.md` |

> Never skip reading the relevant file. Do not rely on memory alone.

---

## Behavior Rules

- Do not open browser or run `npm run dev` / `npm run build` after changes
- After completing a task: write code, save file, stop
- DB sync: `npx prisma db push && npx prisma generate` — agent may run this automatically
- Do not use `migrate dev` — incompatible with pgBouncer

---

## Stack — Never Deviate

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 App Router, TypeScript strict | No `any` — ever |
| Styling | Tailwind CSS | No other styling libraries |
| ORM | Prisma | No raw SQL unless explicitly asked |
| Database | Supabase PostgreSQL | Must use `?pgbouncer=true` in connection string |
| Auth | Custom phone + password, `jose`, httpOnly cookies | No NextAuth, no Supabase Auth |
| Validation | Zod | Every API input — no exceptions |
| Forms | React Hook Form + Zod resolver | |
| State | Zustand — cart only, localStorage | |
| HTTP client | Axios — 1 instance at `src/lib/api/client.ts` | Do not create another instance |
| File storage | Supabase Storage | Bucket: `menu-images` |
| SMS / ZNS | ESMS.vn | `console.log` in dev, real calls in prod |
| QR generate | `qrcode` npm, client-side | |
| QR scan | `html5-qrcode`, mobile camera | |
| Error tracking | Sentry | |
| Cache | Upstash Redis | **Phase 5 ONLY** — do not add before then |
| Deploy | Vercel serverless | |

---

## Hard Rules — Apply to Every Task

- No `any` in TypeScript — ever
- Money = integers in VND, never floats or decimals
- Gram quantities = Prisma `Decimal` — not money, not Float
- API success: `{ data: T }` / error: `{ error: string, code: string }`
- Never expose `users.id` or `vouchers.id` — always use `qr_token`
- Multi-step DB writes → `prisma.$transaction()`
- Server always re-fetches prices from DB — never trust client-sent prices
- `points_log` rows are immutable — reversal = insert new negative-delta row
- `"use client"` only when hooks or browser events are needed
- No hardcoded secrets — always `process.env`, add new vars to `.env.local.example`
- Every exported function needs a one-line JSDoc
- Every page must export `metadata`. Dynamic pages use `generateMetadata`
- Never import `lib/` inside `src/` — backend is server-only
- Pricing logic lives in `src/utils/pricing.ts` (pure functions, no DB deps). `lib/pricing.ts` is a thin wrapper: fetch DB data → call `src/utils/pricing.ts`. Never duplicate pricing logic between the two files.
- All final prices computed server-side and ceiled to nearest 1,000 VND. Never trust client-sent price totals.
- Never hard delete a Latte `menu_item` — soft delete only (`is_available = false`). Before soft-deleting, check if any `matcha_powder.reference_latte_item_id` points to it and warn admin.
- `menu_item_addons` junction table does not exist — do not create it.
- Error responses with additional payload use `details` key, never `data`: `{ error: string, code: string, details: {...} }`

---

## Decision Log — Non-Negotiable

### Auth & Users
- Phone normalized to `+84` before any DB storage or comparison
- Cart persisted to localStorage via Zustand — not saved to DB
- Admin first user: created manually via Supabase dashboard — no seed, no setup route
- Ghost user: `password_hash = "GHOST_USER_NO_PASSWORD"` — register flow updates existing row instead of inserting
- `redeemed_by` accepts STAFF or ADMIN only

### Categories & Menu Structure
- Categories: exactly 2 — `latte` and `fusion`. No others.
- `is_seasonal` is a boolean flag on `menu_items`, not a category. Admin toggles manually per item.
- All items always have exactly 3 `menu_item_sizes` rows (M, L, XL), created in the same `prisma.$transaction()` as the parent item.
- `menu_item_sizes.base_price_vnd` is nullable: NULL = that size is not sold, hidden from UI entirely.
- `menu_items` has no `price_vnd` column — all prices are computed at runtime.
- `menu_items` has `updated_at` timestamp — updated on any field change. Used by `GET /api/menu` to return cache invalidation timestamp.
- Soft delete only for `menu_items` — set `is_available = false`, never hard delete.
- `order_items.size` is required for all items (M/L/XL). Server validates that the chosen size has `base_price_vnd IS NOT NULL` before accepting the order.
- Creating a new item: INSERT 1 `menu_items` row + 3 `menu_item_sizes` rows in one `prisma.$transaction()`. Nothing else needed — addons and milk apply globally.

### Addon System
- `addon_groups` is **global** — all active groups apply to all items automatically. No junction table, no per-item configuration.
- `addon_groups` has `is_active` bool. Admin deactivates a group to hide it from all items at once.
- `DELETE /api/admin/addon-groups/[id]` = soft delete: set `is_active = false`. Never hard delete addon groups.
- Active addon groups (seed, `is_required = true` for all 3): kem (SELECTOR), đá dừa (TOGGLE), extra matcha (SELECTOR).
- `GET /api/menu`: attach all `addon_groups WHERE is_active = true` to every item in the response. No join needed.
- Extra matcha options store gram value in `addon_options.gram_value` (Decimal). Server computes: `unit_price_vnd = gram_value × selected_powder.price_per_gram` at order time.
- Frontend estimates extra matcha price in real-time on powder swap using `price_per_gram` from `/api/powders` cached state and `gram_value` from menu response.
- Addon group price (`addon_options.price_vnd`) is global — changing it affects all items immediately.
- No per-item addon override — if behavior needs to differ per item, create a new addon group.

### Milk System
- `milk_type` is **global** — no junction table, no per-item or per-category configuration.
- Milk applies to `latte` items only, determined purely by `category` field at query time.
- `GET /api/menu`: `category = "latte"` → attach all `milk_type WHERE is_active = true`. `category = "fusion"` → no milk attached.
- `is_default = true` (sữa bò, 40 VND/ml): always included in price calculation, hidden in UI selector.
- Frontend computes all prices client-side using `src/utils/pricing.ts`. No pre-computed price field in API responses.
- `milk_ml` per size is embedded in `GET /api/menu` → `sizes[].milk_ml` — frontend uses this for real-time price calculation and milk swap.
- Adding a new milk type → automatically available for all Latte items. No per-item config needed.
- Per-item milk exclusions: deferred — see `NOTES.md`.

### Powder System
- Latte: each item has exactly 1 powder fixed via `matcha_powder_id`. Server auto-resolves `selected_powder_id` — client never sends it.
- Fusion: each item has a `default_powder_id`. Client sends `selected_powder_id`; server validates it is either the `resolved_default_powder_id` OR exists in `fusion_allowed_powder` for that item. Default powder is always accepted regardless of `fusion_allowed_powder` list.
- Fusion `default_powder_id = NULL` fallback: server resolves at `GET /api/menu` time — Meyumi → Hana → MH-3 → cheapest available `price_per_gram`. Returns `resolved_default_powder_id` to client — never NULL.
- If `fusion_allowed_powder` list is empty → lock to `default_powder_id`, frontend hides swap UI entirely.
- `allowed_powder_ids` in menu response only includes powders with `is_available = true`.
- `matcha_powder.reference_latte_item_id`: SET NULL on hard delete (FK). Soft delete of Latte item does NOT NULL this field.
- If `reference_latte_item_id IS NULL` → `Premium_Latte = 0` (safe fallback, favors customer).

### Pricing
- Latte price: `ceil(base_price_vnd[size] + effective_gram[size] × powder.price_per_gram + default_size_config[size].milk_ml × milk_type.price_per_ml, 1000)`
- Fusion price: `ceil(base_price_vnd[size] + effective_gram[size] × selected_powder.price_per_gram + Premium_Latte[size], 1000)`
- `Premium_Latte[size] = BaseLatte[selected_powder][size] − BaseLatte[default_powder][size]` — looked up via `reference_latte_item_id`
- Gram resolution — 3-level COALESCE: (1) `menu_item.custom_powder_grams[size]`, (2) `powder_size_config[powder_id][size]`, (3) `default_size_config[size].powder_gram`
- Rounding: `Math.ceil(x / 1000) * 1000` — implemented once in `src/utils/pricing.ts`
- `default_size_config`: 3 rows (M/L/XL), admin-editable. Changes apply globally and immediately.

### Order Options (Hardcoded — Not in Addon System)
- Sweetness, ice option, and coldwhisk are stored as columns on `order_items`, not in `addon_groups`.
- These options currently have no price. If any ever needs a price, a schema change is required — see `NOTES.md`.
- Sweetness default: `QUARTER`. Ice default: `NORMAL` (hidden in UI). Coldwhisk default: `false`.
- Constants defined in `src/constants/orderOptions.ts` — not fetched from API.

### API Behaviour
- Frontend requires 2 calls on app load: `GET /api/menu` + `GET /api/powders`. Both cached in state, not refetched per interaction.
- `/api/powders` is public — no auth required. Includes `price_per_gram`, embedded `powder_size_config`, and `default_powder_gram` (system fallback per size for COALESCE level 3). This keeps frontend pricing self-contained across both calls.
- `GET /api/menu` returns `updated_at = MAX(menu_items.updated_at)` for client-side cache invalidation.
- `GET /api/menu` always returns `resolved_default_powder_id` for Fusion items — never NULL.
- `client_price_vnd` in order request is **required** per item. Missing → `VALIDATION_ERROR`.
- On price mismatch at order submit: reject entire order with `PRICE_CHANGED` error. Response: `{ error: string, code: "PRICE_CHANGED", details: { conflicts: [...] } }`.

### Orders
- All order creation: validate + re-fetch all prices from DB inside `prisma.$transaction()`
- For all items: `size` is required — server validates `base_price_vnd IS NOT NULL` for that size
- Customer order → default `PENDING`; staff counter order → `COMPLETED` immediately
- Points earned in same transaction as status → `COMPLETED`
- Points = `floor(total_vnd / 10000)`, integers only, earned when status → COMPLETED
- Price snapshot: computed final price → `order_items.unit_price_vnd` at order creation. Never join back to current prices.

### Anonymous Orders
- `orders.user_id` is nullable — `NULL` = anonymous walk-in, no loyalty tracking
- Anonymous orders: `points_earned = 0`, no voucher allowed, no product voucher allowed
- Search customers: `GET /api/staff/users?q=xxx` — suffix match on phone (digits) or ILIKE on name (letters)
- Min 2 chars to search, max 10 results, sorted by created_at DESC

### Vouchers & Points
- Voucher expiry: lazy check at scan/apply time — no background cron
- One order can carry both a PRODUCT voucher (line level) and a DISCOUNT voucher (order level)
- Voucher fields copied from package at creation — package edits never affect issued vouchers
- Manual points: ADMIN only, max 100/action, `performed_by` = admin user id
- Reversal: insert new row — negative delta, `reason = "reversed_by_admin"`, `reversed_log_id` = original row id

### Other
- No cascade delete on `voucher_packages.menu_item_id` — ask architect first
- Old Supabase Storage images are not auto-deleted on replace/delete — deferred
- No Redis, no OTP, no Zalo ZNS until Phase 5
- 1 🐟 = 1,000 VND — DB stores integer VND only
- Timing-safe: always run bcrypt compare even if user not found (prevents phone enumeration)
