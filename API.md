# Bánh Cá Bốn Mùa — API Routes

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
| `INTERNAL_ERROR` | Unexpected server error |

---

## Auth Cookies

| Cookie | Value | Expiry |
|---|---|---|
| `access_token` | JWT signed with `JWT_SECRET` | 15 min |
| `refresh_token` | UUID stored in `sessions` table | 30 days |

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
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL"
    ice_option?: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE"
    coldwhisk?: boolean
    note?: string
    addon_option_ids: { option_id: string, quantity: number }[]
    product_voucher_id?: string
    selected_powder_id?: string       // Fusion only
    selected_milk_type_id?: string    // Latte only, optional (defaults to sữa bò)
    client_price_vnd: number          // REQUIRED — frontend computed price. Missing = VALIDATION_ERROR.
  }[]
  voucher_id?: string
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
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL"
    ice_option?: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE"
    coldwhisk?: boolean
    note?: string
    addon_option_ids: { option_id: string, quantity: number }[]
    product_voucher_id?: string
    selected_powder_id?: string
    selected_milk_type_id?: string
    client_price_vnd: number          // REQUIRED
  }[]
  discount_voucher_id?: string
  addon_voucher_id?: string
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
{ data: { type: "voucher", data: { id: string, voucher_type: "DISCOUNT" | "PRODUCT", discount_type: "PERCENT" | "FIXED" | null, discount_value: number | null, menu_item_id: string | null, status: "ACTIVE" | "REDEEMED" | "EXPIRED", expires_at: string | null } } }
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
- Stacking: Orders can use 1 PRODUCT (line item), 1 ADDON (order level), and 1 DISCOUNT (order level) voucher simultaneously. Order of application: PRODUCT -> ADDON -> DISCOUNT.
- PRODUCT: Snapshot exact config. Server subtracts up to `covered_price_vnd`. If actual price < covered, surplus is refunded as points: `floor(surplus / 10000)`.
- ADDON: Applies to the first item containing the target `addon_option_id`. Does NOT apply to Extra Matcha.
- DISCOUNT: Applies % or fixed to the remaining subtotal.
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
| `voucher_redemption` | Customer spends points on voucher package |
| `reversed_by_admin` | Admin reverses a manual adjustment |
