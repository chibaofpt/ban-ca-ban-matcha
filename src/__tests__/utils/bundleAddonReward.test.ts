import { describe, expect, it } from "vitest";
import type { CartItem } from "@/src/lib/types/cart";
import type { AddonGroup } from "@/src/lib/types/menu";
import { materializeBundleAddonReward, type BundleAddonRewardInput } from "@/src/lib/utils/bundleAddonReward";
import { getBundleRequiredQuantities } from "@/src/utils/bundleSelection";

const group: AddonGroup = {
  id: "group-1",
  name: "Topping",
  image_url: null,
  sort_order: 1,
  max_select: 2,
  is_dynamic_gram: false,
  options: [
    { id: "addon-a", label: "A", image_url: null, price_vnd: 10_000, gram_value: null, sort_order: 1 },
    { id: "addon-b", label: "B", image_url: null, price_vnd: 12_000, gram_value: null, sort_order: 2 },
    { id: "addon-c", label: "C", image_url: null, price_vnd: 15_000, gram_value: null, sort_order: 3 },
    { id: "extra-matcha", label: "Extra Matcha", image_url: null, price_vnd: 0, gram_value: 5, sort_order: 4 },
  ],
};

const item = (cartId: string, selectedOptionIds: string[] = []): CartItem => {
  return {
    cartId,
    menuItemId: "latte-1",
    quantity: 1,
    configuration: { size: "MEDIUM", sweetness: "QUARTER", iceOption: "NORMAL", coldwhisk: false, note: "", addonOptionIds: selectedOptionIds },
    addonVouchers: [],
  };
};

const reward = (overrides: Partial<BundleAddonRewardInput> = {}): BundleAddonRewardInput => ({
  optionId: "addon-b",
  allowedOptionIds: ["addon-a", "addon-b"],
  recipientSlotIndexes: [0],
  benefitScaling: "PER_BUNDLE",
  buyQuantity: 2,
  rewardQuantity: 1,
  maxApplicationsPerOrder: 2,
  maxRewardUnitsPerOrder: null,
  addonGroups: [group],
  ...overrides,
});

const recipient = (entry: CartItem, slotIndex = 0) => [{ slotIndex, clientLineId: entry.cartId, item: entry }];

describe("bundle addon reward planner", () => {
  it("uses one reward for one PER_BUNDLE buy-2 group and keeps explicit option", () => {
    const result = materializeBundleAddonReward({ items: [item("line-1")], reward: reward(), qualifyingQuantity: 2, recipients: recipient(item("line-1")) });
    expect(result.rewardAllocations).toEqual([{ client_line_id: "line-1", addon_option_id: "addon-b", quantity: 1 }]);
    expect(result.createdEffects).toEqual([{ kind: "ADDON", client_line_id: "line-1", addon_option_id: "addon-b", quantity: 1 }]);
  });

  it("resolves ONCE and PER_QUALIFYING_ITEM quantities through the shared scaling helper", () => {
    expect(getBundleRequiredQuantities({ benefit_scaling: "ONCE_PER_ORDER", buy_quantity: 2, reward_quantity: 1, max_applications_per_order: 3, max_reward_units_per_order: null }, 2).rewards).toBe(1);
    expect(getBundleRequiredQuantities({ benefit_scaling: "PER_QUALIFYING_ITEM", buy_quantity: 2, reward_quantity: 1, max_applications_per_order: 2, max_reward_units_per_order: 3 }, 4).rewards).toBe(3);
    expect(materializeBundleAddonReward({
      items: [item("line-1"), item("line-2")],
      reward: reward({ benefitScaling: "ONCE_PER_ORDER", recipientSlotIndexes: [0] }),
      qualifyingQuantity: 2,
      recipients: [recipient(item("line-1"))[0]!],
    }).rewardAllocations).toHaveLength(1);
  });

  it("requires every PER_ITEM reward recipient instead of assigning to every qualifier implicitly", () => {
    const input = reward({ benefitScaling: "PER_QUALIFYING_ITEM", maxApplicationsPerOrder: 2, recipientSlotIndexes: [0, 1] });
    const result = materializeBundleAddonReward({
      items: [item("line-1"), item("line-2")],
      reward: input,
      qualifyingQuantity: 2,
      recipients: [recipient(item("line-1"))[0]!, recipient(item("line-2"), 1)[0]!],
    });
    expect(result.rewardAllocations.map((allocation) => allocation.client_line_id)).toEqual(["line-1", "line-2"]);
    expect(() => materializeBundleAddonReward({ items: [item("line-1")], reward: input, qualifyingQuantity: 2, recipients: recipient(item("line-1")) })).toThrow("đơn vị");
  });

  it("inserts a missing fixed addon without catalog or price snapshots", () => {
    const source = item("line-1");
    const result = materializeBundleAddonReward({ items: [source], reward: reward(), qualifyingQuantity: 2, recipients: recipient(source) });
    const next = result.items[0]!;
    expect(next.configuration.size === null ? [] : next.configuration.addonOptionIds).toEqual(["addon-b"]);
    expect(next).not.toHaveProperty("addonPrices");
    expect(next).not.toHaveProperty("addonMetadata");
    expect(next).not.toHaveProperty("addonsPrice");
    expect(next).not.toHaveProperty("unitPrice");
    expect(next).not.toHaveProperty("clientPriceVnd");
    expect(next).not.toHaveProperty("originalClientPriceVnd");
  });

  it("does not create an effect for an already paid addon and rejects full or invalid choices", () => {
    const paid = item("line-1", ["addon-b"]);
    const paidResult = materializeBundleAddonReward({ items: [paid], reward: reward(), qualifyingQuantity: 2, recipients: recipient(paid) });
    expect(paidResult.createdEffects).toEqual([]);
    expect(paidResult.items[0]?.configuration.size === null ? [] : paidResult.items[0]?.configuration.addonOptionIds).toEqual(["addon-b"]);
    const generatedResult = materializeBundleAddonReward({
      items: [paid],
      reward: reward(),
      qualifyingQuantity: 2,
      recipients: recipient(paid),
      existingEffects: [{ kind: "ADDON", client_line_id: "line-1", addon_option_id: "addon-b", quantity: 1 }],
    });
    expect(generatedResult.createdEffects).toEqual([{ kind: "ADDON", client_line_id: "line-1", addon_option_id: "addon-b", quantity: 1 }]);
    expect(() => materializeBundleAddonReward({ items: [item("line-1", ["addon-a", "addon-b"])], reward: reward({ optionId: "addon-c", allowedOptionIds: ["addon-c"] }), qualifyingQuantity: 2, recipients: recipient(item("line-1")) })).toThrow("đủ lựa chọn");
    const missingGroup = { ...group, options: group.options.filter((option) => option.id !== "addon-b") };
    expect(() => materializeBundleAddonReward({ items: [item("line-1")], reward: reward({ addonGroups: [missingGroup] }), qualifyingQuantity: 2, recipients: recipient(item("line-1")) })).toThrow("không còn trong menu");
    expect(() => materializeBundleAddonReward({ items: [item("line-1")], reward: reward({ optionId: "extra-matcha", allowedOptionIds: ["extra-matcha"] }), qualifyingQuantity: 2, recipients: recipient(item("line-1")) })).toThrow("Extra Matcha");
    expect(() => materializeBundleAddonReward({ items: [item("line-1")], reward: reward({ optionId: null }), qualifyingQuantity: 2, recipients: recipient(item("line-1")) })).toThrow("Chọn addon");
  });

  it("rejects a zero gram addon in the client materializer like the evaluator", () => {
    const zeroGramGroup: AddonGroup = {
      ...group,
      options: [{ id: "zero-gram", label: "Zero gram", image_url: null, price_vnd: 12_000, gram_value: 0, sort_order: 1 }],
    };
    expect(() => materializeBundleAddonReward({
      items: [item("line-1")],
      reward: reward({ optionId: "zero-gram", allowedOptionIds: ["zero-gram"], addonGroups: [zeroGramGroup] }),
      qualifyingQuantity: 2,
      recipients: recipient(item("line-1")),
    })).toThrow("Extra Matcha");
  });

  it("fails before a commit when explicit recipients cannot cover required units", () => {
    const input = reward({ benefitScaling: "PER_QUALIFYING_ITEM", recipientSlotIndexes: [0, 1] });
    expect(() => materializeBundleAddonReward({ items: [item("line-1")], reward: input, qualifyingQuantity: 2, recipients: recipient(item("line-1")) })).toThrow("đơn vị");
  });
});
