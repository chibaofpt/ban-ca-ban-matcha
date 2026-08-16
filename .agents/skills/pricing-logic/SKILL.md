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
| `app/api/menu/route.ts` | SERVER | Returns effective per-size Base Liquid volume, item defaults/allowed IDs, global catalog, and addon groups |

> Frontend needs 2 API calls on app load: `GET /api/menu` + `GET /api/powders`. Both cached in state, not refetched per interaction.

---

## Price Formulas

### Latte
```
ceil(
  base_price_vnd[size]
  + effective_gram[size] × powder.price_per_gram
  + effective_base_liquid_ml[size] × selected_base_liquid.price_per_ml
, 1000)
```

### Fusion
```
ceil(
  base_price_vnd[size]
  + effective_gram[size] × selected_powder.price_per_gram
  + Premium_Latte[size]
  + effective_base_liquid_ml[size] × (selected_base_liquid.price_per_ml - item_default_base_liquid.price_per_ml)
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

Use these separate voucher rounding rules:

- Require FIXED DISCOUNT values to be integer multiples of 1,000 VND.
- Round PERCENT DISCOUNT amounts down to the nearest 1,000 VND.
- Do not apply price-ceiling rules to loyalty point conversion; use `Math.floor(vnd / 10000)`.

## Price Component Boundaries for Vouchers

Keep drink and addon prices separate when passing data to the order voucher calculator:

```text
drink_price_vnd = base + powder + milk + Premium_Latte (when applicable)
addons_price_vnd = sum(addon unit price × quantity)
```

- Apply PRODUCT `covered_price_vnd` to `drink_price_vnd` only. Never spill PRODUCT credit
  into `addons_price_vnd`.
- When creating a PRODUCT voucher package, snapshot `covered_price_vnd` from the selected
  drink configuration only; exclude all selected or included addons.
- Apply an ADDON voucher to one unit of its matching addon only; never to Extra Matcha.
- Price `extras` directly from `menu_items.unit_price_vnd`; do not run drink recipe pricing.
- ITEM vouchers cover one matching extras unit at its current server price and create no surplus.
- Preserve gross prices as order snapshots and store reductions separately.
- Let one shared order calculator consume resolved drink/addon prices for both customer and
  staff orders. Do not repeat voucher arithmetic in cart state or API routes.

---

## Gram Resolution — 3-Level COALESCE

For each item + size, resolve grams in this order:

1. `menu_item.custom_powder_grams[size]` — per-item override (JSON field, keys: `"SMALL" | "MEDIUM" | "LARGE"`)
2. `powder_size_config[powder_id][size]` — per-powder exception (currently Meyumi + Hana = 6 rows)
3. `default_size_config[size].powder_gram` — system-wide fallback (3 rows: SMALL/MEDIUM/LARGE, admin-editable)

> First non-null wins. If (1) is set, skip (2) and (3).

---

## Base Liquid Pricing

- The physical `milk_type` table is the shared Base Liquid catalog; do not add a `kind` field.
- Latte uses the global `is_default = true` row. Admin is responsible for allowing milk entries only.
- Fusion uses `menu_items.default_base_liquid_id`; new/edited Fusion items require it. A legacy unconfigured Fusion contributes no Base Liquid delta.
- Effective volume is `menu_item_sizes.base_liquid_ml ?? default_size_config[size].milk_ml`.
- Persist that resolved volume to `order_items.base_liquid_ml` at order time. Historical consumption
  must use the immutable snapshot; current recipe fallback is permitted only for pre-migration null rows.
- Allowed swaps come from `menu_item_allowed_base_liquid`; the default is always implicitly allowed.
- Frontend and server calculate swap delta as `(selected.price_per_ml - default.price_per_ml) × effective_ml`; Fusion may increase or decrease before the final single rounding step.
- Active catalog rows are returned once as `MenuData.base_liquids`; `milk_types` remains a compatibility alias.
- No pre-computed price field in API responses — frontend computes all prices client-side.
- Hide the selector when default + active allowed options contains at most one entry.

---

## Addon Pricing

- `addon_options.price_vnd` is global — changing it affects all items immediately.
- Every addon group is opt-in. No selection is the canonical zero state; do not create zero-value
  sentinel/default options.
- Active addon groups are returned once as `MenuData.addon_groups`, never duplicated inside each menu item.
- Only active options are public and orderable. Retire referenced options with `is_active = false`.
- **Extra matcha** is special:
  - `price_vnd = 0` in DB (placeholder).
  - Active options have positive `gram_value`; the legacy 0g row remains inactive during rollout.
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
      { "menu_item_id": "...", "name": "...", "size": "SMALL", "client_price_vnd": 45000, "server_price_vnd": 46000 }
    ]
  }
}
```

---

## System Config

- `default_size_config`: always exactly 3 rows (SMALL, MEDIUM, LARGE). Admin-editable.
- ⚠️ Changes apply **globally and immediately** to all computed prices across all items.
- Seed values: SMALL=3.5g/130ml, MEDIUM=4.5g/200ml, LARGE=8.0g/300ml.
