import type { AddonGroup } from "@/src/lib/types/menu";
import type { BundleCreatedRewardEffect, CartItem } from "@/src/lib/types/cart";
import { getBundleRequiredQuantities } from "@/src/utils/bundleSelection";
import type { BundleBenefitScaling } from "@/src/lib/utils/bundleVoucher";

export interface BundleAddonRewardInput {
  optionId: string | null;
  allowedOptionIds: readonly string[];
  recipientSlotIndexes: readonly number[];
  benefitScaling: BundleBenefitScaling;
  buyQuantity: number;
  rewardQuantity: number;
  maxApplicationsPerOrder: number;
  maxRewardUnitsPerOrder: number | null;
  addonGroups: readonly AddonGroup[];
}

export interface BundleAddonRewardRecipient {
  slotIndex: number;
  clientLineId: string;
  item: CartItem;
}

export interface BundleAddonRewardResult {
  items: CartItem[];
  rewardAllocations: Array<{ client_line_id: string; addon_option_id: string; quantity: number }>;
  createdEffects: BundleCreatedRewardEffect[];
}

function fail(message: string): never { throw new Error(message); }

function groupCount(item: CartItem, group: AddonGroup): number {
  if (item.configuration.size === null) return 0;
  const ids = new Set(group.options.map((option) => option.id));
  return new Set(item.configuration.addonOptionIds.filter((id) => ids.has(id))).size;
}

/** Materialize one fixed addon reward atomically without copying catalog or price snapshots. */
export function materializeBundleAddonReward(input: {
  items: readonly CartItem[];
  reward: BundleAddonRewardInput;
  qualifyingQuantity: number;
  recipients: readonly BundleAddonRewardRecipient[];
  existingEffects?: readonly BundleCreatedRewardEffect[];
}): BundleAddonRewardResult {
  const { reward } = input;
  const required = getBundleRequiredQuantities({
    benefit_scaling: reward.benefitScaling,
    buy_quantity: reward.buyQuantity,
    reward_quantity: reward.rewardQuantity,
    max_applications_per_order: reward.maxApplicationsPerOrder,
    max_reward_units_per_order: reward.maxRewardUnitsPerOrder,
  }, input.qualifyingQuantity);
  if (!required.valid) fail(required.reason ?? "Không thể phân bổ đủ addon thưởng");
  if (input.recipients.length !== required.rewards) fail("Chọn đúng số đơn vị nhận addon thưởng");
  if (new Set(input.recipients.map((recipient) => recipient.slotIndex)).size !== input.recipients.length) fail("Đơn vị nhận addon bị lặp");

  const optionId = reward.optionId;
  if (!optionId || !reward.allowedOptionIds.includes(optionId)) fail("Chọn addon thưởng trong danh sách được phép");
  const group = reward.addonGroups.find((candidate) => candidate.options.some((option) => option.id === optionId));
  const option = group?.options.find((candidate) => candidate.id === optionId);
  if (!group || !option) fail("Addon thưởng không còn trong menu");
  if (group.is_dynamic_gram || option.gram_value !== null) fail("Extra Matcha không thể là addon thưởng");

  const result = [...input.items];
  const effects: BundleCreatedRewardEffect[] = (input.existingEffects ?? []).filter((effect) => effect.kind === "LINE");
  const allocations: BundleAddonRewardResult["rewardAllocations"] = [];
  const byLine = new Map<string, BundleAddonRewardRecipient[]>();
  for (const recipient of input.recipients) {
    const entries = byLine.get(recipient.clientLineId) ?? [];
    entries.push(recipient);
    byLine.set(recipient.clientLineId, entries);
  }
  for (const [clientLineId, recipients] of byLine) {
    const index = result.findIndex((item) => item.cartId === clientLineId);
    const current = result[index];
    if (!current || current.configuration.size === null || recipients.length > current.quantity || (current.quantity > 1 && recipients.length !== current.quantity)) fail("Đơn vị nhận addon không còn hợp lệ");
    const selected = current.configuration.addonOptionIds;
    const alreadySelected = selected.includes(optionId);
    if (groupCount(current, group) > group.max_select || (!alreadySelected && groupCount(current, group) >= group.max_select)) fail("Nhóm addon của món đã đủ lựa chọn");
    result[index] = alreadySelected ? current : {
      ...current,
      configuration: { ...current.configuration, addonOptionIds: [...selected, optionId] },
    };
    allocations.push({ client_line_id: clientLineId, addon_option_id: optionId, quantity: recipients.length });
    const previous = input.existingEffects?.find((effect) => effect.kind === "ADDON" && effect.client_line_id === clientLineId && effect.addon_option_id === optionId);
    if (!alreadySelected) effects.push({ kind: "ADDON", client_line_id: clientLineId, addon_option_id: optionId, quantity: recipients.length });
    else if (previous?.kind === "ADDON") effects.push({ ...previous, quantity: recipients.length });
  }
  return { items: result, rewardAllocations: allocations, createdEffects: effects };
}
