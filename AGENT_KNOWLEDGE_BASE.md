# BẠN CÁ BÁN MATCHA - COMPLETE AGENT KNOWLEDGE BASE

This document contains the complete context, rules, schema, and logic for the project 'Bạn Cá Bán Matcha'.
Read this document entirely before starting any work.

---

## ==========================================================
## CONTENT FROM: AGENTS.md
## ==========================================================

# Bạn Cá Bán Matcha — Agent Entry Point

> Load this file **first, every session**. No silent workarounds — if something conflicts, stop and ask.

---

## Current State

- [x] Phase 1 — Supabase, Prisma tables, auth routes, middleware, Login/Register pages
- [x] Phase 2 — Admin menu CRUD (edit + delete)
- [x] Phase 3 — Orders + Points
- [x] Phase 4 — Vouchers + QR
- [ ] Phase 5 — Promotions + OTP + Redis

> When a task is done: change `[ ]` → `[x]`. Read this section first every session.

---

## Index — Read Before Acting

| Task | File |
|---|---|
| Create / move any file or folder | `STRUCTURE.md` |
| API route, request/response shape | `API.md` |
| DB schema, Prisma, migration, enum | `SCHEMA.md` |
| Deferred issues, unresolved decisions, env vars | `NOTES.md` |
| Admin/staff UI, flows, form fields, roles | `ADMIN_PLAN.md` |

> Never skip reading the relevant file. Do not rely on memory alone.

---

## Behavior Rules

- Do not open browser or run `npm run dev` / `npm run build` after changes
- After completing a task: write code, save file, stop
- DB sync: `npx prisma db push; npx prisma generate` — agent may run this automatically
- Do not use `migrate dev` — incompatible with pgBouncer
- When modifying business logic: check if the relevant skill needs updating

---

## Stack — Never Deviate

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 App Router, TypeScript strict | No `any` — ever |
| Styling | Tailwind CSS | Framer Motion allowed for mobile UX only |
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
- Error responses with additional payload use `details` key, never `data`: `{ error: string, code: string, details: {...} }`
- Never expose `users.id` or `vouchers.id` — always use `qr_token`
- Multi-step DB writes → `prisma.$transaction()`
- Server always re-fetches prices from DB — never trust client-sent prices
- `points_log` rows are immutable — reversal = insert new negative-delta row
- `"use client"` only when hooks or browser events are needed
- No `window.confirm` — always use `ConfirmModal`
- No hardcoded secrets — always `process.env`, add new vars to `.env.local.example`
- Every exported function needs a one-line JSDoc
- File max 300 lines, ideal 150–200. Break down large components.
- Every page exports `metadata`. Dynamic pages use `generateMetadata`
- Never import `lib/` inside `src/` — backend is server-only
- Pricing: `src/utils/pricing.ts` (pure) → `lib/pricing.ts` (DB wrapper). Never duplicate.
- All final prices ceil to nearest 1,000 VND server-side
- Never hard delete Latte `menu_item` — soft delete only. Check `reference_latte_item_id` first.
- `menu_item_addons` junction table does not exist — do not create it
- Categories: exactly 2 — `latte` and `fusion`. No others.
- `addon_groups` is global — no junction table, no per-item config
- `milk_type` is global — latte only, determined by `category` at query time
- Phone normalized to `+84` before any DB storage or comparison
- Ghost user: `password_hash = "GHOST_USER_NO_PASSWORD"` — register updates existing row
- Cart persisted to localStorage via Zustand — not saved to DB
- Admin first user: created manually via Supabase dashboard — no seed, no setup route
- No Redis, no OTP, no Zalo ZNS until Phase 5
- 1 🐟 = 1,000 VND — DB stores integer VND only
- Timing-safe: always run bcrypt compare even if user not found

---

## Decision Log — Moved to Skills

> Domain-specific rules have been moved to lazy-loaded skills:
> - Pricing formulas, gram/milk/addon/powder pricing → `pricing-logic` skill
> - Order creation workflow, status, store hours, anonymous orders → `order-flow` skill
> - Voucher types, stacking, lifecycle, points, QR scan → `voucher-flow` skill
>
> Agent: read the relevant skill when working on domain-specific tasks.
> Skills extend (never contradict) the Hard Rules above.


## ==========================================================
## CONTENT FROM: SCHEMA.md
## ==========================================================

# Bạn Cá Bán Matcha — Database Schema

> Read this file for any Prisma schema, migration, or DB-level task.

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
- `size` Size — M / L / XL
- `grams` Decimal
- PK: (`powder_id`, `size`)

---

### default_size_config
System-wide fallback. Always exactly 3 rows (M, L, XL). Admin-editable.
⚠️ Changes apply immediately to all computed prices across all items.

- `size` Size PK
- `milk_ml` int — seed: M=130, L=200, XL=300
- `powder_gram` Decimal — seed: M=3.5, L=4.5, XL=8.0

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
- `custom_powder_grams` Json nullable — `{"M": 4.5, "L": 8.0}`. Keys: "M" | "L" | "XL" only.
- `base_liquid_note` string nullable — Fusion only, display text
- `image_url` string nullable — Supabase Storage public URL
- `is_available` bool — default true
- `sort_order` int — default 0
- `created_at` timestamp
- `updated_at` timestamp — updated on any field change. `GET /api/menu` returns `MAX(updated_at)` across all items as cache key.

---

### menu_item_sizes
Always 3 rows per item (M, L, XL), in same transaction as parent. NULL = size not sold.

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
- `user_id` uuid FK → users
- `handled_by` uuid FK nullable → users — Staff who created or accepted this order. NULL if created by customer and not yet accepted.
- `status` OrderStatus — customer default `PENDING`; staff = `COMPLETED` immediately
- `order_type` OrderType — customer default `DELIVERY`; staff auto `COUNTER`
- `order_code` string UK nullable — e.g. "BCBM-A3X7K2". Null for COUNTER orders.
- `subtotal_vnd` int
- `discount_vnd` int — default 0. If > subtotal → total_vnd = 0, no error.
- `total_vnd` int — subtotal_vnd − discount_vnd (min 0)
- `points_earned` int nullable — `floor(total_vnd / 10000)`, set when status → COMPLETED
- `pickup_time` timestamp nullable — customer orders only
- `auto_cancel_at` timestamp nullable — customer orders only (+20 mins from creation)
- `payment_confirmed_at` timestamp nullable
- `payment_confirmed_by` uuid FK nullable → users
- `delivery_address` string nullable
- `note` string nullable
- `created_at` timestamp

---

### order_items
- `id` uuid PK
- `order_id` uuid FK → orders (cascade delete)
- `menu_item_id` uuid FK → menu_items
- `quantity` int
- `size` Size — required. Server validates `base_price_vnd IS NOT NULL` for this size.
- `unit_price_vnd` int — snapshot of computed final price (post-ceil, using sữa bò if no milk selected). 0 if PRODUCT voucher.
- `addons_price_vnd` int — total addon cost for this line
- `selected_powder_id` uuid FK nullable → matcha_powder — snapshot at order time (both latte and fusion)
- `selected_milk_type_id` uuid FK nullable → milk_type — Latte only
- `ice_option` IceOption — default `NORMAL`
- `coldwhisk` bool — default false
- `sweetness` SweetnessLevel — default `FULL`
- `product_voucher_id` uuid FK nullable → vouchers
- `addon_voucher_id` uuid FK nullable → vouchers — Applied to specific topping
- `note` string nullable

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
- `is_active` bool — default true
- `expires_after_days` int nullable
- `created_at` timestamp

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
- `status` VoucherStatus — default `ACTIVE`
- `used_channel` UsedChannel nullable
- `expires_at` timestamp nullable
- `redeemed_at` timestamp nullable
- `redeemed_by` uuid FK nullable → users — STAFF or ADMIN only
- `created_at` timestamp

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
- NOTE: `order_id` and `voucher_id` are mutually exclusive

**`reason` valid values:**

| Value | Trigger |
|---|---|
| `order_complete` | Order status → COMPLETED |
| `manual_admin_adjustment` | Admin manually adds/deducts points |
| `voucher_purchase` | Customer spends points to buy a voucher package |
| `voucher_surplus` | Customer gets points back because actual item price was lower than covered_price_vnd |
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



## ==========================================================
## CONTENT FROM: STRUCTURE.md
## ==========================================================

# Bạn Cá Bán Matcha — Project Structure

> Read this file before creating or moving any file or directory.

---

## Folder Layout

```
app/                              # Next.js App Router — entry points only, zero logic
  (public)/
    page.tsx                      # → src/views/HomePage
    menu/
      page.tsx                    # → src/views/MenuPage
  (auth)/
    login/
      page.tsx                    # → src/views/LoginPage
    register/
      page.tsx                    # → src/views/RegisterPage
  (customer)/                     # Phase 3+ — CUSTOMER role required
    profile/page.tsx
    orders/page.tsx
    orders/[id]/page.tsx
    points/page.tsx
    vouchers/page.tsx
  (admin-public)/
    admin/
      login/
        page.tsx                  # → src/views/admin/AdminLoginPage
  (admin-shell)/
    layout.tsx                    # Shared shell: top bar + bottom tab bar
    admin/                        # ADMIN only
      menu/
        layout.tsx                # MenuSubTabs wrapper (renders sub-tab bar)
        page.tsx                  # → src/views/admin/AdminMenuPage
        powders/page.tsx          # → src/views/admin/AdminPowderPage
        addons/page.tsx           # Placeholder — Addon Groups CRUD (future)
        milk-types/page.tsx       # Placeholder — Milk Types CRUD (future)
      voucher-packages/page.tsx   # → src/views/admin/AdminVoucherPackagesPage
      points-log/page.tsx         # → src/views/admin/AdminPointsLogPage
    staff/                        # STAFF or ADMIN
      orders/page.tsx             # → src/views/staff/StaffOrdersPage
      orders-list/page.tsx        # → src/views/staff/StaffOrdersListPage
      scan/page.tsx               # → src/views/staff/StaffScanPage
  api/                            # Route handlers — delegate business logic to lib/
    auth/
      register/route.ts
      login/route.ts
      logout/route.ts
      refresh/route.ts
    menu/route.ts
    powders/route.ts              # Public — full powder catalogue
    orders/route.ts
    orders/[id]/route.ts
    profile/route.ts
    profile/points/route.ts
    profile/vouchers/route.ts
    profile/vouchers/redeem/route.ts
    staff/orders/route.ts
    staff/scan/route.ts
    staff/users/route.ts
    staff/users/[id]/vouchers/route.ts
    staff/vouchers/[id]/redeem/route.ts
    admin/points/add/route.ts
    admin/orders/[id]/status/route.ts
    admin/menu/route.ts
    admin/menu/[id]/route.ts
    admin/addon-groups/route.ts
    admin/addon-groups/[id]/route.ts
    admin/voucher-packages/route.ts
    admin/voucher-packages/[id]/route.ts
    admin/points-log/route.ts
    admin/points-log/[id]/reverse/route.ts
    admin/matcha-powders/route.ts
    admin/matcha-powders/[id]/route.ts
    admin/milk-types/route.ts
    admin/milk-types/[id]/route.ts
    admin/default-size-config/route.ts
    admin/fusion-powders/route.ts
    admin/store-schedule/route.ts     # GET + PUT weekly schedule
    admin/store-closure/route.ts      # POST close/open
    store-status/route.ts             # Public — current open/closed state
    admin/promotions/route.ts         # Phase 5 only

src/                              # Frontend — never import lib/ from here
  views/
    HomePage.tsx
    MenuPage.tsx
    LoginPage.tsx
    RegisterPage.tsx
    ProfilePage.tsx               # Phase 3
    CustomerQRDisplay.tsx         # Phase 4
    OrdersPage.tsx                # Phase 3
    PointsPage.tsx                # Phase 4
    VouchersPage.tsx              # Phase 4
    admin/
      AdminLoginPage.tsx
      AdminMenuPage.tsx
      AdminVoucherPackagesPage.tsx
      AdminPointsLogPage.tsx
    staff/
      StaffOrdersPage.tsx
      StaffOrdersListPage.tsx
      StaffScanPage.tsx
  components/
    common/
      Button.tsx
      Badge.tsx
      Modal.tsx
      Drawer.tsx
    home/
      Hero.tsx
      IntroSection.tsx
      FeatureCard.tsx
    menu/
      MenuCard.tsx
      ProductModal.tsx
      CartButton.tsx
      CartDrawer.tsx
      TabBar.tsx
    auth/
      PhoneInput.tsx
      PasswordInput.tsx
    admin/
      AdminMenuPage.tsx
      MenuItemCard.tsx
      MenuItemModal.tsx
      MenuSubTabs.tsx             # Horizontal sub-tab bar for /admin/menu/*
      VoucherPackageForm.tsx
      PointsLogTable.tsx
      PowderForm.tsx
      MilkTypeForm.tsx
      SizeConfigForm.tsx
      StoreSettingsModal.tsx          # Admin modal: weekly schedule + temporary closure
    staff/
      StaffMenuCard.tsx
      StaffCartDrawer.tsx
      StaffOrderForm.tsx
      AddonModal.tsx
      QRScannerModal.tsx
      OrderCard.tsx
  services/
    menuService.ts                # GET /api/menu
    powderService.ts              # GET /api/powders
    orderService.ts               # Phase 3
    authService.ts
    profileService.ts             # Phase 3
    voucherService.ts             # Phase 4
    adminMenuService.ts
    adminPowderService.ts         # CRUD /api/admin/matcha-powders
    adminMilkTypeService.ts       # CRUD /api/admin/milk-types
    adminSizeConfigService.ts     # GET/PUT /api/admin/default-size-config
    adminVoucherService.ts
    adminStoreService.ts          # GET/PUT schedule, POST closure toggle
    storeStatusService.ts         # GET /api/store-status (public)
    staffOrderService.ts
  __tests__/                      # Vitest unit & integration tests (Front-end + Backend Logic)
    services/
      staffOrderService.test.ts
    utils/
      pricing.test.ts
    components/
      staff/StaffOrderForm.test.tsx
scratch/                          # Ignored by Git. Scratchpad for quick server scripts & local automation
  test-order.ts
    adminPointsService.ts
    adminOrderService.ts
    staffOrderService.ts
    staffOrdersListService.ts
    staffScanService.ts
  lib/
    api/
      client.ts                   # Single Axios instance — always import from here
    store/
      cartStore.ts                # Zustand cart — localStorage persisted
      powderStore.ts              # Zustand — powder catalogue cached from /api/powders
      storeStore.ts               # Zustand — store open/closed status (hydrated on HomePage, read in CartDrawer)
    hooks/
      useScrollProgress.ts
      useBodyScrollLock.ts
    types/
      api.ts                      # ApiResponse<T>, ApiError
      menu.ts
      cart.ts
      order.ts                    # Phase 3
      user.ts
      powder.ts                   # Powder, PowderSizeConfig, MilkType types
  utils/
    formatPrice.ts                # formatPrice(vnd: number) → "🐟 {vnd/1000} cá"
    pricing.ts                    # Pure pricing functions — NO imports from lib/ or services
                                  # exports: resolveGram(), calcLattePrice(), calcFusionPrice(), ceilTo1000()
                                  # Used by frontend (real-time estimates) and lib/pricing.ts (order time)
    deriveTags.ts
    buildZaloMessage.ts
  constants/
    orderOptions.ts               # SWEETNESS_OPTIONS, ICE_OPTIONS, COLDWHISK_OPTION
                                  # Hardcoded — not fetched from API

public/
  data/
    menu.json                     # Static — replaced by /api/menu in Phase 2

lib/                              # Backend only — server-side, NEVER import in src/
  prisma.ts
  auth.ts                         # signJwt, verifyJwt, getSession
  sms.ts
  storage.ts                      # Supabase Storage helpers — bucket: menu-images
  pricing.ts                      # Thin wrapper: fetches DB data → calls src/utils/pricing.ts
                                  # exports: resolveOrderItemPrice(), buildPricingContext()
                                  # Zero pricing logic of its own
  validations/
    auth.ts
    menu.ts
    order.ts
    voucher.ts
    points.ts
    powder.ts                     # Zod schemas for matcha_powder, milk_type, default_size_config
    storeSchedule.ts              # Zod schemas for store schedule + closure toggle

middleware.ts
prisma/schema.prisma
.env.local
.env.local.example
```

---

## Layer Rules

| Layer | Rule |
|---|---|
| `app/**/page.tsx` | Entry only — import view component, export metadata, no logic |
| `src/views/` | Composition — import components + services + hooks. No direct fetch calls. |
| `src/components/` | UI only — receive props, render. No fetching, no importing services/lib. |
| `src/services/` | Only layer that knows API URLs. Use `apiClient` from `src/lib/api/client.ts`. |
| `src/utils/pricing.ts` | Pure functions only. No imports from `lib/`, `src/services/`, or `src/lib/`. Receives plain data objects as params. |
| `src/constants/` | Hardcoded UI constants — no API calls, no imports from `lib/`. |
| `lib/` | Backend only. Never import inside `src/`. Exception: `lib/pricing.ts` may import `src/utils/pricing.ts`. |
| `lib/pricing.ts` | Fetches DB data via Prisma, passes plain objects to `src/utils/pricing.ts`. Zero pricing logic of its own. |
| `app/api/**/route.ts` | Validate with Zod → delegate to `lib/` → return standard shape. |

---

## Import Boundaries

| From | Can import | Cannot import |
|---|---|---|
| `src/components/` | `src/lib/types/`, `src/utils/`, `src/constants/` | `src/services/`, `lib/` |
| `src/views/` | `src/components/`, `src/services/`, `src/lib/`, `src/utils/`, `src/constants/` | `lib/` |
| `src/services/` | `src/lib/types/`, `src/lib/api/client` | `lib/` |
| `src/utils/pricing.ts` | nothing — plain params only | everything |
| `src/constants/` | nothing | everything |
| `app/api/**/route.ts` | `lib/`, `src/lib/types/`, `src/utils/pricing.ts` | `src/components/`, `src/views/` |
| `lib/pricing.ts` | `lib/prisma.ts`, `src/utils/pricing.ts` | other `src/` files |
| `lib/` (other files) | other `lib/` files | `src/` |

---

## Import Alias

```json
// tsconfig.json
"@/*" → "./*"
```

```ts
import HomePage                  from '@/src/views/HomePage'
import { fetchMenu }             from '@/src/services/menuService'
import { formatPrice }           from '@/src/utils/formatPrice'
import { calcLattePrice }        from '@/src/utils/pricing'
import { ICE_OPTIONS }           from '@/src/constants/orderOptions'
import { useCartStore }          from '@/src/lib/store/cartStore'
import { apiClient }             from '@/src/lib/api/client'
import { getSession }            from '@/lib/auth'              // server only
import { prisma }                from '@/lib/prisma'            // server only
import { resolveOrderItemPrice } from '@/lib/pricing'           // server only
```

---

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Views | PascalCase + Page suffix | `HomePage`, `AdminMenuPage` |
| Components | PascalCase | `MenuCard`, `OrderCard` |
| Services | camelCase + Service suffix | `menuService`, `powderService` |
| Hooks | camelCase + use prefix | `useScrollProgress` |
| Utils | camelCase | `formatPrice`, `pricing` |
| Constants | camelCase + descriptive | `orderOptions` |
| Type files | camelCase | `menu.ts`, `powder.ts` |
| Route handlers | `route.ts` | Next.js convention |
| Zod schemas | camelCase, domain-named | `lib/validations/powder.ts` |


## ==========================================================
## CONTENT FROM: API.md
## ==========================================================

# Bạn Cá Bán Matcha — API Routes

> Read this file when implementing or modifying any API route.

---

## Response Shape

- Success: `{ data: T }`
- Error: `{ error: string, code: string }`
- Error with payload: `{ error: string, code: string, details: {...} }` — used by `PRICE_CHANGED`

---

## Error Codes

| code | Meaning |
|---|---|
| `VALIDATION_ERROR` | Zod schema failed |
| `UNAUTHORIZED` | No valid session / token expired |
| `FORBIDDEN` | Authenticated but insufficient role |
| `NOT_FOUND` | Resource does not exist |
| `CONFLICT` | Unique constraint or state conflict |
| `PRICE_CHANGED` | One or more item prices differ between client submission and server recompute |
| `INSUFFICIENT_POINTS` | Not enough points for voucher redemption |
| `VOUCHER_EXPIRED` | Voucher past expiry date |
| `VOUCHER_REDEEMED` | Voucher already used |
| `STORE_CLOSED` | Store is outside opening hours or temporarily closed — rejects PICKUP/DELIVERY orders (HTTP 503) |
| `INTERNAL_ERROR` | Unexpected server error |

---

## Auth Cookies

| Cookie | Value | Expiry |
|---|---|---|
| `access_token` | JWT signed with `JWT_SECRET` | 15 min |
| `refresh_token` | UUID stored in `sessions` table | 7 days |

Both set as `httpOnly`, `secure`, `sameSite=strict`.

---

## Middleware Behavior

- Reads `access_token` cookie → verifies JWT via `jose`
- On failure: returns `401 UNAUTHORIZED` (API routes) or redirects to `/login` (page routes)
- Role check: reads `role` claim from JWT payload
- Protected routes:

```
/profile/*        → CUSTOMER+
/api/orders/*     → CUSTOMER+
/api/profile/*    → CUSTOMER+
/api/staff/*      → STAFF or ADMIN
/api/admin/*      → ADMIN only
/admin/login      → public
```

---

## Pagination

- Strategy: **offset-based**
- Default: `limit=20`, `offset=0`
- Query params: `?limit=20&offset=0`
- Response shape:

```ts
{
  data: {
    items: T[],
    total: number,
    limit: number,
    offset: number
  }
}
```

Applied to: `GET /api/orders`, `GET /api/admin/points-log`

---

## Image Upload Flow

- Client calls `POST /api/admin/menu` or `PUT /api/admin/menu/[id]` with `multipart/form-data`
- Route handler uploads to Supabase Storage via `lib/storage.ts`
- Bucket: `menu-images` (public bucket)
- Size limit: 5MB
- Allowed types: `image/jpeg`, `image/png`, `image/webp`
- Old image is NOT deleted on replace — deferred cleanup

---

## Routes

### Public

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Login, issue tokens |
| `/api/auth/logout` | POST | Delete session, clear cookies |
| `/api/auth/refresh` | POST | Swap refresh token → new access token |
| `/api/menu` | GET | All available items with computed prices |
| `/api/powders` | GET | Full powder catalogue with pricing and size config |
| `/api/store-status` | GET | Current store open/closed status, today + weekly schedule |
| `/api/voucher-packages` | GET | Active voucher packages available for redemption |

### Customer — CUSTOMER role

| Route | Method | Purpose |
|---|---|---|
| `/api/orders` | POST | Create order from cart |
| `/api/orders` | GET | List own orders (newest first, limit 20) |
| `/api/orders/[id]` | GET | Own order detail |
| `/api/profile` | GET | Own profile info |
| `/api/profile/points` | GET | Balance + last 20 log entries |
| `/api/profile/vouchers` | GET | Own ACTIVE vouchers |
| `/api/profile/vouchers/exchange` | POST | Spend points on a voucher package to receive a Voucher |
| `/api/profile/vouchers/refund` | POST | Auto-refund points if the voucher's target item is no longer available |

### Staff — STAFF or ADMIN

| Route | Method | Purpose |
|---|---|---|
| `/api/staff/orders` | POST | Create order at counter (COMPLETED immediately) |
| `/api/staff/orders` | GET | List orders for current staff member |
| `/api/staff/orders/[id]` | PATCH | Update order status (auto-award points on COMPLETED) |
| `/api/staff/scan` | GET | Resolve QR token → user or voucher |
| `/api/staff/vouchers/[id]/redeem` | PATCH | Mark voucher REDEEMED offline |
| `/api/staff/users` | GET | Search customers by name or last digits of phone |
| `/api/staff/users/[id]/vouchers` | GET | List ACTIVE vouchers of a customer |

### Admin — ADMIN only

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/points/add` | POST | Manually add points (max 100) |
| `/api/admin/orders/[id]/status` | PATCH | Update order status |
| `/api/admin/orders/[id]/confirm-payment` | PATCH | Confirm VietQR payment for PENDING order |
| `/api/admin/menu` | GET | All items including unavailable |
| `/api/admin/menu` | POST | Create menu item |
| `/api/admin/menu/[id]` | PUT | Update menu item |
| `/api/admin/menu/[id]` | DELETE | Soft delete (`is_available = false`) |
| `/api/admin/addon-groups` | GET | List all addon groups |
| `/api/admin/addon-groups` | POST | Create addon group |
| `/api/admin/addon-groups/[id]` | PUT | Update addon group |
| `/api/admin/addon-groups/[id]` | DELETE | Soft delete (`is_active = false`) |
| `/api/admin/voucher-packages` | GET | List all voucher packages |
| `/api/admin/voucher-packages` | POST | Create voucher package |
| `/api/admin/voucher-packages/[id]` | PUT | Update voucher package |
| `/api/admin/voucher-packages/[id]` | DELETE | Deactivate (`is_active = false`) |
| `/api/admin/points-log` | GET | All manual adjustment logs |
| `/api/admin/points-log/[id]/reverse` | POST | Reverse a manual points entry |
| `/api/admin/matcha-powders` | GET | List all powders |
| `/api/admin/matcha-powders` | POST | Create powder |
| `/api/admin/matcha-powders/[id]` | PUT | Update powder |
| `/api/admin/matcha-powders/[id]` | DELETE | Soft delete (`is_available = false`) |
| `/api/admin/milk-types` | GET | List all milk types |
| `/api/admin/milk-types` | POST | Create milk type |
| `/api/admin/milk-types/[id]` | PUT | Update milk type |
| `/api/admin/milk-types/[id]` | DELETE | Deactivate (`is_active = false`) |
| `/api/admin/default-size-config` | GET | Get M/L/XL system config |
| `/api/admin/default-size-config` | PUT | Update M/L/XL config (affects all prices immediately) |
| `/api/admin/fusion-powders` | POST | Attach powder to Fusion item's allowed list |
| `/api/admin/fusion-powders` | DELETE | Detach powder from Fusion item's allowed list |
| `/api/admin/store-schedule` | GET | Get weekly opening hours (0–14 rows grouped by day) |
| `/api/admin/store-schedule` | PUT | Replace entire schedule (deleteMany + createMany in transaction) |
| `/api/admin/store-closure` | POST | Temporarily close (`action=close`) or reopen (`action=open`) the store |
| `/api/admin/promotions` | POST/PUT/DELETE | Phase 5 only |

---

## Request / Response Specs

### `POST /api/auth/register`
```ts
{ phone_number: string, password: string, name: string }
// If phone exists with password_hash = "GHOST_USER_NO_PASSWORD" → UPDATE instead of INSERT
```

### `GET /api/powders`
```ts
{
  data: {
    id: string
    name: string
    manufacturer: string | null
    description: string | null
    price_per_gram: number
    type: "RECOMMEND" | "NEW" | "SEASONAL" | "NONE"
    fragrance: number | null
    body: number | null
    bitterness: number | null
    umami: number | null
    color: number | null
    is_available: boolean
    size_config: {                // powder_size_config — COALESCE level 2
      size: "M" | "L" | "XL"
      grams: number
    }[]
  }[]
  // COALESCE level 3 fallback — system-wide, same for all powders without size_config
  default_powder_gram: {
    size: "M" | "L" | "XL"
    grams: number
  }[]
}
```

### `GET /api/menu`
```ts
{
  data: {
    updated_at: string              // MAX(menu_items.updated_at) — ISO timestamp for cache invalidation
    latte: MenuItem[]
    fusion: MenuItem[]
  }
}

// MenuItem
{
  id: string
  name: string
  description: string | null
  category: "latte" | "fusion"
  is_seasonal: boolean
  image_url: string | null
  sort_order: number
  base_liquid_note: string | null   // Fusion only

  // Latte only
  powder: {
    id: string
    name: string
    type: "RECOMMEND" | "NEW" | "SEASONAL" | "NONE"
  } | null

  // Fusion only
  resolved_default_powder_id: string   // never null — server resolves fallback
  allowed_powder_ids: string[]         // fusion_allowed_powder WHERE is_available=true; empty = swap locked

  // Latte only
  milk_types: {
    id: string
    name: string
    price_per_ml: number
    is_default: boolean
    display_order: number
  }[]

  sizes: {
    size: "M" | "L" | "XL"
    base_price_vnd: number            // null sizes excluded entirely
    milk_ml: number                   // from default_size_config — frontend uses for milk swap recalculation
  }[]

  // All items — addon_groups WHERE is_active = true
  addon_groups: {
    id: string
    name: string
    type: "SELECTOR" | "TOGGLE" | "QUANTITY"
    is_required: boolean
    min_quantity: number | null
    max_quantity: number | null
    options: {
      id: string
      label: string
      price_vnd: number               // extra matcha: 0 — actual price = gram_value × powder.price_per_gram
      gram_value: number | null       // extra matcha only: gram amount (0, 1, 2, 3, 4). null for others.
      is_default: boolean
      sort_order: number
    }[]
  }[]
}
```

### `GET /api/admin/menu`
Same shape as `GET /api/menu` but:
- Includes items with `is_available = false`
- Includes `default_powder_id` (raw, may be null) alongside `resolved_default_powder_id`
- Includes all 3 size rows including those with `base_price_vnd = null`
- `updated_at` is still `MAX(menu_items.updated_at)` across all items including unavailable

### `POST /api/admin/menu`
```ts
// multipart/form-data
{
  name: string
  description?: string
  category: "latte" | "fusion"
  is_seasonal?: boolean
  image?: File
  sort_order?: number
  matcha_powder_id?: string           // Latte only
  default_powder_id?: string          // Fusion only
  base_liquid_note?: string           // Fusion only
  custom_powder_grams?: { M?: number, L?: number, XL?: number }
  sizes: {
    size: "M" | "L" | "XL"
    base_price_vnd: number | null
  }[]
}
// Server: INSERT menu_items + 3 menu_item_sizes in prisma.$transaction()
// Addons apply globally — no junction rows needed
```

### `PUT /api/admin/menu/[id]`
```ts
// multipart/form-data, all fields optional
{
  name?: string
  description?: string
  is_seasonal?: boolean
  is_available?: boolean
  image?: File
  sort_order?: number
  matcha_powder_id?: string
  default_powder_id?: string
  base_liquid_note?: string
  custom_powder_grams?: { M?: number, L?: number, XL?: number } | null
  sizes?: {
    size: "M" | "L" | "XL"
    base_price_vnd: number | null
  }[]                                 // upsert on (menu_item_id, size)
}
```

### `POST /api/orders` — Customer
```ts
{
  order_type: "PICKUP" | "DELIVERY"
  items: {
    menu_item_id: string
    quantity: number
    size: "M" | "L" | "XL"
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL" | "EXTRA"
    ice_option?: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE"
    coldwhisk?: boolean
    note?: string
    addon_option_ids: { option_id: string, quantity: number }[]
    product_voucher_id?: string
    addon_voucher_id?: string
    selected_powder_id?: string       // Fusion only
    selected_milk_type_id?: string    // Latte only, optional (defaults to sữa bò)
    client_price_vnd: number          // REQUIRED — frontend computed price. Missing = VALIDATION_ERROR.
  }[]
  discount_voucher_ids?: string[]
  pickup_time?: string
  note?: string
  delivery_address?: string
}

// Response
{
  data: {
    id: string
    order_code: string
    status: "PENDING"
    order_type: "PICKUP" | "DELIVERY"
    subtotal_vnd: number
    discount_vnd: number
    total_vnd: number
    pickup_time: string | null
    auto_cancel_at: string
    payment_qr_url: string
  }
}
```

### `POST /api/staff/orders` — Staff
```ts
{
  phone_number: string
  customer_name?: string
  items: {
    menu_item_id: string
    quantity: number
    size: "M" | "L" | "XL"
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL" | "EXTRA"
    ice_option?: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE"
    coldwhisk?: boolean
    note?: string
    addon_option_ids: { option_id: string, quantity: number }[]
    product_voucher_id?: string
    addon_voucher_id?: string
    selected_powder_id?: string
    selected_milk_type_id?: string
    client_price_vnd: number          // REQUIRED
  }[]
  discount_voucher_ids?: string[]
}
```

### `PRICE_CHANGED` error response
```ts
// Note: uses `details` key, not `data` — consistent with error shape
{
  error: "One or more item prices have changed. Please review and resubmit.",
  code: "PRICE_CHANGED",
  details: {
    conflicts: {
      menu_item_id: string
      name: string
      size: "M" | "L" | "XL"
      client_price_vnd: number
      server_price_vnd: number
    }[]
  }
}
```

### `POST /api/admin/fusion-powders`
```ts
{ menu_item_id: string, powder_id: string }
```

### `DELETE /api/admin/fusion-powders`
```ts
{ menu_item_id: string, powder_id: string }
```

### `GET /api/admin/default-size-config`
```ts
{ data: { size: "M" | "L" | "XL", milk_ml: number, powder_gram: number }[] }
```

### `PUT /api/admin/default-size-config`
```ts
{ sizes: { size: "M" | "L" | "XL", milk_ml?: number, powder_gram?: number }[] }
```

### `POST /api/profile/vouchers/redeem`
```ts
{ package_id: string }
```

### `GET /api/staff/users?q=xxxx`
```ts
// Fuzzy search: all-digits → phone suffix match; has-letters → ILIKE on name
// Min 2 chars, max 10 results, sorted by created_at DESC, CUSTOMER role only
{ data: { items: { id: string, name: string, phone_number: string, points_balance: number }[] } }

// Legacy exact match (backward compat)
// GET /api/staff/users?phone=0987654321
{ data: { items: { id: string, name: string, phone_number: string, points_balance: number }[] } }
```

### `GET /api/staff/scan?token=xxx`
```ts
// user
{ data: { type: "user", data: { id: string, name: string, phone_number: string, points_balance: number } } }

// voucher
{ data: { type: "voucher", data: { id: string, voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP", discount_type: "PERCENT" | "FIXED" | null, discount_value: number | null, menu_item_id: string | null, status: "ACTIVE" | "REDEEMED" | "EXPIRED", expires_at: string | null } } }
```

### `PATCH /api/admin/orders/[id]/status`
```ts
{ status: "PENDING" | "ADMIN_CONFIRMED" | "STAFF_DONE" | "COMPLETED" | "CANCELLED" }
```

---

## Business Logic Notes

### Menu
- `GET /api/menu`: query `menu_items WHERE is_available = true`, sizes `WHERE base_price_vnd IS NOT NULL`, `addon_groups WHERE is_active = true` (no junction join), `milk_types WHERE is_active = true` (attached only if `category = "latte"`).
- `updated_at` in response = `MAX(menu_items.updated_at)` across all items including unavailable ones.
- Fusion `default_powder_id = NULL`: resolve fallback (Meyumi → Hana → MH-3 → cheapest `price_per_gram` WHERE `is_available = true`). Return `resolved_default_powder_id` — never NULL.
- `allowed_powder_ids`: join `fusion_allowed_powder` + filter `matcha_powder.is_available = true`.
- `POST /api/admin/menu`: INSERT `menu_items` + 3 `menu_item_sizes` in one `prisma.$transaction()`. No other writes needed.
- `DELETE /api/admin/addon-groups/[id]`: set `is_active = false`. Never hard delete.
- Admin soft-deleting a Latte item: check `matcha_powder.reference_latte_item_id` and warn if any powder references it.

### Pricing (Server)
- Pricing in `lib/pricing.ts` → delegates pure logic to `src/utils/pricing.ts`.
- Preload all pricing data (sizes, powder configs, milk types, `default_size_config`) in a single fetch before looping items — avoid N+1.
- Fusion Premium_Latte: preload all referenced Latte item sizes upfront.
- Extra matcha `unit_price_vnd` = `addon_option.gram_value × selected_powder.price_per_gram`. Snapshot into `order_item_addons.unit_price_vnd`.
- `PRICE_CHANGED`: compare `client_price_vnd` per item against server-computed price. Any mismatch → reject entire order, return `details.conflicts[]`.

### Orders
- Latte: server sets `selected_powder_id` from `menu_item.matcha_powder_id` — client must not send it.
- Fusion: server validates `selected_powder_id` is either `resolved_default_powder_id` OR exists in `fusion_allowed_powder` for that item. Default powder is always accepted.
- If `selected_milk_type_id` not sent for Latte → server uses `milk_type WHERE is_default = true` (sữa bò).
- DISCOUNT voucher: if `discount_vnd > subtotal` → `total_vnd = 0`, no error.
- Staff counter order: status = COMPLETED immediately, points awarded at creation.
- **Anonymous orders** (`phone_number` omitted):
  - `orders.user_id = NULL`
  - `points_earned = 0` — no points awarded, no `points_log` entry
  - `voucher_id` and `product_voucher_id` are rejected with `VALIDATION_ERROR`
  - Display as "Khách vãng lai" in all order list views

### Vouchers
- Stacking: Orders can use 1 PRODUCT (per item), 1 ADDON (per item), and multiple DISCOUNT (order level) vouchers simultaneously. Order of application: PRODUCT -> ADDON -> DISCOUNT.
- PRODUCT: Snapshot exact config. Server subtracts up to `covered_price_vnd` from drink price, remaining spills over to addons.
- ADDON: Applies to the specific item containing the target `addon_option_id`. Does NOT apply to Extra Matcha.
- DISCOUNT: Supports multiple FIXED vouchers and max 1 PERCENT voucher per order. FIXED applied first, then PERCENT on remaining.
- Offline: mark REDEEMED + `used_channel = OFFLINE`. No order created.

### Points
- Earn: `floor(total_vnd / 10000)` on COMPLETED.
- Spend: deduct + create voucher in `prisma.$transaction()`.
- Manual add: ADMIN only, max 100/action.
- Reversal: insert new negative-delta row, `reason = "reversed_by_admin"`.

### QR Scan
1. Check `users` by `qr_token` first.
2. If not found, check `vouchers`.
3. Never return internal `id` — always `qr_token`.

### `points_log.reason` Valid Values
| Value | Trigger |
|---|---|
| `order_complete` | Order status → COMPLETED |
| `manual_admin_adjustment` | Admin manually adds/deducts points |
| `voucher_purchase` | Customer spends points to buy a voucher package |
| `voucher_surplus` | Actual price < covered_price_vnd → refund difference as points |
| `voucher_refund` | Target item soft-deleted → full points refund |
| `reversed_by_admin` | Admin reverses a manual adjustment |


## ==========================================================
## CONTENT FROM: ADMIN_PLAN.md
## ==========================================================

# Bạn Cá Bán Matcha — Admin & Staff Panel

> Read this file when working on any admin or staff feature.
> Source of truth for schema and coding rules: `AGENTS.md`.
> Source of truth for folder layout and routes: `STRUCTURE.md` and `API.md`.

---

## 1. Login Flow

- Separate login page: `/admin/login` — not shared with customer `/login`
- Reuses `POST /api/auth/login` — role differentiated via JWT claim
- Redirect after login by role:
  - `ADMIN` → `/admin/menu`
  - `STAFF` → `/staff/orders`

---

## 2. Layout Shell — `(admin-shell)/layout.tsx`

- Primary device: **mobile**
- Top bar: logo + username + logout button + **icon ⚙️ (ADMIN only)** opening `StoreSettingsModal` (2 sections: weekly schedule + temporary closure with optional customer note)
- Bottom tab bar: tabs by role (see table below)
- Content area in between, full scroll. No sidebar.

> **Store Closure Impact**: When `is_open = false` (via StoreSettingsModal), the homepage displays an amber, dismissible customer banner indicating the closure.

| Role | Tabs |
|---|---|
| STAFF | Tạo Order / Đơn hàng |
| ADMIN | Tạo Order / Đơn hàng / Menu / Điểm & Voucher |

> Quét QR: button có sẵn trong trang Tạo Order, không có tab riêng.
> System Logs: truy cập qua URL `/admin/logs`, không hiển thị trên navbar.

---

## 3. Staff — Create Order (`/staff/orders`)

### Main Screen
- **Quét QR** button at top → opens `QRScannerModal`
- Menu displayed as cards (`StaffMenuCard`), split by category (`latte` / `fusion`)
- Tap card → `AddonModal` to select size + addons → **Add to cart**

### QR Scan Within Order Flow
Calls `GET /api/staff/scan?token=xxx`:

| Returned `type` | Action |
|---|---|
| `voucher` + PRODUCT | Add to cart as line item, `unit_price_vnd = 0`, open `AddonModal` |
| `voucher` + DISCOUNT | Apply discount to order |
| `user` | Pre-fill customer phone into order form, check user's ACTIVE vouchers using `GET /api/staff/users/[id]/vouchers` to apply in cart |

### Confirm Order
1. Tap cart → `StaffCartDrawer`
2. Open `StaffOrderForm`
3. Option A: Toggle "Khách vãng lai" → Submit as anonymous order (no points, no user)
4. Option B: Search customer by name or last 4 digits of phone
5. Option C: Create new customer (Ghost User) if not found
6. Tap **Tạo đơn** → `POST /api/staff/orders` → clear cart state

### Staff Order Rules
- `pickup_time`: not collected — counter orders are immediate
- `note` on order_item: optional — staff may enter custom instructions
- Status = `COMPLETED` immediately on creation, points awarded at that moment (except for anonymous orders)
- **Anonymous Orders**: `user_id = null`, `points_earned = 0`, vouchers not allowed.
- To cancel → admin sets `CANCELLED` manually + reverses points if needed (if points were awarded)

---

## 4. Staff & Admin — Order List (`/staff/orders-list`)

- **ADMIN**: Sees all orders across all dates, newest first. Can cancel orders via "Huỷ đơn" button (requires confirmation) → `PATCH /api/admin/orders/[id]/status` with `{ status: "CANCELLED" }`. After cancellation, manually reverse points via `/admin/points-log` if needed.
- **STAFF**: Read-only, no actions (except progressing status if applicable). Only sees:
  - Orders they handled/created (`handled_by = session.id`).
  - Customer orders (`PICKUP`/`DELIVERY`) that are waiting to be processed (`status = ADMIN_CONFIRMED`). Once a staff progresses it to `STAFF_DONE`, it is assigned to them and disappears from other staff's view.
- Each `OrderCard`: customer name + phone, created time, item list (collapsible), total "🐟 X cá", status badge
- Status badge: COMPLETED (green) / CANCELLED (red)

---

## 5. Staff — QR Scan Standalone (`/staff/scan`)

> Context outside the order creation flow — used for offline voucher redemption.

- Scan `vouchers.qr_token` → show voucher info → confirm → `PATCH /api/staff/vouchers/[id]/redeem`
- Scan `users.qr_token` → show customer info (name, points balance) — no further action
- **Staff cannot manually add points** — ADMIN only

---

## 6. Admin — Menu Management (`/admin/menu`)

> Tab "Menu" trên navbar chứa 4 sub-tabs nằm ngang: **Sản phẩm** | **Bột** | **Addons** | **Sữa**.
> Sub-tabs được render bởi `MenuSubTabs.tsx` qua `app/(admin-shell)/admin/menu/layout.tsx`.

### Routes
| Sub-tab | Route |
|---|---|
| Sản phẩm | `/admin/menu` |
| Bột | `/admin/menu/powders` |
| Addons | `/admin/menu/addons` (placeholder) |
| Sữa | `/admin/menu/milk-types` (placeholder) |

### Overview
- Routes used: `GET/POST /api/admin/menu`, `PUT/DELETE /api/admin/menu/[id]`
- Displays all items including `is_available = false`
- Soft delete only (`is_available = false`) — never hard delete
- Items split by category: `latte` | `fusion`
- `is_seasonal` is a **boolean toggle** on any item — not a category

### Category Rules

| Category | Fixed powder | Default powder | Allowed powder swap | Milk types | Sizes |
|---|---|---|---|---|---|
| `latte` | ✅ `matcha_powder_id` | ❌ | ❌ | ✅ (all active) | M / L / XL |
| `fusion` | ❌ | ✅ `default_powder_id` | ✅ via `fusion_allowed_powder` | ❌ | M / L / XL |

### Menu Item Create/Edit — `MenuItemForm.tsx`

**All items always have exactly 3 size fields (M / L / XL).** `base_price_vnd` is nullable — leave null if that size is not sold (hidden from customer UI).

#### Latte item fields
- `name`, `description` (optional), `is_seasonal` toggle, `sort_order`
- `matcha_powder_id` — required, select from active powders (`GET /api/admin/matcha-powders`)
- `image` — file upload, max 5MB, jpeg/png/webp
- `sizes[M/L/XL].base_price_vnd` — nullable integer (leave blank = size not sold)
- `custom_powder_grams` — optional override per size (M/L/XL); if blank, COALESCE falls back to `powder_size_config` then `default_size_config`

#### Fusion item fields
- `name`, `description` (optional), `is_seasonal` toggle, `sort_order`
- `base_liquid_note` — optional display text (e.g. "Base: Nước lọc, Milk foam")
- `default_powder_id` — optional; if null, server resolves fallback (Meyumi → Hana → MH-3 → cheapest available)
- `image` — file upload, max 5MB, jpeg/png/webp
- `sizes[M/L/XL].base_price_vnd` — nullable integer
- `custom_powder_grams` — optional override per size
- **Allowed powder list**: after item is created, admin attaches/detaches powders via `POST/DELETE /api/admin/fusion-powders`. Empty list = swap UI hidden for customers (locked to default powder).

#### API calls
| Action | Endpoint | Notes |
|---|---|---|
| Create | `POST /api/admin/menu` | `multipart/form-data`. Server creates 1 `menu_items` + 3 `menu_item_sizes` in one `prisma.$transaction()` |
| Update | `PUT /api/admin/menu/[id]` | `multipart/form-data`, all fields optional. Sizes upserted on `(menu_item_id, size)` |
| Soft delete | `DELETE /api/admin/menu/[id]` | Sets `is_available = false`. For Latte items: server warns if any `matcha_powder.reference_latte_item_id` points to it |
| Attach powder (Fusion) | `POST /api/admin/fusion-powders` | `{ menu_item_id, powder_id }` |
| Detach powder (Fusion) | `DELETE /api/admin/fusion-powders` | `{ menu_item_id, powder_id }` |

### Addon Groups — managed within `/admin/menu`

**Addons are global** — all active addon groups automatically apply to every menu item. There is no per-item configuration and no junction table.

- List + CRUD addon groups and their options: `GET/POST /api/admin/addon-groups`, `PUT/DELETE /api/admin/addon-groups/[id]`
- Soft delete only — `DELETE` sets `is_active = false`, never hard deletes
- Deactivating a group hides it from **all** items globally

| Active seed groups | Type | `is_required` |
|---|---|---|
| Kem | SELECTOR | true |
| Đá dừa | TOGGLE | true |
| Extra Matcha | SELECTOR | true |

> Extra matcha options store gram amount in `addon_options.gram_value`. Server computes price at order time: `unit_price_vnd = gram_value × selected_powder.price_per_gram`. `addon_options.price_vnd` is always 0 for extra matcha.

---

## 7. Admin — Matcha Powder Management

> Managed at `/admin/menu/powders` (sub-tab "Bột" under Menu). Uses `PowderForm.tsx`.

### Routes
| Action | Endpoint |
|---|---|
| List all powders | `GET /api/admin/matcha-powders` |
| Create powder | `POST /api/admin/matcha-powders` |
| Update powder | `PUT /api/admin/matcha-powders/[id]` |
| Soft delete | `DELETE /api/admin/matcha-powders/[id]` → `is_available = false` |

### Powder fields (form)
- `name`, `manufacturer` (optional), `description` (optional)
- `price_per_gram` — integer VND/g (e.g. 6000 = 6,000 VND/g)
- `type` — `RECOMMEND` | `NEW` | `SEASONAL` | `NONE`
- `reference_latte_item_id` — optional; links to a Latte item for `Premium_Latte` pricing anchor
- Flavour profile (display only, all optional, int 1–5): `fragrance`, `body`, `bitterness`, `umami`, `color`
- `is_available` toggle

### Per-powder size config — `powder_size_config`
- Optional gram override per size (M/L/XL) for this specific powder
- If blank → COALESCE falls back to `default_size_config[size].powder_gram`
- Edit inline in `PowderForm.tsx`

### Milk Types
| Action | Endpoint |
|---|---|
| List all | `GET /api/admin/milk-types` |
| Create | `POST /api/admin/milk-types` |
| Update | `PUT /api/admin/milk-types/[id]` |
| Deactivate | `DELETE /api/admin/milk-types/[id]` → `is_active = false` |

- Fields: `name`, `price_per_ml` (int VND/ml), `is_default`, `is_active`, `display_order`
- `is_default = true` (sữa bò): always used as base for price computation, hidden in UI selector
- Adding a new active milk type → automatically available for all Latte items

### Default Size Config
| Action | Endpoint |
|---|---|
| Read | `GET /api/admin/default-size-config` |
| Update | `PUT /api/admin/default-size-config` |

- Always exactly 3 rows: M / L / XL
- Fields per size: `milk_ml` (int), `powder_gram` (Decimal)
- Changes apply **globally and immediately** to all computed prices — warn admin before saving
- Managed via `SizeConfigForm.tsx`

---

## 8. Admin — Points Log (`/admin/points-log`)

- View full manual adjustment history: `GET /api/admin/points-log`
- **Manually add points** to customer: max 100/action → `POST /api/admin/points/add`
- **Reverse an entry**: `POST /api/admin/points-log/[id]/reverse`

---

## 9. Admin — Voucher Packages (`/admin/voucher-packages`)

- Separate page from points log
- List + manage voucher packages: `GET/POST /api/admin/voucher-packages`, `PUT/DELETE /api/admin/voucher-packages/[id]`
- Form component: `VoucherPackageForm.tsx`

---

## 10. Ghost User Convention

When a customer has no account, create a new user:

```ts
{
  phone_number: "+84xxxxxxxxx",            // normalized
  name: nickname,                           // entered by staff
  password_hash: "GHOST_USER_NO_PASSWORD", // not a bcrypt hash → login always fails
  role: "CUSTOMER",
}
```

- Identified by `password_hash === "GHOST_USER_NO_PASSWORD"` when needed
- Orders, points, and vouchers are attached to this `user_id` normally
- Ghost users accumulate points like any customer
- If customer later registers → `POST /api/auth/register` detects ghost user by phone → updates `password_hash` + `name` on same row, no data lost

---

## 11. Out of Scope for Current Phase

- Dashboard overview (revenue, pending orders)
- Staff account management
- Promotions — Phase 5
- Zalo ZNS notifications — Phase 5


## ==========================================================
## CONTENT FROM: NOTES.md
## ==========================================================

# Bạn Cá Bán Matcha — Deferred, Notes & Env Vars

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


## ==========================================================
## CONTENT FROM: .agents/skills/order-flow/SKILL.md
## ==========================================================

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
- Defaults: `sweetness = FULL`, `ice_option = NORMAL` (hidden in UI), `coldwhisk = false`.
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


## ==========================================================
## CONTENT FROM: .agents/skills/pricing-logic/SKILL.md
## ==========================================================

---
name: pricing-logic
description: >
  Consolidates all pricing rules for Bạn Cá Bán Matcha.
  Trigger on: tính giá, price calculation, compute price, price formula,
  order total, price mismatch, PRICE_CHANGED, premium latte, powder price,
  milk price, addon price, extra matcha price, base price, ceil 1000,
  gram COALESCE, default_size_config, price_per_gram, price_per_ml,
  pricing.ts, or any task involving how final drink prices are computed.
---

# Pricing Logic Skill

> This skill is the **single source of truth** for all pricing rules.
> `src/utils/pricing.ts` = pure functions. `lib/pricing.ts` = DB wrapper. Never duplicate logic between them.

---

## File Map

| File | Layer | Purpose |
|---|---|---|
| `src/utils/pricing.ts` | CLIENT + SERVER | Pure pricing functions, no DB deps. Rounding, formulas, gram resolution. |
| `lib/pricing.ts` | SERVER ONLY | Thin wrapper: fetch all pricing data from DB → call `src/utils/pricing.ts` |
| `src/lib/store/powderStore.ts` | CLIENT | Caches `/api/powders` response for real-time price estimates |
| `app/api/powders/route.ts` | SERVER | Public endpoint — includes `price_per_gram`, `powder_size_config`, `default_powder_gram` |
| `app/api/menu/route.ts` | SERVER | Returns `sizes[].milk_ml` for frontend milk swap calculation |

> Frontend needs 2 API calls on app load: `GET /api/menu` + `GET /api/powders`. Both cached in state, not refetched per interaction.

---

## Price Formulas

### Latte
```
ceil(
  base_price_vnd[size]
  + effective_gram[size] × powder.price_per_gram
  + default_size_config[size].milk_ml × milk_type.price_per_ml
, 1000)
```

### Fusion
```
ceil(
  base_price_vnd[size]
  + effective_gram[size] × selected_powder.price_per_gram
  + Premium_Latte[size]
, 1000)
```

### Premium_Latte
```
Premium_Latte[size] = BaseLatte[selected_powder][size] − BaseLatte[default_powder][size]
```
- Looked up via `matcha_powder.reference_latte_item_id` → the Latte item that anchors this powder's price.
- If `reference_latte_item_id IS NULL` → `Premium_Latte = 0` (safe fallback, favors customer).
- Preload all referenced Latte item sizes upfront to avoid N+1.

### Rounding
```ts
Math.ceil(x / 1000) * 1000
```
Implemented **once** in `src/utils/pricing.ts`. All other files call this function.

---

## Gram Resolution — 3-Level COALESCE

For each item + size, resolve grams in this order:

1. `menu_item.custom_powder_grams[size]` — per-item override (JSON field, keys: "M" | "L" | "XL")
2. `powder_size_config[powder_id][size]` — per-powder exception (currently Meyumi + Hana = 6 rows)
3. `default_size_config[size].powder_gram` — system-wide fallback (3 rows: M/L/XL, admin-editable)

> First non-null wins. If (1) is set, skip (2) and (3).

---

## Milk Pricing

- `is_default = true` (sữa bò, 40 VND/ml): always included in Latte base price, hidden in UI selector.
- `milk_ml` per size comes from `default_size_config` → embedded in `GET /api/menu` response as `sizes[].milk_ml`.
- Frontend recalculates on milk swap: `(new_milk.price_per_ml - default_milk.price_per_ml) × milk_ml[size]`.
- No pre-computed price field in API responses — frontend computes all prices client-side.
- Milk applies to `latte` items only, determined by `category` at query time.

---

## Addon Pricing

- `addon_options.price_vnd` is global — changing it affects all items immediately.
- **Extra matcha** is special:
  - `price_vnd = 0` in DB (placeholder).
  - Actual price = `addon_option.gram_value × selected_powder.price_per_gram`.
  - Server computes at order time → snapshot into `order_item_addons.unit_price_vnd`.
  - Frontend estimates in real-time using `price_per_gram` from `/api/powders` cached state + `gram_value` from menu response.

---

## Powder Rules

- **Latte**: fixed powder via `menu_item.matcha_powder_id`. Server auto-resolves `selected_powder_id` — client never sends it.
- **Fusion**: client sends `selected_powder_id`. Server validates: must be either `resolved_default_powder_id` OR exist in `fusion_allowed_powder` for that item. Default powder always accepted regardless of allowed list.
- **Fusion `default_powder_id = NULL` fallback**: server resolves at `GET /api/menu` time — Meyumi → Hana → MH-3 → cheapest available `price_per_gram`. Returns `resolved_default_powder_id` — never NULL.
- `allowed_powder_ids` in menu response only includes powders with `is_available = true`.
- If `fusion_allowed_powder` list is empty → lock to default, frontend hides swap UI.

---

## Price Validation at Order Submit

- `client_price_vnd` is **required** per item. Missing → `VALIDATION_ERROR`.
- Server recomputes every item price from DB inside `prisma.$transaction()`.
- Any mismatch → **reject entire order** with `PRICE_CHANGED` error.
- Response format:
```json
{
  "error": "One or more item prices have changed. Please review and resubmit.",
  "code": "PRICE_CHANGED",
  "details": {
    "conflicts": [
      { "menu_item_id": "...", "name": "...", "size": "M", "client_price_vnd": 45000, "server_price_vnd": 46000 }
    ]
  }
}
```

---

## System Config

- `default_size_config`: always exactly 3 rows (M, L, XL). Admin-editable.
- ⚠️ Changes apply **globally and immediately** to all computed prices across all items.
- Seed values: M=3.5g/130ml, L=4.5g/200ml, XL=8.0g/300ml.


## ==========================================================
## CONTENT FROM: .agents/skills/voucher-flow/SKILL.md
## ==========================================================

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


## ==========================================================
## CONTENT FROM: .agents/skills/api-layer/SKILL.md
## ==========================================================

---
name: api-layer
description: >
  Standardizes the full API layer for Bạn Cá Bán Matcha — Next.js 16 App Router.
  Use this skill whenever creating a new API route, frontend service, route handler,
  or reorganizing how API calls are made in views/components.
  Trigger on: "write api", "create route", "call api", "fetch data", "service layer",
  "api client", "organize api", or any request involving data flow between frontend
  and backend in this project.
---

# API Layer Skill

> Folder placement decisions → `STRUCTURE.md`. If conflict: STRUCTURE.md wins.

---

## Frontend — src/services/

**Rules:**
- One file per domain: `{domain}Service.ts` (e.g. `menuService.ts`, `orderService.ts`)
- Only layer allowed to know API URLs — declare as `const URL = { ... } as const` at top of file
- Always use `apiClient` from `src/lib/api/client.ts` — never create another Axios instance
- Always declare return types explicitly — never let TypeScript infer from Axios response
- Views call services. Components never call services directly.

**Axios instance (`src/lib/api/client.ts`):**
```typescript
import axios from "axios";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Auto-retry once with refresh token on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      await axios.post("/api/auth/refresh", {}, { withCredentials: true });
      return apiClient(original);
    }
    return Promise.reject(error);
  }
);
```

**Shared types (`src/lib/types/api.ts`):**
```typescript
export type ApiResponse<T> = { data: T };
export type ApiError = { error: string; code: string };
```

**Service pattern:**
```typescript
// src/services/orderService.ts
import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { Order } from "@/src/lib/types/order";

const URL = {
  base: "/api/orders",
  byId: (id: string) => `/api/orders/${id}`,
} as const;

/** Fetch all orders for the current user */
export async function getOrders(): Promise<Order[]> {
  const res = await apiClient.get<ApiResponse<Order[]>>(URL.base);
  return res.data.data;
}

/** Create a new order from cart */
export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const res = await apiClient.post<ApiResponse<Order>>(URL.base, payload);
  return res.data.data;
}
```

---

## Backend — app/api/**/route.ts

**Mandatory order — never swap steps:**
1. Parse body with `.catch(() => null)`
2. Zod validate → return `400 VALIDATION_ERROR` if fail
3. `getSession(req)` → return `401 UNAUTHORIZED` if null
4. Role check → return `403 FORBIDDEN` if insufficient
5. Business logic — always `prisma.$transaction()` for multi-step writes
6. Return `{ data: T }` on success

**Route pattern:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createOrderSchema } from "@/lib/validations/order";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", code: "VALIDATION_ERROR" },
      { status: 400 }
    );

  const session = await getSession(req);
  if (!session)
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );

  if (session.role !== "CUSTOMER")
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );

  const result = await prisma.$transaction(async (tx) => {
    // business logic here
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
```

**Zod schemas — `lib/validations/{domain}.ts` (no `.schema` suffix):**
```typescript
// lib/validations/auth.ts
const phoneSchema = z
  .string()
  .regex(/^(0|\+84)\d{9}$/)
  .transform((val) => (val.startsWith("0") ? `+84${val.slice(1)}` : val));

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  phone_number: phoneSchema,
  password: z.string().min(8).max(128),
});
```

**Error codes — use exactly, never invent new ones:**

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod parse failed |
| 401 | `UNAUTHORIZED` | No session / expired token |
| 403 | `FORBIDDEN` | Insufficient role |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate (phone, token, ...) |
| 422 | Domain Specific Codes | `INSUFFICIENT_POINTS`, `VOUCHER_EXPIRED`, `PRICE_CHANGED`, etc. |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Commit Checklist

**New backend route:**
- [ ] Zod validates input before any DB access
- [ ] `getSession()` called before business logic
- [ ] Role checked explicitly
- [ ] Multi-step DB in `prisma.$transaction()`
- [ ] Response is `{ data: T }` or `{ error, code }`
- [ ] No internal IDs exposed — `qr_token` only

**New frontend service:**
- [ ] File at `src/services/{domain}Service.ts`
- [ ] Uses `apiClient` from `@/src/lib/api/client`
- [ ] URLs in `const URL = { ... } as const`
- [ ] Return type declared explicitly
- [ ] No imports from `lib/`

**New view/component:**
- [ ] View at `src/views/{Name}Page.tsx` — calls service, owns state
- [ ] Component at `src/components/{domain}/{Name}.tsx` — props only, no service imports
- [ ] Page entry at `app/**/{route}/page.tsx` — re-exports view, zero logic
- [ ] Page exports `metadata` with title + description


