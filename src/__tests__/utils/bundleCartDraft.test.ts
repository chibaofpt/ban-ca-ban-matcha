import { describe, expect, it } from "vitest";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";
import { buildBundleCartDraft, type BundleDraftSlot } from "@/src/lib/utils/bundleCartDraft";
import type { BundleAddonRewardInput } from "@/src/lib/utils/bundleAddonReward";
import type { AddonGroup } from "@/src/lib/types/menu";

const baseItem = (cartId: string, quantity = 3) => projectedCartLine({
  cartId,
  menuItemId: "latte-1",
  name: "Latte",
  category: "latte",
  imageUrl: null,
  size: "MEDIUM",
  unitPrice: 45_000,
  quantity,
  sweetness: "QUARTER",
  iceOption: "NORMAL",
  coldwhisk: false,
  note: "Không đá riêng",
  selectedOptionIds: ["topping-1"],
  addonsPrice: 10_000,
  addonPrices: { "topping-1": 10_000 },
  selectedBaseLiquidId: "milk-1",
  clientPriceVnd: 55_000,
  originalClientPriceVnd: 55_000,
});

const slot = (sourceUnitIndex: number): BundleDraftSlot => ({
  role: "qualifier",
  sourceCartId: "line-1",
  sourceUnitIndex,
  config: {
    menuItemId: "latte-1",
    name: "Latte",
    imageUrl: null,
    size: "MEDIUM",
    powderId: null,
    milkTypeId: "milk-1",
    baseLiquidId: "milk-1",
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    selectedOptionIds: ["topping-1"],
    unitPriceVnd: 45_000,
    addonsCost: 10_000,
    addonPrices: { "topping-1": 10_000 },
  },
});

const addonGroup: AddonGroup = {
  id: "group-1",
  name: "Topping",
  image_url: null,
  sort_order: 1,
  max_select: 1,
  is_dynamic_gram: false,
  options: [{ id: "reward-addon", label: "Topping", image_url: null, price_vnd: 12_000, gram_value: null, sort_order: 1 }],
};

const addonReward = (recipientSlotIndexes: number[]): BundleAddonRewardInput => ({
  optionId: "reward-addon",
  allowedOptionIds: ["reward-addon"],
  recipientSlotIndexes,
  benefitScaling: "PER_BUNDLE",
  buyQuantity: 2,
  rewardQuantity: 1,
  maxApplicationsPerOrder: 1,
  maxRewardUnitsPerOrder: null,
  addonGroups: [addonGroup],
});

describe("buildBundleCartDraft — BUNDLE atomic draft", () => {
  it("tách đúng một unit đã chọn và giữ phần còn lại cùng cấu hình", () => {
    const result = buildBundleCartDraft({
      items: [baseItem("line-1")],
      voucher_qr_token: "bundle-1",
      qualifierSlots: [slot(1)],
      rewardSlots: [],
      rewardKind: "PRODUCT",
      rewardQuantity: 1,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
    const qualifiedId = result.qualifier_allocations[0]?.client_line_id;
    const qualified = result.items.find((item) => item.cartId === qualifiedId);
    expect(qualified?.quantity).toBe(1);
    expect(result.items.find((item) => item.cartId !== qualifiedId)?.quantity).toBe(2);
    expect(qualified?.configuration.note).toBe("Không đá riêng");
    expect(qualified?.configuration.size === null ? [] : qualified?.configuration.addonOptionIds).toEqual(["topping-1"]);
    expect(qualified).not.toHaveProperty("sourceCartId");
    expect(qualified).not.toHaveProperty("sourceUnitIndex");
    expect(qualified).not.toHaveProperty("bundleQualifierVoucherToken");
  });

  it("giữ effect của reward line đã sinh khi mở lại bundle để chỉnh sửa", () => {
    const rewardSlot: BundleDraftSlot = {
      role: "reward",
      sourceCartId: "reward-line",
      sourceUnitIndex: 0,
      config: {
        ...slot(0).config,
      },
    };
    const result = buildBundleCartDraft({
      items: [baseItem("reward-line", 1)],
      voucher_qr_token: "bundle-1",
      qualifierSlots: [],
      rewardSlots: [rewardSlot],
      rewardKind: "PRODUCT",
      rewardQuantity: 1,
      existingApplication: {
        voucher_qr_token: "bundle-1",
        owner_key: "customer:qr",
        qualifier_allocations: [],
        reward_allocations: [{ client_line_id: "reward-line", quantity: 1 }],
        created_reward_effects: [{ kind: "LINE", client_line_id: "reward-line" }],
      },
    });

    expect(result.created_reward_effects).toEqual([{ kind: "LINE", client_line_id: "reward-line" }]);
  });

  it("removes this application's stale generated line before rebuilding the candidate", () => {
    const stale = baseItem("stale-reward", 1);
    const result = buildBundleCartDraft({
      items: [stale],
      voucher_qr_token: "bundle-edit",
      qualifierSlots: [{ ...slot(0), sourceCartId: undefined, sourceUnitIndex: undefined }],
      rewardSlots: [],
      rewardKind: "PRODUCT",
      rewardQuantity: 1,
      existingApplication: {
        voucher_qr_token: "bundle-edit",
        owner_key: "customer:qr",
        qualifier_allocations: [],
        reward_allocations: [{ client_line_id: "stale-reward", quantity: 1 }],
        created_reward_effects: [{ kind: "LINE", client_line_id: "stale-reward" }],
      },
      createCartId: (() => {
        let index = 0;
        return () => `generated-${index++}`;
      })(),
    });

    expect(result.items.some((entry) => entry.cartId === "stale-reward")).toBe(false);
    expect(result.created_reward_effects).toEqual([]);
  });

  it("supports an addon recipient on a separate eligible line and preserves paid selections", () => {
    const recipientSource = projectedCartLine({ ...baseItem("line-2", 1), selectedOptionIds: [], addonsPrice: 0, addonPrices: {}, clientPriceVnd: 45_000, originalClientPriceVnd: 45_000 });
    const qualifierConfig = { ...slot(0).config, selectedOptionIds: [], addonsCost: 0, addonPrices: {}, addonMetadata: {} };
    const recipientConfig = { ...qualifierConfig };
    const result = buildBundleCartDraft({
      items: [
        projectedCartLine({ ...baseItem("line-1", 2), selectedOptionIds: [], addonsPrice: 0, addonPrices: {}, clientPriceVnd: 45_000, originalClientPriceVnd: 45_000 }),
        recipientSource,
      ],
      voucher_qr_token: "bundle-pool",
      qualifierSlots: [
        { role: "qualifier", sourceCartId: "line-1", sourceUnitIndex: 0, config: qualifierConfig },
        { role: "qualifier", sourceCartId: "line-1", sourceUnitIndex: 1, config: qualifierConfig },
      ],
      rewardSlots: [],
      addonRecipientSlots: [{ config: recipientConfig, sourceCartId: "line-2", sourceUnitIndex: 0 }],
      rewardKind: "ADDON",
      rewardQuantity: 1,
      addonReward: addonReward([0]),
    });

    const recipientId = result.reward_allocations[0]?.client_line_id;
    const recipientLine = result.items.find((entry) => entry.cartId === recipientId);
    expect(recipientLine).not.toHaveProperty("bundleQualifierVoucherToken");
    expect(recipientLine?.configuration.size === null ? [] : recipientLine?.configuration.addonOptionIds).toEqual(["reward-addon"]);
    expect(result.reward_allocations).toEqual([{ client_line_id: recipientLine?.cartId, addon_option_id: "reward-addon", quantity: 1 }]);
    expect(result.created_reward_effects).toEqual([{ kind: "ADDON", client_line_id: recipientLine?.cartId, addon_option_id: "reward-addon", quantity: 1 }]);
  });

  it("materialize addon vào đúng qualifier unit và chỉ ghi effect cho addon vừa thêm", () => {
    const source = projectedCartLine({
      ...baseItem("line-1", 3),
      unitPrice: 45_000,
      addonsPrice: 0,
      addonPrices: {},
      selectedOptionIds: [],
      clientPriceVnd: 45_000,
      originalClientPriceVnd: 45_000,
    });
    const first = { ...slot(0), config: { ...slot(0).config, selectedOptionIds: [], addonsCost: 0, addonPrices: {}, addonMetadata: {} } };
    const second = { ...slot(1), config: { ...first.config } };
    const result = buildBundleCartDraft({
      items: [source],
      voucher_qr_token: "bundle-addon",
      qualifierSlots: [first, second],
      rewardSlots: [],
      rewardKind: "ADDON",
      rewardQuantity: 1,
      addonReward: addonReward([1]),
    });

    const rewardedId = result.reward_allocations[0]?.client_line_id;
    const rewarded = result.items.find((entry) => entry.cartId === rewardedId);
    expect(rewarded?.configuration.size === null ? [] : rewarded?.configuration.addonOptionIds).toEqual(["reward-addon"]);
    expect(rewarded).not.toHaveProperty("addonsPrice");
    expect(result.reward_allocations).toEqual([{ client_line_id: rewarded?.cartId, addon_option_id: "reward-addon", quantity: 1 }]);
    expect(result.created_reward_effects).toEqual([{ kind: "ADDON", client_line_id: rewarded?.cartId, addon_option_id: "reward-addon", quantity: 1 }]);
  });
});
