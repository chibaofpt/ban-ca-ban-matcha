# Bạn Cá Bán Matcha — API Contracts

> **Authority:** public API paths, HTTP methods, request/response contracts and compatibility.
> **Read when:** creating or changing a route, service, DTO or API consumer.
> **Update when:** a supported path/method/field/response behavior changes.
> **Does not own:** domain formulas, physical database fields or frontend architecture.

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

### Public user and voucher identifiers

- User and voucher response DTOs expose `qr_token` only. They remove `users.id`, `vouchers.id`,
  ownership foreign keys, redemption actor IDs, and the corresponding nested order link IDs.
- Existing request field and route-segment names such as `product_voucher_id`, `voucher_id`,
  `discount_voucher_ids`, and `/api/staff/vouchers/[id]` remain unchanged for contract stability;
  their public value is now the relevant `qr_token`.
- For one release only, resolver-backed user/voucher inputs try `qr_token` first and then accept a
  legacy database UUID. Ownership/role checks still apply, and fallback use is recorded without the
  submitted identifier. This is an input migration bridge, never permission to return an internal ID.
- Remove the legacy lookup after clients have migrated and the compatibility telemetry is quiet for
  the agreed release window.

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
| `BUSINESS_RULE_VIOLATION` | A validated request violates a server-side business ceiling (HTTP 422) |
| `TOO_MANY_REQUESTS` | A configured account/IP rate limit was exceeded (HTTP 429) |
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

Applied where the endpoint contract below explicitly exposes `limit` and `offset`; `GET /api/orders`
is the canonical current example.

---

## Image Upload Flow

- Client calls the menu, addon-group, powder, or **milk-type** admin create/update route with `multipart/form-data`
- Route handler uploads to Supabase Storage via `lib/storage.ts`
- Bucket: `menu-images` (public bucket)
- Size limit: 5MB
- Allowed types: `image/jpeg`, `image/png`, `image/webp`
- Optional `image_filename` controls the SEO-friendly Storage object name; it is not stored in a database column
- Addon/powder/milk-type multipart requests keep their existing JSON contract inside the `payload` field and remain backward-compatible with direct JSON requests
- Milk-type PUT also accepts `remove_image: true` in the JSON payload to explicitly nullify `image_url` and delete the Storage object
- Replacing or renaming an image deletes the previous object only after the database update succeeds
- Soft-deleted menu items, addon groups, and powders retain their image references and are protected from cleanup
- Daily cleanup deletes only objects unreferenced by all three catalog tables and older than 48 hours; start with `IMAGE_CLEANUP_DRY_RUN=true`

---

## Route inventory

This table is exhaustive and machine-checked by `npm run resources:check`. Detailed contracts remain below.

| Route | Method |
|---|---|
| `/api/admin/addon-groups` | GET, POST |
| `/api/admin/addon-groups/[id]` | PUT, DELETE |
| `/api/admin/base-liquids` | GET, POST |
| `/api/admin/base-liquids/[id]` | PUT, DELETE |
| `/api/admin/logs` | GET |
| `/api/admin/menu` | GET, POST |
| `/api/admin/menu/[id]` | PUT, DELETE |
| `/api/admin/menu/create-latte-with-powder` | POST |
| `/api/admin/milk-types` | GET, POST |
| `/api/admin/milk-types/[id]` | PUT, DELETE |
| `/api/admin/orders` | GET |
| `/api/admin/orders/[id]/confirm-payment` | PATCH |
| `/api/admin/powders` | GET, POST |
| `/api/admin/powders/[id]` | PUT, DELETE |
| `/api/admin/report` | GET |
| `/api/admin/staff` | GET |
| `/api/admin/store-closure` | POST |
| `/api/admin/store-schedule` | GET, PUT |
| `/api/admin/voucher-packages` | GET, POST |
| `/api/admin/voucher-packages/[id]` | PUT, DELETE |
| `/api/auth/check-phone` | POST |
| `/api/auth/login` | POST |
| `/api/auth/logout` | POST |
| `/api/auth/me` | GET |
| `/api/auth/refresh` | POST |
| `/api/auth/register` | POST |
| `/api/cron/cancel-expired-orders` | GET |
| `/api/cron/clean-sessions` | GET |
| `/api/cron/cleanup-menu-images` | GET |
| `/api/delivery/autocomplete` | GET |
| `/api/delivery/estimate` | GET |
| `/api/delivery/geocode` | GET |
| `/api/delivery/reverse-geocode` | GET |
| `/api/menu` | GET |
| `/api/orders` | GET, POST |
| `/api/orders/[id]` | GET, PATCH |
| `/api/powders` | GET |
| `/api/profile` | GET, PATCH |
| `/api/profile/addresses` | GET, POST |
| `/api/profile/addresses/[id]` | PUT, DELETE |
| `/api/profile/points` | GET |
| `/api/profile/vouchers` | GET |
| `/api/profile/vouchers/claim` | POST |
| `/api/profile/vouchers/exchange` | POST |
| `/api/profile/vouchers/refund` | POST |
| `/api/push/subscribe` | POST |
| `/api/push/unsubscribe` | POST |
| `/api/report` | GET |
| `/api/staff/orders` | GET, POST |
| `/api/staff/orders/[id]` | GET, PATCH |
| `/api/staff/scan` | GET |
| `/api/staff/scan-fallback` | POST |
| `/api/staff/users` | GET |
| `/api/staff/users/[id]/vouchers` | GET |
| `/api/staff/users/[id]/vouchers/exchange` | POST |
| `/api/staff/vouchers/[id]/redeem` | PATCH |
| `/api/store-status` | GET |
| `/api/voucher-packages` | GET |

Auth mutations are rate-limited by hashed IP. Authorization details are defined by each contract and middleware.

### Payload and value ceilings

Payload cap failures return `400 VALIDATION_ERROR`.

| Cap | Customer order | Staff order |
|---|---:|---:|
| Order lines | 20 | 50 |
| Total cups | 20 | 100 |
| Cups per line | 10 | 50 |
| Addon selections per line | 20 | 50 |
| Quantity per addon selection | 10 | 50 |
| ADDON voucher entries per line | 10 | 50 |
| Order-level DISCOUNT/FREESHIP entries | 10 | 10 |

A server-calculated `grand_total_vnd > 20,000,000` returns
`422 BUSINESS_RULE_VIOLATION` with `details.reason = "ORDER_VALUE_EXCEEDED"` before any
order or voucher write.

### Distributed rate limits

| Scope | Limit |
|---|---:|
| Auth mutations (`login`, `register`, `check-phone`, `refresh`) | 10/min/IP |
| Failed login attempts | 5/15 min/IP |
| Failed normalized login identifier | 10/15 min/identifier |
| Customer order creation | 5/10 min/account and 50/10 min/IP |
| Staff order creation | 30/min/account |
| Voucher exchange | 5/min/account |
| Push subscribe + unsubscribe combined | 20/10 min/account |
| All delivery proxies combined | 60/min/account and 120/min/IP |

The implementation uses fixed-window Upstash counters, HMAC-hashes every identifier before it
becomes a Redis key, and returns `429 TOO_MANY_REQUESTS` with deterministic `Retry-After`. It fails
open and reports the infrastructure error to Sentry if Redis is absent or unavailable. This is the
only approved pre-Phase-5 Upstash use: a security control, not application caching or an OTP,
promotion, or messaging feature.

### Cron — `CRON_SECRET` required

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/cancel-expired-orders` | Supabase `*/5 * * * *` UTC; Vercel `0 0 * * *` UTC backup | Cancel expired PENDING orders in bounded batches and release reservations |
| `/api/cron/clean-sessions` | Supabase `15 20 * * *` UTC | Delete expired sessions in at most 5 batches of 500 |
| `/api/cron/cleanup-menu-images` | Supabase `0 17 * * *` UTC | Dry-run/delete orphaned menu images older than 48 hours |

Cron calls must send `Authorization: Bearer <CRON_SECRET>`. A missing server-side
`CRON_SECRET` fails closed with `500 INTERNAL_ERROR`; a missing or incorrect bearer token returns
`401 UNAUTHORIZED`. No worker starts unless this check succeeds.

`/api/push/test` has been deleted and is not a supported development or production contract.

---

## Request / Response Specs

### `GET /api/admin/report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&staffId?=UUID`

ADMIN-only. `startDate` and `endDate` are required; `staffId` optionally limits completed orders
to the selected staff member. Dates are evaluated in `Asia/Ho_Chi_Minh`.

```ts
{
  data: {
    summary: {
      total_orders: number
      total_cups: number
      total_extras_units: number
      total_revenue_vnd: number
    }
    powder_usage: { powder_name: string, total_grams: number }[]
    milk_usage: { milk_name: string, total_ml: number }[]
    latte_sales: ItemSales[]
    fusion_sales: ItemSales[]
    extras_sales: ItemSales[]
    addon_usage: {
      addon_option_id: string
      addon_label: string
      group_name: string
      total_count: number
      powder_breakdown: {
        powder_name: string
        total_grams: number
      }[]
    }[]
    revenue_by_type: {
      order_type: "COUNTER" | "PICKUP" | "DELIVERY"
      total_revenue_vnd: number
      order_count: number
    }[]
    top_products: { name: string, category: string, total_cups: number }[]
  }
}
```

- `addon_usage` is grouped by stable `addon_option_id`, never label text. Existing display fields
  remain for backward compatibility.
- `total_count` and every `powder_breakdown.total_grams` include both the addon quantity and the
  corresponding order-item quantity.
- `powder_breakdown` is always an array; it is empty for an addon that does not consume matcha.

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

### `GET /api/profile/points?page=1&limit=10`
```ts
{
  data: {
    points_balance: number
    events: {
      id: string
      kind: "order_reward" | "order_reversal" | "other"
      reason: string
      total_delta: number
      order_points: number
      surplus_points: number
      created_at: string
      order: {
        order_code: string | null
        points_base_vnd: number        // orders.total_vnd; excludes shipping
      } | null
      voucher: { package_name: string } | null
      actor: {
        name: string
        role: "CUSTOMER" | "STAFF" | "ADMIN"
      } | null
    }[]
    meta: {
      total: number                    // grouped events, not raw log rows
      page: number
      limit: number
      totalPages: number
    }
  }
}
```

- Default `page=1`, `limit=10`; maximum `limit=50`. Invalid values return `400 VALIDATION_ERROR`.
- `order_complete` + `voucher_surplus` group by order; reversal reasons form a separate event.
- Pagination happens after grouping, so one order event is never split across pages.
- The response never exposes `order_id`, `voucher_id`, or `performed_by`.

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
    image_url: string | null
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
    extras: MenuItem[]              // fixed-price merchandise; rendered below Fusion
    milk_types: BaseLiquid[]         // legacy response field; active global Base Liquid catalog
    base_liquids: BaseLiquid[]       // preferred alias, same rows as milk_types
    addon_groups: AddonGroup[]       // active global list; applies to every item
  }
}

// MenuItem
{
  id: string
  name: string
  description: string | null
  category: "latte" | "fusion" | "extras"
  unit_price_vnd: number | null     // required for extras; null for drinks
  is_seasonal: boolean
  image_url: string | null
  sort_order: number
  base_liquid_note: string | null   // Fusion only
  default_base_liquid_id: string | null
  resolved_default_base_liquid_id: string | null
  allowed_base_liquid_ids: string[] // active, excludes implicit default

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
    base_liquid_ml: number            // resolved override or default_size_config fallback
    base_liquid_ml_override: number | null
    milk_ml: number                    // legacy alias of base_liquid_ml
  }[]
}

// BaseLiquid — physical storage remains milk_type
type BaseLiquid = {
  id: string
  name: string
  price_per_ml: number
  is_default: boolean
  display_order: number
  image_url: string | null   // Supabase Storage public URL; null when no image uploaded
}

// AddonGroup — MenuData.addon_groups is global, applies to every item
type AddonGroup = {
  id: string
  name: string
  image_url: string | null
  type: "SELECTOR" | "TOGGLE" | "QUANTITY"
  max_quantity: number | null
  options: {
    id: string
    label: string
    price_vnd: number               // extra matcha: 0 — actual price = gram_value × powder.price_per_gram
    gram_value: number | null       // extra matcha only: positive gram amount. null for fixed-price addons.
    sort_order: number
  }[]
}
```

All addon groups are optional. The client sends no row for an unselected group. Public menu data
contains only active groups with at least one active option and only active options. The public
contract intentionally omits rollout-only DB fields `is_required`, `min_quantity`, `is_default`,
and option `is_active`.

### Admin addon group mutation
```ts
// POST/PUT /api/admin/addon-groups[/id]
{
  name: string
  description?: string | null
  type: "SELECTOR" | "TOGGLE" | "QUANTITY"
  max_quantity?: number | null      // required positive only for QUANTITY
  is_active: boolean
  options: {
    id?: string
    label: string
    price_vnd: number
    gram_value?: number | null
    is_active: boolean              // soft-delete lifecycle
    sort_order: number
  }[]
}
```

`SELECTOR` accepts at most one selected option per order line. `TOGGLE` and `QUANTITY` must each
have exactly one active option. Dynamic-gram options are valid only in `SELECTOR`, must all have a
positive `gram_value` and `price_vnd = 0`, and cannot be mixed with fixed-price active options.
Omitting an existing option from an update does not delete it; retire it with `is_active = false`.

### Admin addon/powder image mutations
```ts
// POST/PUT /api/admin/addon-groups[/id]
// POST/PUT /api/admin/powders[/id]
// multipart/form-data; direct application/json remains supported when no image is uploaded
{
  payload: string        // JSON.stringify(existing request payload)
  image?: File          // JPEG, PNG, or WebP; max 5MB
  image_filename?: string // optional SEO object name; may rename an existing image
}
```

### `GET /api/admin/menu`
Uses the same `updated_at`, `latte`, `fusion`, and `extras` grouping as `GET /api/menu`, but does not return the public global `milk_types` or `addon_groups` collections. It also:
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
  category: "latte" | "fusion" | "extras"
  unit_price_vnd?: number             // extras only; integer >= 1,000 and divisible by 1,000
  is_seasonal?: boolean
  image?: File
  sort_order?: number
  matcha_powder_id?: string           // Latte only
  default_powder_id?: string          // Fusion only
  base_liquid_note?: string           // Fusion only
  default_base_liquid_id?: string     // required for new/edited Fusion
  allowed_base_liquid_ids?: string[]  // default is implicit; do not include it
  custom_powder_grams?: { SMALL?: number, MEDIUM?: number, LARGE?: number }
  sizes: {                            // drink categories only; extras sends []
    size: "SMALL" | "MEDIUM" | "LARGE"
    base_price_vnd: number | null
    base_liquid_ml?: number | null    // null/omitted = system fallback
  }[]
}
// Server: INSERT menu_items + 3 menu_item_sizes + allowed Base Liquids in prisma.$transaction()
// Addons apply globally — no junction rows needed
```

### `POST /api/admin/voucher-packages` for BUNDLE

```ts
{
  voucher_type: "BUNDLE"
  name: string
  description?: string
  acquisition_mode: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT"
  points_cost: number              // positive only for POINTS_EXCHANGE
  ends_at?: string | null          // exclusive UTC instant; no starts_at, active immediately
  min_order_vnd?: number | null
  expires_after_days?: number | null
  quantity?: number | null
  max_per_user: number
  bundle_rule: {
    buy_quantity: number
    reward_quantity: number
    reward_kind: "PRODUCT" | "ADDON"
    reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE"
    benefit_scaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM"
    max_applications_per_order: number
    max_reward_units_per_order?: number | null
    qualifier_products: ProductScope[]
    reward_products: ProductScope[]
    reward_addon_option_ids: string[]
  }
}

type ProductScope = {
  menu_item_id: string
  default_powder_id?: string | null
  default_base_liquid_id?: string | null
  allowed_sizes: ("SMALL" | "MEDIUM" | "LARGE")[]
}
```

Rules are immutable after creation; `PUT /api/admin/voucher-packages/[id]` only accepts name,
description, and `is_active`. Qualifier/reward arrays support multiple products, including seasonal
items. Each BUNDLE has one reward kind. Package `min_order_vnd` excludes product-vouchered drink
units and addon-vouchered addon units from the eligible subtotal.

All package/wallet voucher responses expose the same grouped `qualifier_products` and
`reward_products`. Each product additionally contains
`menu_item: { name, category, is_available }`. There is no public `reference_price_vnd`; the
server resolves the immutable default configuration snapshot against current menu pricing at
checkout.

For owned BUNDLE voucher responses from `GET /api/profile/vouchers` and
`GET /api/staff/users/[id]/vouchers`, each reward product of `FIXED_CONFIG` or
`ALLOWED_SCOPE` additionally returns the response-only current baseline below. This is batched
across the list, is recalculated on every fetch, and is never accepted in an order request.
`SAME_CONFIG` has no baseline field because it derives its baseline from selected qualifier units.

Owned customer and Staff voucher responses also expose live target availability. BUNDLE product
and addon arrays contain only currently orderable choices; inactive options and unavailable sizes
are omitted instead of returned disabled. The voucher remains visible in the wallet when unusable.

```ts
availability: {
  status: "USABLE" | "TARGET_UNAVAILABLE" | "NO_ACTIVE_QUALIFIER" |
    "NO_ACTIVE_REWARD" | "NO_ACTIVE_CONFIGURATION"
  can_apply: boolean
  can_refund: boolean
  refund_points: number
}
```

Latte scopes keep their fixed powder and are removed when that powder is inactive. Fusion scopes
resolve an effective active powder deterministically. `default_powder_id` and
`default_base_liquid_id` in the owned response are effective live selections; immutable configured
snapshots remain server-side.

Admin create/publish, public package catalog, every issuance mode, and admin reactivation apply the
same live target rules to `ITEM`, `PRODUCT`, `ADDON`, and `BUNDLE`. A target-bearing package is not
published, listed, issued, or reactivated when its current target is unusable. `DISCOUNT` and
`FREESHIP` remain lifecycle-only because they have no menu target.

```ts
{
  baseline_prices_vnd?: Partial<Record<"SMALL" | "MEDIUM" | "LARGE", number>>
  baseline_price_vnd?: number // extras only
}
```

Admin selects the final usable Vietnam calendar date. The UI sends the next day at 00:00 UTC+7;
the server treats the package as usable only while `now < ends_at`. `quantity` is the single
campaign issuance limit; there is no second limit inside `bundle_rule`.

### `POST /api/profile/vouchers/claim`
```ts
{ package_id: string }
// FREE_CLAIM only. Repeated/concurrent claims are idempotent.
// Response: { data: { qr_token: string, voucher_type: VoucherType,
//   status: "ACTIVE", expires_at: string | null, already_granted: boolean } }
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
    base_liquid_ml?: number | null    // omitted preserves current override; null clears to system fallback
  }[]                                 // upsert on (menu_item_id, size)
}
```

The JSON quick-toggle payload `{ is_available: boolean }` remains valid for legacy Fusion rows
without a configured default Base Liquid. Any full edit still requires a valid active default.

### `POST /api/orders` — Customer
```ts
{
  order_type: "PICKUP" | "DELIVERY"
  items: {
    client_line_id?: string           // required when bundle_applications is non-empty
    menu_item_id: string
    quantity: number
    size: "SMALL" | "MEDIUM" | "LARGE" | null // null only for extras
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL" | "EXTRA"
    ice_option?: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE"
    coldwhisk?: boolean
    note?: string
    addon_option_ids: { option_id: string, quantity: number }[]
    product_voucher_id?: string       // voucher qr_token; legacy UUID accepted for one release
    item_voucher_id?: string          // ITEM qr_token; extras only, mutually exclusive with PRODUCT
    addon_voucher_ids?: {
      voucher_id: string              // voucher qr_token; legacy UUID accepted for one release
      addon_option_id: string
    }[]
    selected_powder_id?: string       // Fusion only
    selected_base_liquid_id?: string  // preferred for Latte and configured Fusion
    selected_milk_type_id?: string    // one-release legacy alias; must not conflict with preferred field
    client_price_vnd: number          // REQUIRED — frontend computed price. Missing = VALIDATION_ERROR.
  }[]
  discount_voucher_ids?: string[]    // voucher qr_token values
  freeship_voucher_id?: string       // voucher qr_token; DELIVERY only; max 1
  bundle_applications?: {
    voucher_qr_token: string
    qualifier_allocations: { client_line_id: string, quantity: number }[]
    reward_allocations: {
      client_line_id: string
      quantity: number
      addon_option_id?: string
    }[]
  }[]
  pickup_time?: string
  note?: string
  delivery_address?: string
  address_id?: string                 // owned saved-address database ID; never accepted across users
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
    payment_method: "BANK_TRANSFER"
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
  payment_method?: "CASH" | "BANK_TRANSFER" // default CASH; backward compatible
  items: {
    client_line_id?: string           // required with BUNDLE
    menu_item_id: string
    quantity: number
    size: "SMALL" | "MEDIUM" | "LARGE" | null // null only for extras
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL" | "EXTRA"
    ice_option?: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE"
    coldwhisk?: boolean
    note?: string
    addon_option_ids: { option_id: string, quantity: number }[]
    product_voucher_id?: string       // voucher qr_token; legacy UUID accepted for one release
    item_voucher_id?: string          // ITEM qr_token; extras only
    addon_voucher_ids?: {
      voucher_id: string              // voucher qr_token; legacy UUID accepted for one release
      addon_option_id: string
    }[]
    selected_powder_id?: string
    selected_milk_type_id?: string
    client_price_vnd: number          // REQUIRED
  }[]
  discount_voucher_ids?: string[]    // voucher qr_token values
  bundle_applications?: {
    voucher_qr_token: string
    qualifier_allocations: { client_line_id: string, quantity: number }[]
    reward_allocations: {
      client_line_id: string
      quantity: number
      addon_option_id?: string
    }[]
  }[]
  customer_qr_token?: string          // user qr_token; required for STAFF with known-customer vouchers
}

// Response: CASH remains immediate COMPLETED; BANK_TRANSFER is PENDING for 20 minutes.
{
  data: {
    id: string
    status: "PENDING" | "COMPLETED"
    order_type: "COUNTER"
    payment_method: "CASH" | "BANK_TRANSFER"
    order_code: string | null
    auto_cancel_at: string | null
    payment_qr_url: string | null
    subtotal_vnd: number
    total_voucher_discount_vnd: number
    total_vnd: number
    shipping_fee_vnd: 0
    freeship_discount_vnd: 0
    grand_total_vnd: number
    points_earned: number | null
    skipped_vouchers: string[]
  }
}
```

### `GET /api/staff/orders?status=PENDING&order_type=COUNTER&mine=true`

- Returns only `COUNTER + BANK_TRANSFER + PENDING` orders created by the current Staff/Admin.
- Used by the POS “Chờ CK” launcher; `limit=100` is sufficient because each order expires after 20 minutes.
- Expired rows are lazily cancelled and excluded client-side when no longer recoverable.
- Omitting `mine=true` preserves the existing management-list behavior.

### `GET /api/staff/orders/[id]` — Staff/Admin payment recovery

- `STAFF` may read only a `COUNTER` order created by that same staff account.
- `ADMIN` may read any order needed by the management flow.
- The response uses the same staff order snapshot above. `payment_qr_url` is regenerated only
  while a bank-transfer order remains `PENDING`; otherwise it is `null`.
- Missing orders return `404 NOT_FOUND`; cross-staff access returns `403 FORBIDDEN`.

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

For both customer and Staff order creation, a BUNDLE token that is truly missing or not visible to
the caller returns `404 NOT_FOUND`. A present BUNDLE that fails live eligibility returns
`422 BUSINESS_RULE_VIOLATION` with `details.reason` set to the server reason; the HTTP boundary
does not expose a separate `BUNDLE_NOT_ELIGIBLE` error code.

### `POST /api/profile/vouchers/exchange`
```ts
{ package_id: string }
```

### `POST /api/profile/vouchers/refund`
```ts
{ qr_token: string }

// Success
{ data: { qr_token: string, status: "REFUNDED", points_refunded: number } }
```

Refund is allowed only for an unexpired `ACTIVE` voucher issued through `POINTS_EXCHANGE` whose
live availability is unusable. The refund equals `abs(points_log.delta)` from its immutable
`voucher_purchase` entry; current package cost is never used. Missing audit returns
`422 BUSINESS_RULE_VIOLATION` with `details.reason = "REFUND_AUDIT_MISSING"`. An expected-state
race, including an exhausted Serializable `P2034` retry, returns `409 CONFLICT`. Refund does not
restore package quantity or per-user redemption count.

### `GET /api/staff/users?q=xxxx`
```ts
// Fuzzy search: all-digits → phone suffix match; has-letters → ILIKE on name
// Min 2 chars, max 10 results, sorted by created_at DESC, CUSTOMER role only
{ data: { items: { qr_token: string, name: string, phone_number: string, points_balance: number }[] } }

// Legacy exact match (backward compat)
// GET /api/staff/users?phone=0987654321
{ data: { items: { qr_token: string, name: string, phone_number: string, points_balance: number }[] } }
```

### `GET /api/staff/scan?token=xxx`
```ts
// user
{ data: { type: "user", data: { qr_token: string, name: string, phone_number: string, points_balance: number } } }

// voucher
{ data: { type: "voucher", data: { qr_token: string, voucher_type: "ITEM" | "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP" | "BUNDLE", discount_type: "PERCENT" | "FIXED" | null, discount_value: number | null, menu_item_id: string | null, status: "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED", expires_at: string | null } } }
```

---

## Business Logic Notes

### Menu
- `GET /api/menu`: return the active global Base Liquid catalog once, plus each item's resolved default, active allowed IDs, and effective per-size volume. Consumers show the selector only when default + allowed contains more than one option.
- `updated_at` in response = `MAX(menu_items.updated_at)` across all items including unavailable ones.
- Fusion missing/inactive default: resolve fallback (Meyumi → Hana → MH-3 → lowest active `price_per_gram` → lowest ID). Return `resolved_default_powder_id` when any powder is active.
- `allowed_powder_ids`: join `fusion_allowed_powder` + filter `matcha_powder.is_available = true`.
- `POST /api/admin/menu`: INSERT `menu_items` + 3 `menu_item_sizes` + `menu_item_allowed_base_liquid` rows in one `prisma.$transaction()`.
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
- Latte resolves the global default Base Liquid; Fusion resolves its per-item default. A requested swap must be the default or an active item-allowed row.
- Fusion without Base Liquid configuration remains legacy-compatible and has no selector or liquid price delta until Admin edits it.
- On every new customer or staff order, server snapshots the effective Base Liquid volume into
  `order_items.base_liquid_ml` together with the resolved physical liquid ID. Historical
  consumption reports read this snapshot first and use current recipe data only for legacy null rows.
- Customer and staff routes must call the same server order/voucher calculator.
- `subtotal_vnd` is gross merchandise before vouchers; `total_vnd` is merchandise after all
  non-shipping vouchers; `grand_total_vnd` is the final amount including shipping and FREESHIP.
- Use `grand_total_vnd` for VietQR and the final payable amount in customer history, admin,
  and staff views. Do not display `total_vnd` as the final DELIVERY amount.
- Staff CASH counter order: status = COMPLETED immediately; redeem applied vouchers and award
  order plus aggregate surplus points in the creation transaction.
- Staff BANK_TRANSFER counter order: status = PENDING, reserve applied vouchers, generate VietQR,
  and defer points. The creating Staff or any Admin confirms it directly to COMPLETED; cancellation
  or the 20-minute timeout restores vouchers. Existing online transitions remain unchanged.
- Delivery input is validated before proxy/database work. If `address_id` is present, the server
  loads a row owned by the session and treats its full address, coordinates, and stored distance as
  authoritative; request address/coordinate values cannot override it. Receiver name/phone may be
  overridden explicitly. Without `address_id`, bounded coordinates plus receiver name/phone are
  required, Goong road distance is recalculated, radius is enforced, and the server recalculates the
  shipping fee. A mismatching `client_shipping_fee_vnd` returns `409 SHIPPING_FEE_CHANGED`.
- The client map uses lazy MapLibre rendering with Goong style/tiles. Goong API-backed search and
  geocoding remain usable when rendering fails, providing the manual address-selection fallback.
- Persisted customer cart schema is version `7`. Migrating an older cart keeps compatible items but
  clears stale PRODUCT/ITEM/ADDON and order-level voucher identifiers and credits,
  then recomputes client item prices so legacy database UUIDs cannot be resubmitted.
- **Anonymous orders** (`phone_number` omitted):
  - `orders.user_id = NULL`
  - `points_earned = 0` — no points awarded, no `points_log` entry
  - `voucher_id` and `product_voucher_id` are rejected with `VALIDATION_ERROR`
  - Display as "Khách vãng lai" in all order list views

### Vouchers
- Apply vouchers strictly in this order: `BUNDLE → ITEM/PRODUCT/PRODUCT_DISCOUNT → ADDON → DISCOUNT → FREESHIP`.
- `product_voucher_id` accepts a PRODUCT or PRODUCT_DISCOUNT public token. PRODUCT_DISCOUNT
  matches `menu_item_id` plus `eligible_sizes`; FIXED_AMOUNT uses `discount_value`, while
  PAY_AS_SIZE charges the canonical current reference-size price for the same powder/Base Liquid.
  It excludes addons, has null `covered_price_vnd`, and never creates surplus.
- For PRODUCT_DISCOUNT package creation, new clients send `eligible_menu_item_ids` (1–100 unique
  UUIDs) together with the legacy `menu_item_id` anchor. If both are present, the anchor must be in
  the array; legacy requests containing only `menu_item_id` remain valid. Package and owned-voucher
  responses add `eligible_menu_items` entries containing `menu_item_id`, `name`, `category`,
  `is_available`, and `is_seasonal`.
- ITEM: extras only, matches `menu_item_id`, makes one unit free at its current server price,
  has no surplus, and cannot be redeemed outside an order. A target price change does not change
  eligibility or coverage; target soft-delete follows PRODUCT refund policy.
- PRODUCT: match `menu_item_id` only. Apply one voucher to one drink unit. Limit
  `covered_price_vnd` to base + powder + milk + Premium Latte; never spill credit into addons.
  Compute the package snapshot from those drink components only; included addon IDs are
  descriptive and never expand coverage.
- The PRODUCT “Dùng ngay” cart flow resolves the voucher Base Liquid against the item's current
  default/allow-list and includes the same Latte cost or Fusion swap delta as normal add-to-cart.
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
- COUNTER CASH orders are created as `COMPLETED` and redeem applied vouchers as `OFFLINE` in the
  creation transaction. COUNTER BANK_TRANSFER orders reserve vouchers at creation and redeem them
  as `OFFLINE` only when payment is confirmed.

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
| `voucher_refund` | Unusable points-exchange voucher → exact immutable purchase-points refund |
| `reversed_by_admin` | Admin reverses a manual adjustment |
| `registration_bonus` | New customer registration bonus |
