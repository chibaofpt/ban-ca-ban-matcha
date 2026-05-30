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
- Top bar: logo + username + logout button
- Bottom tab bar: tabs by role (see table below)
- Content area in between, full scroll. No sidebar.

| Role | Tabs |
|---|---|
| STAFF | Tạo Order / Quét QR / Đơn hàng |
| ADMIN | Tạo Order / Quét QR / Đơn hàng / Sản phẩm / Điểm & Voucher |

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
| `user` | Pre-fill customer phone into order form |

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

> Managed within `/admin/menu` or as a sub-section. Uses `PowderForm.tsx`.

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
