import { describe, expect, it } from "vitest";
import type { AddonGroup } from "@/src/lib/types/menu";
import type { CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import type { BundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";
import { buildBundleCartDraft, validateBundleCartDraft, type BundleCartDraftResult } from "@/src/lib/utils/bundleCartDraft";
import { resolveBundleSelectionSiblings, type BundleVoucherSummary } from "@/src/lib/utils/bundleVoucher";
import type { BundleAddonRewardInput } from "@/src/lib/utils/bundleAddonReward";

const CURRENT = "bundle-current";
const SIBLING = "bundle-sibling";
const ADDON_A = "addon-a";
const ADDON_B = "addon-b";

const addonGroup: AddonGroup = {
  id: "group-two",
  name: "Topping",
  image_url: null,
  sort_order: 1,
  max_select: 2,
  is_dynamic_gram: false,
  options: [
    { id: ADDON_A, label: "A", image_url: null, price_vnd: 10_000, gram_value: null, sort_order: 1 },
    { id: ADDON_B, label: "B", image_url: null, price_vnd: 12_000, gram_value: null, sort_order: 2 },
  ],
};

const summary = (token: string, addonId: string): BundleVoucherSummary => ({
  qr_token: token,
  buy_quantity: 1,
  reward_quantity: 1,
  reward_kind: "ADDON",
  reward_mode: "ALLOWED_SCOPE",
  benefit_scaling: "PER_BUNDLE",
  max_applications_per_order: 1,
  max_reward_units_per_order: null,
  reward_addon_option_ids: [addonId],
  eligible_products: [{ menu_item_id: "drink", allowed_sizes: ["MEDIUM"] }],
  reward_products: [],
  min_order_vnd: null,
});

function item(cartId: string, selectedOptionIds: string[] = [], addonPrices: Record<string, number> = {}): CartItem {
  return {
    cartId,
    menuItemId: "drink",
    name: "Matcha",
    category: "latte",
    imageUrl: null,
    size: "MEDIUM",
    unitPrice: 45_000 + Object.values(addonPrices).reduce((sum, price) => sum + price, 0),
    quantity: 1,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "Ghi chú",
    selectedOptionIds,
    addonsPrice: Object.values(addonPrices).reduce((sum, price) => sum + price, 0),
    addonPrices,
    addonMetadata: Object.fromEntries(selectedOptionIds.map((id) => [id, { addon_group_id: addonGroup.id, max_select: 2, gram_value: null, is_active: true, is_deleted: false, is_dynamic_gram: false }])),
    clientPriceVnd: 45_000 + Object.values(addonPrices).reduce((sum, price) => sum + price, 0),
    originalClientPriceVnd: 45_000 + Object.values(addonPrices).reduce((sum, price) => sum + price, 0),
  };
}

function config(selectedOptionIds: string[] = [], addonPrices: Record<string, number> = {}): BundleItemConfig {
  return {
    menuItemId: "drink",
    name: "Matcha",
    category: "latte",
    imageUrl: null,
    size: "MEDIUM",
    powderId: null,
    milkTypeId: null,
    baseLiquidId: null,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    selectedOptionIds,
    unitPriceVnd: 45_000,
    addonsCost: Object.values(addonPrices).reduce((sum, price) => sum + price, 0),
    addonPrices,
    addonMetadata: Object.fromEntries(selectedOptionIds.map((id) => [id, { addon_group_id: addonGroup.id, max_select: 2, gram_value: null, is_active: true, is_deleted: false, is_dynamic_gram: false }])),
  };
}

const addonReward = (optionId: string): BundleAddonRewardInput => ({
  optionId,
  allowedOptionIds: [optionId],
  recipientSlotIndexes: [0],
  benefitScaling: "PER_BUNDLE",
  buyQuantity: 1,
  rewardQuantity: 1,
  maxApplicationsPerOrder: 1,
  maxRewardUnitsPerOrder: null,
  addonGroups: [addonGroup],
});

function previousApplication(token: string, optionId: string, qualifierLine: string): CartBundleApplication {
  return {
    voucher_qr_token: token,
    owner_key: "customer:qr-1",
    qualifier_allocations: [{ client_line_id: qualifierLine, quantity: 1 }],
    reward_allocations: [{ client_line_id: "recipient", addon_option_id: optionId, quantity: 1 }],
    created_reward_effects: [],
    status: "READY",
  };
}

function candidate(): BundleCartDraftResult {
  let generatedId = 0;
  return buildBundleCartDraft({
    items: [item("current-qualifier"), item("sibling-qualifier"), item("recipient", [ADDON_B], { [ADDON_B]: 12_000 })],
    voucher_qr_token: CURRENT,
    qualifierSlots: [{ role: "qualifier", config: config(), sourceCartId: "current-qualifier", sourceUnitIndex: 0 }],
    rewardSlots: [],
    rewardKind: "ADDON",
    rewardQuantity: 1,
    addonReward: addonReward(ADDON_A),
    addonRecipientSlots: [{ config: config([ADDON_B], { [ADDON_B]: 12_000 }), sourceCartId: "recipient", sourceUnitIndex: 0 }],
    createCartId: () => `generated-${generatedId++}`,
  });
}

describe("BUNDLE sibling validation", () => {
  it("resolves siblings by token, excludes the edited token, and fails unresolved state", () => {
    const current = previousApplication(CURRENT, ADDON_A, "current-qualifier");
    const sibling = previousApplication(SIBLING, ADDON_B, "sibling-qualifier");
    const resolved = resolveBundleSelectionSiblings({
      current_qr_token: CURRENT,
      applications: [current, sibling],
      summaries: [summary(SIBLING, ADDON_B)],
    });
    expect(resolved).toEqual({ ok: true, siblings: [{
      voucher_qr_token: SIBLING,
      voucher: summary(SIBLING, ADDON_B),
      qualifier_allocations: sibling.qualifier_allocations,
      reward_allocations: sibling.reward_allocations,
    }] });
    const unresolved = resolveBundleSelectionSiblings({
      current_qr_token: CURRENT,
      applications: [current, sibling],
      summaries: [],
    });
    expect(unresolved.ok).toBe(false);
    expect(unresolved).toMatchObject({ error: expect.stringContaining("chưa thể kiểm tra") });
  });

  it("blocks customer and staff candidate when a sibling uses another addon option on the same recipient", () => {
    const sibling = previousApplication(SIBLING, ADDON_B, "sibling-qualifier");
    const resolved = resolveBundleSelectionSiblings({
      current_qr_token: CURRENT,
      applications: [previousApplication(CURRENT, ADDON_A, "current-qualifier"), sibling],
      summaries: [summary(SIBLING, ADDON_B)],
    });
    if (!resolved.ok) throw new Error(resolved.error);
    const currentCandidate = candidate();
    const customer = validateBundleCartDraft({ voucher: summary(CURRENT, ADDON_A), candidate: currentCandidate, ownerKey: "customer:qr-1", siblingApplications: resolved.siblings });
    const staff = validateBundleCartDraft({ voucher: summary(CURRENT, ADDON_A), candidate: currentCandidate, ownerKey: "staff:qr-1", siblingApplications: resolved.siblings });
    expect(customer).toMatchObject({ ok: false, error: expect.stringContaining("trùng") });
    expect(staff).toMatchObject({ ok: false, error: expect.stringContaining("trùng") });
  });
});
