import { beforeEach, describe, expect, it } from "vitest";
import type { AddonGroup } from "@/src/lib/types/menu";
import type { BundleCartDraftCommit, CartItem } from "@/src/lib/types/cart";
import { useCartStore } from "@/src/lib/store/cartStore";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";
import { buildBundleCartDraft, validateBundleCartDraft, type BundleCartDraftResult, type BundleDraftSlot } from "@/src/lib/utils/bundleCartDraft";
import type { BundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";
import type { BundleBenefitScaling, BundleVoucherSummary } from "@/src/lib/utils/bundleVoucher";
import type { BundleAddonRewardInput } from "@/src/lib/utils/bundleAddonReward";

const ADDON = "addon-fixed";

const addonGroup: AddonGroup = {
  id: "group-fixed",
  name: "Topping",
  image_url: null,
  sort_order: 1,
  max_select: 1,
  is_dynamic_gram: false,
  options: [{ id: ADDON, label: "Hạt sen", image_url: null, price_vnd: 10_000, gram_value: null, sort_order: 1 }],
};

interface ScalingCase {
  name: string;
  scaling: BundleBenefitScaling;
  buyQuantity: number;
  rewardQuantity: number;
  qualifierQuantity: number;
  recipientQuantity: number;
  maxApplications: number;
  maxRewardUnits: number | null;
}

const cases: ScalingCase[] = [
  { name: "PER_BUNDLE buy1/Y2", scaling: "PER_BUNDLE", buyQuantity: 1, rewardQuantity: 2, qualifierQuantity: 1, recipientQuantity: 2, maxApplications: 1, maxRewardUnits: null },
  { name: "ONCE Y3", scaling: "ONCE_PER_ORDER", buyQuantity: 2, rewardQuantity: 3, qualifierQuantity: 2, recipientQuantity: 3, maxApplications: 1, maxRewardUnits: null },
  { name: "PER_ITEM N3/Y2", scaling: "PER_QUALIFYING_ITEM", buyQuantity: 1, rewardQuantity: 2, qualifierQuantity: 3, recipientQuantity: 6, maxApplications: 3, maxRewardUnits: null },
  { name: "PER_ITEM cap3", scaling: "PER_QUALIFYING_ITEM", buyQuantity: 1, rewardQuantity: 2, qualifierQuantity: 3, recipientQuantity: 3, maxApplications: 3, maxRewardUnits: 3 },
];

function config(): BundleItemConfig {
  return {
    menuItemId: "drink-1",
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
    selectedOptionIds: [],
    unitPriceVnd: 45_000,
    addonsCost: 0,
    addonPrices: {},
    addonMetadata: {},
  };
}

function item(cartId: string, quantity: number): CartItem {
  return {
    cartId,
    menuItemId: "drink-1",
    name: "Matcha",
    category: "latte",
    imageUrl: null,
    size: "MEDIUM",
    unitPrice: 45_000,
    quantity,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "Ghi chú",
    selectedOptionIds: [],
    addonsPrice: 0,
    addonPrices: {},
    clientPriceVnd: 45_000,
    originalClientPriceVnd: 45_000,
  };
}

function summary(testCase: ScalingCase): BundleVoucherSummary {
  return {
    qr_token: `bundle-${testCase.name}`,
    buy_quantity: testCase.buyQuantity,
    reward_quantity: testCase.rewardQuantity,
    reward_kind: "ADDON",
    reward_mode: "ALLOWED_SCOPE",
    benefit_scaling: testCase.scaling,
    max_applications_per_order: testCase.maxApplications,
    max_reward_units_per_order: testCase.maxRewardUnits,
    reward_addon_option_ids: [ADDON],
    eligible_products: [{ menu_item_id: "drink-1", allowed_sizes: ["MEDIUM"] }],
    reward_products: [],
    min_order_vnd: null,
  };
}

function addonReward(testCase: ScalingCase): BundleAddonRewardInput {
  return {
    optionId: ADDON,
    allowedOptionIds: [ADDON],
    recipientSlotIndexes: Array.from({ length: testCase.recipientQuantity }, (_, index) => index),
    benefitScaling: testCase.scaling,
    buyQuantity: testCase.buyQuantity,
    rewardQuantity: testCase.rewardQuantity,
    maxApplicationsPerOrder: testCase.maxApplications,
    maxRewardUnitsPerOrder: testCase.maxRewardUnits,
    addonGroups: [addonGroup],
  };
}

function buildCandidate(testCase: ScalingCase): BundleCartDraftResult {
  const qualifierSlots: BundleDraftSlot[] = Array.from({ length: testCase.qualifierQuantity }, (_, sourceUnitIndex) => ({
    role: "qualifier",
    config: config(),
    sourceCartId: "qualifier-line",
    sourceUnitIndex,
  }));
  const recipientSlots = Array.from({ length: testCase.recipientQuantity }, (_, sourceUnitIndex) => ({
    config: config(),
    sourceCartId: "recipient-line",
    sourceUnitIndex,
  }));
  let generatedId = 0;
  return buildBundleCartDraft({
    items: [item("qualifier-line", testCase.qualifierQuantity), item("recipient-line", testCase.recipientQuantity)],
    voucher_qr_token: summary(testCase).qr_token,
    qualifierSlots,
    rewardSlots: [],
    rewardKind: "ADDON",
    rewardQuantity: testCase.rewardQuantity,
    addonReward: addonReward(testCase),
    addonRecipientSlots: recipientSlots,
    createCartId: () => `generated-${generatedId++}`,
  });
}

function commitBoth(testCase: ScalingCase, candidate: BundleCartDraftResult): { customer: BundleCartDraftCommit; staff: BundleCartDraftCommit } {
  const voucher = summary(testCase);
  const customerValidation = validateBundleCartDraft({ voucher, candidate, ownerKey: "customer:qr-1" });
  const staffValidation = validateBundleCartDraft({ voucher, candidate, ownerKey: "staff:qr-1" });
  if (!customerValidation.ok) throw new Error(customerValidation.error);
  if (!staffValidation.ok) throw new Error(staffValidation.error);
  useCartStore.getState().commitBundleCartDraft(customerValidation.draft);
  useStaffCartStore.getState().commitBundleCartDraft(staffValidation.draft);
  return { customer: customerValidation.draft, staff: staffValidation.draft };
}

function expectCommittedDraft(draft: BundleCartDraftCommit, expectedRewardQuantity: number): void {
  expect(draft.application.status).toBe("READY");
  expect(draft.application.reward_allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(expectedRewardQuantity);
  expect(draft.application.created_reward_effects.reduce((sum, effect) => sum + (effect.kind === "ADDON" ? effect.quantity : 0), 0)).toBe(expectedRewardQuantity);
  expect(new Set(draft.application.reward_allocations.map((allocation) => allocation.client_line_id)).size).toBe(expectedRewardQuantity);
  expect(draft.application.reward_allocations.every((allocation) => allocation.quantity === 1 && allocation.addon_option_id === ADDON)).toBe(true);
  const rewardedItems = draft.items.filter((entry) => entry.selectedOptionIds.includes(ADDON));
  expect(rewardedItems).toHaveLength(expectedRewardQuantity);
  for (const rewardedItem of rewardedItems) {
    expect(rewardedItem.addonsPrice).toBe(10_000);
    expect(rewardedItem.unitPrice).toBe(55_000);
    expect(rewardedItem.clientPriceVnd).toBe(55_000);
    expect(rewardedItem.originalClientPriceVnd).toBe(55_000);
    expect(rewardedItem.addonPrices[ADDON]).toBe(10_000);
    expect(rewardedItem.addonMetadata?.[ADDON]?.gram_value).toBeNull();
  }
}

describe("BUNDLE addon scaling through draft, validation, and real stores", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], bundleApplications: [] });
    useStaffCartStore.setState({ items: [], bundleApplications: [] });
  });

  it.each(cases)("$name materializes exact rewards and commits customer/staff identity", (testCase) => {
    const candidate = buildCandidate(testCase);
    const expectedRewardQuantity = testCase.recipientQuantity;
    const committed = commitBoth(testCase, candidate);
    expectCommittedDraft(committed.customer, expectedRewardQuantity);
    expectCommittedDraft(committed.staff, expectedRewardQuantity);
    expect(useCartStore.getState().items).toEqual(committed.customer.items);
    expect(useCartStore.getState().bundleApplications).toEqual([committed.customer.application]);
    expect(useStaffCartStore.getState().items).toEqual(committed.staff.items);
    expect(useStaffCartStore.getState().bundleApplications).toEqual([committed.staff.application]);
  });
});
