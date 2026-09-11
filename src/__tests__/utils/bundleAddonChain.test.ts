import { beforeEach, describe, expect, it } from "vitest";
import type { AddonGroup } from "@/src/lib/types/menu";
import type { BundleCartDraftCommit, CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";
import type { BundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";
import { buildBundleCartDraft, validateBundleCartDraft } from "@/src/lib/utils/bundleCartDraft";
import { useCartStore } from "@/src/lib/store/cartStore";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";
import type { BundleAddonRewardInput } from "@/src/lib/utils/bundleAddonReward";
import type { BundleVoucherSummary } from "@/src/lib/utils/bundleVoucher";

const addonGroup: AddonGroup = {
  id: "reward-group",
  name: "Topping",
  image_url: null,
  sort_order: 1,
  max_select: 1,
  is_dynamic_gram: false,
  options: [
    { id: "addon-a", label: "A", image_url: null, price_vnd: 10_000, gram_value: null, sort_order: 1 },
    { id: "addon-b", label: "B", image_url: null, price_vnd: 12_000, gram_value: null, sort_order: 2 },
  ],
};
const paidAddonGroup: AddonGroup = {
  id: "paid-group",
  name: "Paid",
  image_url: null,
  sort_order: 2,
  max_select: 1,
  is_dynamic_gram: false,
  options: [{ id: "paid-addon", label: "Paid", image_url: null, price_vnd: 5_000, gram_value: null, sort_order: 1 }],
};

function item(cartId: string, quantity: number, selectedOptionIds: string[] = [], addonPrices: Record<string, number> = {}) {
  const addonsPrice = Object.values(addonPrices).reduce((sum, price) => sum + price, 0);
  return projectedCartLine({
    cartId,
    menuItemId: "latte-1",
    name: "Latte",
    category: "latte",
    imageUrl: null,
    size: "MEDIUM",
    unitPrice: 45_000 + addonsPrice,
    quantity,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "Giữ ghi chú",
    selectedOptionIds,
    addonsPrice,
    addonPrices,
    addonMetadata: Object.fromEntries(selectedOptionIds.map((id) => [id, {
      addon_group_id: id === "paid-addon" ? "paid-group" : "reward-group",
      max_select: 1,
      gram_value: null,
    }])),
    clientPriceVnd: 45_000 + addonsPrice,
    originalClientPriceVnd: 45_000 + addonsPrice,
  });
}

const config = (selectedOptionIds: string[], addonPrices: Record<string, number>): BundleItemConfig => ({
  menuItemId: "latte-1",
  name: "Latte",
  category: "latte",
  imageUrl: null,
  size: "MEDIUM",
  powderId: null,
  milkTypeId: "milk-1",
  baseLiquidId: "milk-1",
  sweetness: "QUARTER",
  iceOption: "NORMAL",
  coldwhisk: false,
  selectedOptionIds,
  unitPriceVnd: 45_000,
  addonsCost: Object.values(addonPrices).reduce((sum, price) => sum + price, 0),
  addonPrices,
  addonMetadata: Object.fromEntries(selectedOptionIds.map((id) => [id, {
    addon_group_id: id === "paid-addon" ? "paid-group" : "reward-group",
    max_select: 1,
    gram_value: null,
  }])),
});

function reward(recipientSlotIndexes: number[]): BundleAddonRewardInput {
  return {
    optionId: "addon-b",
    allowedOptionIds: ["addon-a", "addon-b"],
    recipientSlotIndexes,
    benefitScaling: "PER_BUNDLE",
    buyQuantity: 2,
    rewardQuantity: 1,
    maxApplicationsPerOrder: 1,
    maxRewardUnitsPerOrder: null,
    addonGroups: [addonGroup, paidAddonGroup],
  };
}

function previousApplication(ownerKey: string): CartBundleApplication {
  return {
    voucher_qr_token: "bundle-edit",
    owner_key: ownerKey,
    qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
    reward_allocations: [{ client_line_id: "line-1", addon_option_id: "addon-a", quantity: 1 }],
    created_reward_effects: [{ kind: "ADDON", client_line_id: "line-1", addon_option_id: "addon-a", quantity: 1 }],
  };
}

function buildEditDraft(ownerKey: string): BundleCartDraftCommit {
  const stale = item("line-1", 1, ["addon-a", "paid-addon"], { "addon-a": 10_000, "paid-addon": 5_000 });
  const recipient = item("line-2", 1);
  const secondQualifier = item("line-3", 1);
  const qualifierConfig = config(["paid-addon"], { "paid-addon": 5_000 });
  const recipientConfig = config([], {});
  const candidate = buildBundleCartDraft({
    items: [stale, recipient, secondQualifier],
    voucher_qr_token: "bundle-edit",
    qualifierSlots: [
      { role: "qualifier", config: qualifierConfig, sourceCartId: "line-1", sourceUnitIndex: 0 },
      { role: "qualifier", config: config([], {}), sourceCartId: "line-3", sourceUnitIndex: 0 },
    ],
    rewardSlots: [],
    addonRecipientSlots: [{ config: recipientConfig, sourceCartId: "line-2", sourceUnitIndex: 0 }],
    rewardKind: "ADDON",
    rewardQuantity: 1,
    addonReward: reward([0]),
    existingApplication: previousApplication(ownerKey),
  });
  return {
    items: candidate.items,
    application: {
      ...previousApplication(ownerKey),
      qualifier_allocations: candidate.qualifier_allocations,
      reward_allocations: candidate.reward_allocations,
      created_reward_effects: candidate.created_reward_effects,
    },
  };
}

function projected(items: CartItem[]) {
  return items.map((line) => {
    const ids = line.configuration.size === null ? [] : line.configuration.addonOptionIds;
    const addonPrices = Object.fromEntries(ids.map((id) => [id, id === "paid-addon" ? 5_000 : 12_000]));
    const addonsPrice = Object.values(addonPrices).reduce((sum, value) => sum + value, 0);
    return projectedCartLine({ ...line, size: line.configuration.size, selectedOptionIds: ids, addonPrices, addonsPrice, unitPrice: 45_000 + addonsPrice, originalClientPriceVnd: 45_000 + addonsPrice, clientPriceVnd: 45_000 + addonsPrice });
  });
}

function voucher(min_order_vnd: number): BundleVoucherSummary {
  return {
    qr_token: "bundle-edit",
    buy_quantity: 2,
    reward_quantity: 1,
    reward_kind: "ADDON",
    reward_mode: "ALLOWED_SCOPE",
    benefit_scaling: "PER_BUNDLE",
    max_applications_per_order: 1,
    max_reward_units_per_order: null,
    reward_addon_option_ids: ["addon-b"],
    eligible_products: [{ menu_item_id: "latte-1", allowed_sizes: ["MEDIUM"] }],
    reward_products: [],
    min_order_vnd,
  };
}

describe("BUNDLE addon edit chain", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], bundleApplications: [] });
    useStaffCartStore.setState({ items: [], bundleApplications: [] });
  });

  it("rebuilds addon A to B on a changed recipient and rejects a final subtotal below min order", () => {
    const draft = buildEditDraft("customer:qr");
    const firstLine = draft.items.find((entry) => entry.cartId === "line-1");
    const secondLine = draft.items.find((entry) => entry.cartId === "line-2");
    expect(firstLine?.configuration.size === null ? [] : firstLine?.configuration.addonOptionIds).toEqual(["paid-addon"]);
    expect(firstLine).not.toHaveProperty("bundleRewardVoucherToken");
    expect(secondLine?.configuration.size === null ? [] : secondLine?.configuration.addonOptionIds).toEqual(["addon-b"]);
    expect(draft.application.reward_allocations).toEqual([{ client_line_id: "line-2", addon_option_id: "addon-b", quantity: 1 }]);
    expect(draft.application.created_reward_effects).toEqual([{ kind: "ADDON", client_line_id: "line-2", addon_option_id: "addon-b", quantity: 1 }]);

    const candidate = {
      items: draft.items,
      qualifier_allocations: draft.application.qualifier_allocations,
      reward_allocations: draft.application.reward_allocations,
      created_reward_effects: draft.application.created_reward_effects,
      projectedItems: projected(draft.items),
    };
    const rejected = validateBundleCartDraft({ voucher: voucher(140_001), candidate, ownerKey: "customer:qr" });
    expect(rejected.ok).toBe(false);
    const accepted = validateBundleCartDraft({ voucher: voucher(140_000), candidate, ownerKey: "customer:qr" });
    expect(accepted.ok).toBe(true);
  });

  it("commits the validated customer candidate exactly once", () => {
    const draft = buildEditDraft("customer:qr");
    useCartStore.setState({ items: [item("line-1", 1)], bundleApplications: [previousApplication("customer:qr")] });
    useCartStore.getState().commitBundleCartDraft(draft);
    expect(useCartStore.getState().items).toEqual(draft.items);
    expect(useCartStore.getState().bundleApplications).toEqual([draft.application]);
  });

  it("rebuilds a changed addon on the same unit without restoring the stale generated choice", () => {
    const stale = item("line-1", 1, ["addon-a", "paid-addon"], { "addon-a": 10_000, "paid-addon": 5_000 });
    const candidate = buildBundleCartDraft({
      items: [stale, item("line-2", 1)],
      voucher_qr_token: "bundle-edit",
      qualifierSlots: [
        { role: "qualifier", config: config(["paid-addon"], { "paid-addon": 5_000 }), sourceCartId: "line-1", sourceUnitIndex: 0 },
        { role: "qualifier", config: config([], {}), sourceCartId: "line-2", sourceUnitIndex: 0 },
      ],
      rewardSlots: [],
      addonRecipientSlots: [{ config: config(["addon-a", "paid-addon"], { "addon-a": 10_000, "paid-addon": 5_000 }), sourceCartId: "line-1", sourceUnitIndex: 0 }],
      rewardKind: "ADDON",
      rewardQuantity: 1,
      addonReward: reward([0]),
      existingApplication: previousApplication("customer:qr"),
    });
    const line = candidate.items.find((entry) => entry.cartId === "line-1");
    expect(line?.configuration.size === null ? [] : line?.configuration.addonOptionIds).toEqual(["paid-addon", "addon-b"]);
    expect(candidate.created_reward_effects).toEqual([{ kind: "ADDON", client_line_id: "line-1", addon_option_id: "addon-b", quantity: 1 }]);
  });

  it("commits the validated staff candidate exactly once", () => {
    const draft = buildEditDraft("staff:customer-qr");
    useStaffCartStore.setState({ items: [item("line-1", 1)], bundleApplications: [previousApplication("staff:customer-qr")] });
    useStaffCartStore.getState().commitBundleCartDraft(draft);
    expect(useStaffCartStore.getState().items).toEqual(draft.items);
    expect(useStaffCartStore.getState().bundleApplications).toEqual([draft.application]);
  });
});
