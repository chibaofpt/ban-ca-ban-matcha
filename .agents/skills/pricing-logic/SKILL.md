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
