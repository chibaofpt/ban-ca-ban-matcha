---
name: pricing-logic
description: Define canonical drink, powder, Base Liquid, addon, extras, rounding, and checkout price-validation rules.
---

# Pricing Logic Skill

> This skill is the **single source of truth** for all pricing rules.
> `src/utils/pricing.ts` = pure functions. `lib/pricing.ts` = DB wrapper. Never duplicate logic between them.

---

Follow the discovery and resource-routing rules in [AGENTS.md](../../../AGENTS.md).

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
Premium_Latte[size] = BaseLatte[selected_powder][size] − BaseLatte[original_powder][size]
```
- Looked up via `matcha_powder.reference_latte_item_id` → the Latte item that anchors this powder's price.
- The original powder is `menu_items.default_powder_id`; it remains the pricing anchor while inactive.
  A selected replacement is a serving default, not a new price anchor: it still contributes its premium
  versus the original. Read the current Latte base prices, including inactive anchors; never freeze them
  at the time of replacement. `calcPremiumLatte` is the shared premium calculation.
- Powder swap display is the difference between the two rounded drink prices at the same size and
  Base Liquid, relative to the current serving default. Extra Matcha uses the selected powder separately.
- If `reference_latte_item_id IS NULL` → `Premium_Latte = 0` (safe fallback, favors customer).
- Resolve all pricing data needed by the order before the item loop; do not fetch pricing inputs per item.
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

Cart money display conversion is owned by [cart UI](../../../docs/specs/cart.md#đơn-vị-tiền-hiển-thị-trong-cart);
it does not change these VND pricing rules or the loyalty point conversion.

## Price Component Boundaries for Vouchers

Keep drink and addon prices separate when passing data to the order voucher calculator:

```text
drink_price_vnd = base + powder + milk + Premium_Latte (when applicable)
addons_price_vnd = sum(addon unit price × quantity)
```

- Apply PRODUCT `covered_price_vnd` to `drink_price_vnd` only. Never spill PRODUCT credit
  into `addons_price_vnd`.
- When creating a multi-target PRODUCT voucher package, snapshot a separate immutable `covered_price_vnd` on every target scope from that target's size, powder, and Base Liquid; exclude all selected or included addons. Customization later uses that selected target's credit.
- Apply an ADDON voucher to one unit of the customer-selected option from its explicit scope only; resolve that option's current fixed price server-side and never apply it to Extra Matcha.
- Price `extras` directly from `menu_items.unit_price_vnd`; do not run drink recipe pricing.
- ITEM vouchers cover one matching extras unit at its current server price and create no surplus.
- BUNDLE reference prices are never admin-entered. Resolve stored default powder/Base Liquid
  snapshots through this canonical calculator at checkout; exclude addons and charge only the
  positive difference between actual reward drink price and baseline.
  Live availability may select an explicit serving replacement for the returned rule, but baseline
  pricing must still receive the persisted configuration snapshot. A Fusion baseline powder uses
  its premium versus the Fusion original; availability projection never rewrites that price input.
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
- Fusion uses `menu_items.default_base_liquid_id`; new Fusion items require an active default.
  An edit requires the referenced row to still exist but may retain or select an inactive default.
  A legacy unconfigured Fusion contributes no Base Liquid delta.
- Effective volume is `menu_item_sizes.base_liquid_ml ?? default_size_config[size].milk_ml`.
- Persist that resolved volume to `order_items.base_liquid_ml` at order time. Historical consumption
  must use the immutable snapshot; current recipe fallback is permitted only for pre-migration null rows.
- Allowed swaps come from `menu_item_allowed_base_liquid`; the default is always implicitly allowed.
  Admin edits may retain inactive existing rows; public selectors continue to expose active options only.
- Frontend and server calculate swap delta as `(selected.price_per_ml - default.price_per_ml) × effective_ml`; Fusion may increase or decrease before the final single rounding step.
- API naming, compatibility aliases and response fields belong to [API.md](../../../API.md).
  The client computes display prices from canonical pricing inputs rather than a precomputed price.
- Hide the selector when default + active allowed options contains at most one entry.

---

## Addon Pricing

- `addon_options.price_vnd` is global — changing it affects all items immediately.
- Every addon group is opt-in. No selection is the canonical zero state; do not create zero-value
  sentinel/default options.
- Active addon groups are shared catalog data rather than repeated per menu item; see
  [API.md](../../../API.md) for the response shape.
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
- **Fusion original powder**: `default_powder_id` is required for creation and the merged state after
  an edit. It cannot be cleared. A new original selection must be active; an unchanged inactive original
  remains valid when an active replacement is configured. Changing the original clears its replacement.
- Enabling a Fusion requires its original and active serving default to resolve, including
  availability-only updates. Reject an invalid configuration before writes and recheck in the
  transaction; disabling an invalid Fusion remains permitted for maintenance.
- **Fusion serving default**: use the active original, otherwise the explicitly configured active
  `replacement_powder_id`. Missing original or unavailable replacement makes the configuration
  unavailable; never select another powder by name, cost, or allow-list order.
- **Availability transition**: disabling a powder or its anchored Latte requires explicit replacements
  for all Fusion items whose original or replacement is that powder, including inactive Fusion items.
  Candidates may be any other active powder. Missing, duplicate, extra, self or inactive selections
  reject before writes. Persist the pair availability and replacements in one transaction.
- A full powder edit that changes its Latte anchor synchronizes only the resulting reference.
  The detached Latte retains its sale status. An omitted availability preserves the powder status;
  validate required replacements before any configuration write in the transaction.
- Enabling either side enables the pair and clears replacements only on Fusion items whose original
  is that powder. Preserve every Fusion item's sale status. Successive replacements keep one direct
  reference and the original anchor; enabling an intermediate replacement never resets another root.
- The serving default is implicitly orderable during its replacement lifetime without changing the
  permanent `fusion_allowed_powder` list. Existing cart selections must remain active and be either
  the current serving default or permanently allowed; require re-selection otherwise.
- Public `allowed_powder_ids` only includes powders with `is_available = true`. Admin responses
  preserve every configured powder ID, including inactive powders; Admin edits require the row
  to exist but do not require it to be available.
- If `fusion_allowed_powder` list is empty → lock to default, frontend hides swap UI.

---

## Price Validation at Order Submit

- `client_price_vnd` is **required** per item. Missing → `VALIDATION_ERROR`.
- Server recomputes every item price from DB inside `prisma.$transaction()`.
- Any mismatch → **reject entire order** with `PRICE_CHANGED` error.
- The error envelope and conflict DTO belong to [API.md](../../../API.md).

---

## System Config

- `default_size_config`: always exactly 3 rows (SMALL, MEDIUM, LARGE). Admin-editable.
- ⚠️ Changes apply **globally and immediately** to all computed prices across all items.
- Seed values: SMALL=3.5g/130ml, MEDIUM=4.5g/200ml, LARGE=8.0g/300ml.
