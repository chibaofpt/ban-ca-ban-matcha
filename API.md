# Bạn Cá Bán Matcha — API Routes

> Read this file when implementing or modifying any API route.

---

## Response Shape

- Success: `{ data: T }`
- Error: `{ error: string, code: string }`
- Error with payload: `{ error: string, code: string, details: {...} }` — used by `PRICE_CHANGED`

## Contract Stability

- Inventory the existing route, service callers, types, tests, and documentation before proposing
  an API change.
- Keep existing endpoint paths, HTTP methods, and request/response field names when the current
  contract can support the approved behavior.
- Do not rename an API or feature solely to improve terminology. Prefer an internal refactor or a
  backward-compatible extension.
- Propose a breaking rename only when the current contract cannot represent the requirement and
  the user explicitly approves consumer migration, compatibility, and rollback handling.
- Correcting documentation to match an already-existing route is not an API rename.

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
| `/api/profile` | GET/PATCH | Read or update own profile info |
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
| `/api/admin/default-size-config` | GET | Get SMALL/MEDIUM/LARGE system config |
| `/api/admin/default-size-config` | PUT | Update SMALL/MEDIUM/LARGE config (affects all prices immediately) |
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
{
  phone_number: string
  password: string
  name: string
  insta_name?: string // optional, unique, normalized without @ and to lowercase
}
// If phone exists with password_hash = "GHOST_USER_NO_PASSWORD" → UPDATE instead of INSERT
```

### `POST /api/auth/login`
```ts
// Exactly one identifier is required. Instagram login is CUSTOMER-only.
{ phone_number: string, password: string }
// or
{ insta_name: string, password: string }
```

### `GET /api/profile`
```ts
{
  data: {
    name: string
    phone_number: string
    insta_name: string | null
    points_balance: number
    qr_token: string
  }
}
```

### `PATCH /api/profile`
```ts
{
  name?: string
  insta_name?: string | null
  current_password?: string // required only when Instagram actually changes
}
// CUSTOMER-only. phone_number is intentionally not editable.
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
      size: "SMALL" | "MEDIUM" | "LARGE"
      grams: number
    }[]
  }[]
  // COALESCE level 3 fallback — system-wide, same for all powders without size_config
  default_powder_gram: {
    size: "SMALL" | "MEDIUM" | "LARGE"
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
    milk_types: MilkType[]           // active global list; Latte only at display time
    addon_groups: AddonGroup[]       // active global list; applies to every item
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

  sizes: {
    size: "SMALL" | "MEDIUM" | "LARGE"
    base_price_vnd: number            // null sizes excluded entirely
    milk_ml: number                   // from default_size_config — frontend uses for milk swap recalculation
  }[]
}

// MilkType — MenuData.milk_types is global, Latte only at display time
type MilkType = {
  id: string
  name: string
  price_per_ml: number
  is_default: boolean
  display_order: number
}

// AddonGroup — MenuData.addon_groups is global, applies to every item
type AddonGroup = {
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
}
```

### `GET /api/admin/menu`
Uses the same `updated_at`, `latte`, and `fusion` grouping as `GET /api/menu`, but does not return the public global `milk_types` or `addon_groups` collections. It also:
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
  custom_powder_grams?: { SMALL?: number, MEDIUM?: number, LARGE?: number }
  sizes: {
    size: "SMALL" | "MEDIUM" | "LARGE"
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
  custom_powder_grams?: { SMALL?: number, MEDIUM?: number, LARGE?: number } | null
  sizes?: {
    size: "SMALL" | "MEDIUM" | "LARGE"
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
    size: "SMALL" | "MEDIUM" | "LARGE"
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL" | "EXTRA"
    ice_option?: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE"
    coldwhisk?: boolean
    note?: string
    addon_option_ids: { option_id: string, quantity: number }[]
    product_voucher_id?: string
    addon_voucher_ids?: {
      voucher_id: string
      addon_option_id: string
    }[]
    selected_powder_id?: string       // Fusion only
    selected_milk_type_id?: string    // Latte only, optional (defaults to sữa bò)
    client_price_vnd: number          // REQUIRED — frontend computed price. Missing = VALIDATION_ERROR.
  }[]
  discount_voucher_ids?: string[]
  freeship_voucher_id?: string       // DELIVERY only; max 1
  pickup_time?: string
  note?: string
  delivery_address?: string
  address_id?: string
  delivery_lat?: number
  delivery_lng?: number
  delivery_receiver_name?: string
  delivery_receiver_phone?: string
  client_shipping_fee_vnd?: number   // server recomputes and remains authoritative
}

// Response
{
  data: {
    id: string
    order_code: string
    status: "PENDING"
    order_type: "PICKUP" | "DELIVERY"
    subtotal_vnd: number
    total_voucher_discount_vnd: number
    total_vnd: number
    shipping_fee_vnd: number
    freeship_discount_vnd: number
    grand_total_vnd: number
    pickup_time: string | null
    auto_cancel_at: string
    payment_qr_url: string
    skipped_vouchers: string[]       // qr_token values; no benefit, therefore not consumed
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
    size: "SMALL" | "MEDIUM" | "LARGE"
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL" | "EXTRA"
    ice_option?: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE"
    coldwhisk?: boolean
    note?: string
    addon_option_ids: { option_id: string, quantity: number }[]
    product_voucher_id?: string
    addon_voucher_ids?: {
      voucher_id: string
      addon_option_id: string
    }[]
    selected_powder_id?: string
    selected_milk_type_id?: string
    client_price_vnd: number          // REQUIRED
  }[]
  discount_voucher_ids?: string[]
  customer_qr_token?: string          // required for STAFF when a known customer uses vouchers
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
      size: "SMALL" | "MEDIUM" | "LARGE"
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
{ data: { size: "SMALL" | "MEDIUM" | "LARGE", milk_ml: number, powder_gram: number }[] }
```

### `PUT /api/admin/default-size-config`
```ts
{ sizes: { size: "SMALL" | "MEDIUM" | "LARGE", milk_ml?: number, powder_gram?: number }[] }
```

### `POST /api/profile/vouchers/exchange`
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
{ data: { type: "user", data: { qr_token: string, name: string, phone_number: string, points_balance: number } } }

// voucher
{ data: { type: "voucher", data: { qr_token: string, voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP", discount_type: "PERCENT" | "FIXED" | null, discount_value: number | null, menu_item_id: string | null, status: "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED", expires_at: string | null } } }
```

### `PATCH /api/admin/orders/[id]/status`
```ts
{ status: "PENDING" | "ADMIN_CONFIRMED" | "STAFF_DONE" | "COMPLETED" | "CANCELLED" }
```

---

## Business Logic Notes

### Menu
- `GET /api/menu`: query `menu_items WHERE is_available = true`, sizes `WHERE base_price_vnd IS NOT NULL`, `addon_groups WHERE is_active = true` (no junction join), and `milk_types WHERE is_active = true`. Addon groups and milk types are returned once at `data` level; consumers apply milk only when `category = "latte"`.
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
- Customer and staff routes must call the same server order/voucher calculator.
- `subtotal_vnd` is gross merchandise before vouchers; `total_vnd` is merchandise after all
  non-shipping vouchers; `grand_total_vnd` is the final amount including shipping and FREESHIP.
- Use `grand_total_vnd` for VietQR and the final payable amount in customer history, admin,
  and staff views. Do not display `total_vnd` as the final DELIVERY amount.
- Staff counter order: status = COMPLETED immediately; redeem applied vouchers and award order
  plus aggregate surplus points in the creation transaction.
- **Anonymous orders** (`phone_number` omitted):
  - `orders.user_id = NULL`
  - `points_earned = 0` — no points awarded, no `points_log` entry
  - `voucher_id` and `product_voucher_id` are rejected with `VALIDATION_ERROR`
  - Display as "Khách vãng lai" in all order list views

### Vouchers
- Apply vouchers strictly in this order: `PRODUCT → ADDON → DISCOUNT → FREESHIP`.
- PRODUCT: match `menu_item_id` only. Apply one voucher to one drink unit. Limit
  `covered_price_vnd` to base + powder + milk + Premium Latte; never spill credit into addons.
  Compute the package snapshot from those drink components only; included addon IDs are
  descriptive and never expand coverage.
- ADDON: apply to one unit of the exact `addon_option_id`. Allow multiple ADDON vouchers on one
  item only when their addon IDs differ. Never apply to Extra Matcha.
- DISCOUNT: check `min_order_vnd` after PRODUCT and ADDON. Apply multiple FIXED vouchers first
  in selection order, then at most one PERCENT. FIXED values must be multiples of 1,000 VND;
  round PERCENT reductions down to 1,000 VND.
- FREESHIP: DELIVERY only, max one. Check `min_order_vnd` on `total_vnd` after all merchandise
  vouchers and before shipping. Discount at most `covered_delivery_fee_vnd`.
- Do not link, reserve, or redeem a voucher that creates zero incremental benefit.
- Online: reserve applied vouchers at PENDING, redeem at ADMIN_CONFIRMED, and do not redeem again
  at COMPLETED.
- Treat `expires_at <= now` as unusable. Lazy expiry persists `ACTIVE → EXPIRED`; it never
  changes `RESERVED` vouchers until their order is cancelled.
- Do not fabricate `discount_applied_vnd` by dividing the order discount evenly across vouchers.
- Offline COUNTER orders are created as `COMPLETED`, then applied vouchers are marked
  `REDEEMED` with `used_channel = OFFLINE` in the same transaction.

### Points
- Earn order points: `floor(total_vnd / 10000)` on COMPLETED; exclude shipping.
- PRODUCT surplus: sum surplus VND across the whole order, then award
  `floor(order_surplus_vnd / 10000)` once on COMPLETED.
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
| `voucher_surplus` | Aggregate PRODUCT surplus awarded when order → COMPLETED |
| `order_complete_reversed` | Reversal after a completed COUNTER order is cancelled |
| `voucher_surplus_reversed` | Reversal of aggregate PRODUCT surplus after cancellation |
| `voucher_refund` | Target item soft-deleted → full points refund |
| `reversed_by_admin` | Admin reverses a manual adjustment |
