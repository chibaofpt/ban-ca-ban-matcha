import { validateRunId } from "../core.mjs";
import { prerequisite } from "../errors.mjs";
import { quoteLine, quoteOrder } from "../oracle.mjs";

const CASE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_LINE_QUANTITY = 10;
const MAX_ORDER_QUANTITY = 20;

/** @typedef {{id: string, qr_token: string, voucher_type: string, [field: string]: unknown}} VoucherSelection */
/** @typedef {{menu_item_id: string, size?: string, quantity: number, addon_option_ids: Array<{option_id: string, quantity: number}>, selected_powder_id?: string, selected_base_liquid_id?: string}} LineSelection */
/** @typedef {{items: Array<Record<string, unknown>>, powders: Array<Record<string, unknown>>, liquids: Array<Record<string, unknown>>, defaults: Array<Record<string, unknown>>, addonGroups: Array<Record<string, unknown>>, fingerprint?: string, apiMenu?: object}} JourneyCatalog */
/** @typedef {{request: (path: string, options?: {method?: string, body?: Record<string, unknown>, mutation?: boolean, timeoutMs?: number}) => Promise<{ok?: boolean, status: number, body?: unknown, recovered?: boolean}>}} JourneyApi */
/** @typedef {{api: JourneyApi, name?: string, sessionId?: string, refreshToken?: string}} JourneyActor */
/** @typedef {Pick<ReturnType<typeof import('../journal.mjs').createJournal>, 'recordIntent'|'recordOutcome'>} JourneyJournal */

/** Return the exact audit marker supported by customer order notes. */
export function orderMarker(runId, caseId) {
  validateRunId(runId);
  if (!CASE_ID.test(caseId)) throw new Error("Invalid smoke case id");
  return `[STAGING:${runId}:${caseId}]`;
}

function highestPricedLatte(catalog) {
  const candidates = [];
  for (const item of catalog.items) {
    if (!item.is_available || item.category !== "latte") continue;
    for (const size of item.sizes ?? []) {
      if (size.base_price_vnd == null) continue;
      try {
        const input = { menu_item_id: item.id, size: size.size, quantity: 1, addon_option_ids: [] };
        const quote = quoteLine(catalog, input);
        candidates.push({ input, quote, unitPrice: quote.drink + quote.addons });
      } catch {
        // A smoke line only needs one fully configured current Latte.
      }
    }
  }
  candidates.sort((left, right) => right.unitPrice - left.unitPrice
    || String(left.input.menu_item_id).localeCompare(String(right.input.menu_item_id))
    || String(left.input.size).localeCompare(String(right.input.size)));
  prerequisite(candidates[0]?.unitPrice > 0, "SMOKE_LATTE_CONFIGURATION_MISSING");
  return candidates[0];
}

function requiredSubtotal(voucher) {
  if (!voucher) return 0;
  prerequisite(voucher.voucher_type === "DISCOUNT" && voucher.qr_token, "SMOKE_DISCOUNT_VOUCHER_INVALID");
  const threshold = Math.max(0, voucher.min_order_vnd ?? 0);
  if (voucher.discount_type === "FIXED") {
    prerequisite(Number.isSafeInteger(voucher.discount_value) && voucher.discount_value > 0,
      "SMOKE_DISCOUNT_VALUE_INVALID");
    return threshold;
  }
  prerequisite(voucher.discount_type === "PERCENT"
    && Number.isFinite(voucher.discount_value) && voucher.discount_value > 0,
  "SMOKE_DISCOUNT_VALUE_INVALID");
  return Math.max(threshold, Math.ceil(100_000 / voucher.discount_value));
}

/** Build one deterministic pickup case from the frozen staging catalog.
 * @param {{catalog: JourneyCatalog, runId: string, caseId: string, voucher?: VoucherSelection|null, lineInput?: LineSelection|null}} options
 */
export function buildPickupCase({ catalog, runId, caseId, voucher = null, lineInput = null }) {
  const marker = orderMarker(runId, caseId);
  const selected = lineInput ? (() => {
    const quote = quoteLine(catalog, lineInput);
    return { input: lineInput, quote, unitPrice: quote.drink + quote.addons };
  })() : highestPricedLatte(catalog);
  const isDiscount = voucher?.voucher_type === "DISCOUNT";
  const quantity = Math.max(1, Math.ceil(requiredSubtotal(isDiscount ? voucher : null) / selected.unitPrice));
  prerequisite(quantity <= MAX_ORDER_QUANTITY, "SMOKE_DISCOUNT_THRESHOLD_TOO_HIGH");
  const items = [];
  for (let remaining = quantity; remaining > 0; remaining -= MAX_LINE_QUANTITY) {
    const lineQuantity = Math.min(MAX_LINE_QUANTITY, remaining);
    items.push({
      ...selected.input,
      quantity: lineQuantity,
      sweetness: "FULL",
      ice_option: "NORMAL",
      coldwhisk: false,
      note: marker,
      ...(selected.quote.liquidId ? { selected_base_liquid_id: selected.quote.liquidId } : {}),
      ...(catalog.items.find(item => item.id === selected.input.menu_item_id)?.category === "fusion"
        ? { selected_powder_id: selected.quote.powderId } : {}),
      client_price_vnd: selected.unitPrice,
    });
  }
  const payload = {
    order_type: "PICKUP",
    items,
    discount_voucher_ids: isDiscount ? [voucher.qr_token] : [],
    note: marker,
  };
  if (voucher && !isDiscount) {
    prerequisite(["PRODUCT", "ITEM", "PRODUCT_DISCOUNT", "ADDON"].includes(voucher.voucher_type), "FULL_VOUCHER_TYPE_UNSUPPORTED");
    const scopes = voucher.voucher_type === "PRODUCT_DISCOUNT" && voucher.menuItemScopes?.length ? voucher.menuItemScopes.map(scope => scope.menu_item_id)
      : [voucher.menu_item_id];
    if (voucher.voucher_type !== "ADDON") prerequisite(scopes.includes(items[0].menu_item_id), "FULL_VOUCHER_TARGET_MISSING");
    if (voucher.voucher_type === "PRODUCT_DISCOUNT") {
      prerequisite(voucher.eligible_sizes?.includes(items[0].size), "FULL_VOUCHER_SIZE_INELIGIBLE");
    }
    if (voucher.voucher_type === "ADDON") {
      const group = catalog.addonGroups.find(group => group.options.some(option => option.id === voucher.addon_option_id));
      const option = group?.options.find(option => option.id === voucher.addon_option_id);
      prerequisite(group?.is_active !== false && option?.is_active !== false && option?.gram_value == null
        && items[0].addon_option_ids.some(selected => selected.option_id === voucher.addon_option_id), "FULL_ADDON_INELIGIBLE");
      items[0].addon_voucher_ids = [{ voucher_id: voucher.qr_token, addon_option_id: voucher.addon_option_id }];
    } else {
      const field = voucher.voucher_type === "ITEM" ? "item_voucher_id" : "product_voucher_id";
      items[0][field] = voucher.qr_token;
    }
  }
  const expected = quoteOrder(catalog, payload, voucher ? [voucher] : []);
  if (voucher && !isDiscount) items[0].client_price_vnd -= expected.item_discount_vnd;
  if (voucher) prerequisite(expected.total_voucher_discount_vnd + expected.item_discount_vnd > 0,
    "SMOKE_DISCOUNT_HAS_NO_BENEFIT");
  return { marker, payload, expected, catalogFingerprint: catalog.fingerprint };
}
