import type { AddonGroup } from "@/src/lib/types/menu";
import type { BundleCreatedRewardEffect, CartItem } from "@/src/lib/types/cart";
import { getBundleRequiredQuantities } from "@/src/utils/bundleSelection";
import type { BundleBenefitScaling } from "@/src/lib/utils/bundleVoucher";
import { ceilTo1000 } from "@/src/utils/pricing";

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

function error(message: string): never {
  throw new Error(message);
}

function isInvalidSnapshot(item: CartItem, optionId: string, group: AddonGroup, gramValue: number | null): boolean {
  const snapshot = item.addonMetadata?.[optionId];
  if (!snapshot) return false;
  return snapshot.addon_group_id !== undefined && snapshot.addon_group_id !== group.id
    || snapshot.max_select !== undefined && snapshot.max_select !== group.max_select
    || snapshot.is_active === false
    || snapshot.is_deleted === true
    || snapshot.is_dynamic_gram === true
    || snapshot.gram_value !== null
    || gramValue !== null;
}

function addonCountInGroup(item: CartItem, group: AddonGroup): number {
  const groupOptionIds = new Set(group.options.map((option) => option.id));
  return new Set(item.selectedOptionIds.filter((id) => groupOptionIds.has(id))).size;
}

/** Materialize an explicit fixed addon reward on eligible recipient units without mutating the source cart. */
export function materializeBundleAddonReward(input: {
  items: readonly CartItem[];
  reward: BundleAddonRewardInput;
  qualifyingQuantity: number;
  recipients: readonly BundleAddonRewardRecipient[];
  existingEffects?: readonly BundleCreatedRewardEffect[];
}): BundleAddonRewardResult {
  const reward = input.reward;
  const required = getBundleRequiredQuantities({
    benefit_scaling: reward.benefitScaling,
    buy_quantity: reward.buyQuantity,
    reward_quantity: reward.rewardQuantity,
    max_applications_per_order: reward.maxApplicationsPerOrder,
    max_reward_units_per_order: reward.maxRewardUnitsPerOrder,
  }, input.qualifyingQuantity);
  if (!required.valid) error(required.reason ?? "Không thể phân bổ đủ addon thưởng");
  if (input.recipients.length !== required.rewards) error("Chọn đúng số đơn vị nhận addon thưởng");
  if (new Set(input.recipients.map((recipient) => recipient.slotIndex)).size !== input.recipients.length) error("Đơn vị nhận addon bị lặp");

  const optionId = reward.optionId;
  if (!optionId || !new Set(reward.allowedOptionIds).has(optionId)) error("Chọn addon thưởng trong danh sách được phép");
  const group = reward.addonGroups.find((candidate) => candidate.options.some((option) => option.id === optionId));
  const option = group?.options.find((candidate) => candidate.id === optionId);
  if (!group || !option) error("Addon thưởng không còn trong menu");
  if (group.is_dynamic_gram || option.gram_value !== null) error("Extra Matcha không thể là addon thưởng");

  const itemByLine = new Map(input.items.map((item) => [item.cartId, item]));
  const resultItems = input.items.map((item) => item);
  const effects: BundleCreatedRewardEffect[] = (input.existingEffects ?? []).filter((effect) => effect.kind === "LINE");
  const rewardAllocations: BundleAddonRewardResult["rewardAllocations"] = [];
  const recipientsByLine = new Map<string, BundleAddonRewardRecipient[]>();
  for (const recipient of input.recipients) {
    if ([...recipientsByLine.values()].some((entries) => entries.some((entry) => entry.slotIndex === recipient.slotIndex))) error("Đơn vị nhận addon bị lặp");
    const entries = recipientsByLine.get(recipient.clientLineId) ?? [];
    entries.push(recipient);
    recipientsByLine.set(recipient.clientLineId, entries);
  }
  for (const [clientLineId, recipients] of recipientsByLine) {
    const current = itemByLine.get(clientLineId);
    if (!current || current.cartId !== recipients[0]?.item.cartId || recipients.length > current.quantity || (current.quantity > 1 && recipients.length !== current.quantity)) error("Đơn vị nhận addon không còn hợp lệ");
    if (isInvalidSnapshot(current, optionId, group, option.gram_value)) error("Addon thưởng đã thay đổi hoặc không còn hợp lệ");
    const alreadySelected = current.selectedOptionIds.includes(optionId);
    const previousEffect = input.existingEffects?.find((effect) =>
      effect.kind === "ADDON" && effect.client_line_id === clientLineId && effect.addon_option_id === optionId,
    );
    const existingPrice = current.addonPrices[optionId];
    const price = existingPrice ?? ceilTo1000(option.price_vnd);
    const next = {
      ...current,
      selectedOptionIds: [...current.selectedOptionIds],
      addonPrices: { ...current.addonPrices },
      addonMetadata: { ...(current.addonMetadata ?? {}) },
    };
    const groupCount = addonCountInGroup(current, group);
    if (groupCount > group.max_select || (!alreadySelected && groupCount >= group.max_select)) error("Nhóm addon của món đã đủ lựa chọn");
    if (!alreadySelected) {
      next.selectedOptionIds.push(optionId);
      next.addonsPrice += price;
      next.unitPrice += price;
      next.clientPriceVnd += price;
      next.originalClientPriceVnd += price;
      next.addonPrices[optionId] = price;
    } else if (existingPrice === undefined) {
      next.addonPrices[optionId] = price;
      next.addonsPrice += price;
      next.unitPrice += price;
      next.clientPriceVnd += price;
      next.originalClientPriceVnd += price;
    }
    next.addonMetadata[optionId] = {
      addon_group_id: group.id,
      max_select: group.max_select,
      gram_value: option.gram_value,
      is_active: true,
      is_deleted: false,
      is_dynamic_gram: false,
    };
    const index = resultItems.findIndex((item) => item.cartId === clientLineId);
    if (index < 0) error("Đơn vị nhận addon không còn trong bản nháp");
    resultItems[index] = next;
    const quantity = recipients.length;
    rewardAllocations.push({ client_line_id: clientLineId, addon_option_id: optionId, quantity });
    if (!alreadySelected) effects.push({ kind: "ADDON", client_line_id: clientLineId, addon_option_id: optionId, quantity });
    else if (previousEffect?.kind === "ADDON") effects.push({ ...previousEffect, quantity });
  }
  return { items: resultItems, rewardAllocations, createdEffects: effects };
}
