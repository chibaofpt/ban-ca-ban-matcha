import type { BundleCartDraftCommit, CartBundleApplication, CartItem, ProjectedCartLine } from "@/src/lib/types/cart";
import { removeBundleEffects, stripBundleAddonSelections } from "@/src/lib/utils/bundleCartEffects";
import type { BundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";
import { materializeBundleAddonReward, type BundleAddonRewardInput } from "@/src/lib/utils/bundleAddonReward";
import {
  deriveBundleSelectionState,
  summarizeBundleCart,
  type BundleSelectionSiblingApplication,
  type BundleVoucherSummary,
} from "@/src/lib/utils/bundleVoucher";

export type BundleDraftRole = "qualifier" | "reward" | "recipient";

export interface BundleDraftSlot {
  role: BundleDraftRole;
  config: BundleItemConfig;
  sourceCartId?: string;
  sourceUnitIndex?: number;
  targetCartId?: string;
}

export interface BundleAddonRecipientSlot {
  config: BundleItemConfig;
  sourceCartId: string;
  sourceUnitIndex: number;
}

export interface BundleCartDraftInput {
  items: readonly CartItem[];
  voucher_qr_token: string;
  qualifierSlots: readonly (BundleDraftSlot | null)[];
  rewardSlots: readonly (BundleDraftSlot | null)[];
  rewardKind: "PRODUCT" | "ADDON";
  rewardQuantity: number;
  addonReward?: BundleAddonRewardInput;
  addonRecipientSlots?: readonly (BundleAddonRecipientSlot | null)[];
  existingApplication?: CartBundleApplication;
  createCartId?: () => string;
}

export interface BundleCartDraftResult {
  items: CartItem[];
  qualifier_allocations: CartBundleApplication["qualifier_allocations"];
  reward_allocations: CartBundleApplication["reward_allocations"];
  created_reward_effects: CartBundleApplication["created_reward_effects"];
  projectedItems?: ProjectedCartLine[];
}

export type BundleCartDraftValidation =
  | { ok: true; draft: BundleCartDraftCommit }
  | { ok: false; error: string };

/** Validate a built draft once and attach the owner for an atomic cart commit. */
export function validateBundleCartDraft(input: {
  voucher: BundleVoucherSummary;
  candidate: BundleCartDraftResult;
  ownerKey: string;
  siblingApplications?: readonly BundleSelectionSiblingApplication[];
}): BundleCartDraftValidation {
  if (!input.candidate.projectedItems) {
    return { ok: false, error: "Chưa thể xác minh cấu hình BUNDLE từ catalog hiện hành" };
  }
  const cart = summarizeBundleCart(input.candidate.projectedItems);
  const selection = deriveBundleSelectionState({
    voucher: input.voucher,
    cart,
    allocations: input.candidate.reward_allocations,
    qualifierAllocations: input.candidate.qualifier_allocations,
    siblingApplications: input.siblingApplications,
  });
  if (selection.status !== "READY" || !selection.application) {
    return { ok: false, error: selection.message };
  }
  return {
    ok: true,
    draft: {
      items: input.candidate.items,
      application: {
        voucher_qr_token: input.voucher.qr_token,
        owner_key: input.ownerKey,
        qualifier_allocations: selection.application.qualifier_allocations,
        reward_allocations: selection.application.reward_allocations,
        created_reward_effects: input.candidate.created_reward_effects,
      },
    },
  };
}

/** Mark persisted BUNDLE applications for a fresh server revalidation. */
export function revalidateBundleApplications(
  applications: readonly CartBundleApplication[] | undefined,
): CartBundleApplication[] | undefined {
  return applications?.map((application) => ({ ...application }));
}

interface AssignedSlot {
  slot: BundleDraftSlot;
  key: string;
  targetCartId?: string;
}

const slotKey = (role: BundleDraftRole, index: number): string => `${role}:${index}`;

function createCartItem(
  slot: BundleDraftSlot,
  cartId: string,
  source: CartItem | undefined,
): CartItem {
  const config = slot.config;
  return {
    cartId,
    menuItemId: config.menuItemId,
    quantity: 1,
    configuration: config.size === null
      ? { size: null, note: source?.configuration.note ?? "" }
      : {
          size: config.size,
          sweetness: config.sweetness,
          iceOption: config.iceOption,
          coldwhisk: config.coldwhisk,
          note: source?.configuration.note ?? "",
          ...(config.powderId ? { powderId: config.powderId } : {}),
          ...(config.baseLiquidId ? { baseLiquidId: config.baseLiquidId } : {}),
          addonOptionIds: [...config.selectedOptionIds],
        },
    ...(source?.lineVoucher ? { lineVoucher: source.lineVoucher } : {}),
    addonVouchers: source?.addonVouchers.filter((voucher) => config.selectedOptionIds.includes(voucher.addonOptionId)) ?? [],
  };
}

function aggregateProductAllocations(
  slots: readonly (BundleDraftSlot | null)[],
  targetIds: ReadonlyMap<string, string>,
): CartBundleApplication["qualifier_allocations"] {
  const quantities = new Map<string, number>();
  slots.forEach((slot, index) => {
    if (!slot) return;
    const targetCartId = targetIds.get(slotKey(slot.role, index));
    if (targetCartId) quantities.set(targetCartId, (quantities.get(targetCartId) ?? 0) + 1);
  });
  return [...quantities].map(([client_line_id, quantity]) => ({ client_line_id, quantity }));
}

/** Build all BUNDLE item changes and allocations before one atomic store commit. */
export function buildBundleCartDraft(input: BundleCartDraftInput): BundleCartDraftResult {
  const createCartId = input.createCartId ?? (() => crypto.randomUUID());
  const staleLineIds = new Set(
    input.existingApplication?.created_reward_effects.flatMap((effect) => effect.kind === "LINE" ? [effect.client_line_id] : []) ?? [],
  );
  const rawItems = input.items.map((item): CartItem => ({
    cartId: item.cartId,
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    configuration: item.configuration,
    ...(item.lineVoucher ? { lineVoucher: item.lineVoucher } : {}),
    addonVouchers: item.addonVouchers,
  }));
  const baseItems = input.existingApplication ? removeBundleEffects(rawItems, input.existingApplication) : rawItems;
  const ownedAddonIdsByLine = new Map<string, Set<string>>();
  for (const effect of input.existingApplication?.created_reward_effects ?? []) if (effect.kind === "ADDON") {
    const ids = ownedAddonIdsByLine.get(effect.client_line_id) ?? new Set<string>();
    ids.add(effect.addon_option_id);
    ownedAddonIdsByLine.set(effect.client_line_id, ids);
  }
  const cleanSlot = (slot: BundleDraftSlot | null): BundleDraftSlot | null => slot && { ...slot, config: stripBundleAddonSelections(slot.config, ownedAddonIdsByLine.get(slot.sourceCartId ?? "")) };
  const baseLineIds = new Set(baseItems.map((item) => item.cartId));
  const qualifierSlots = input.qualifierSlots.map(cleanSlot).map((slot) => slot && slot.sourceCartId && !baseLineIds.has(slot.sourceCartId) && staleLineIds.has(slot.sourceCartId)
    ? { ...slot, sourceCartId: undefined, sourceUnitIndex: undefined, targetCartId: slot.sourceCartId }
    : slot);
  const rewardSlots = input.rewardSlots.map(cleanSlot).map((slot) => slot && slot.sourceCartId && !baseLineIds.has(slot.sourceCartId) && staleLineIds.has(slot.sourceCartId)
    ? { ...slot, sourceCartId: undefined, sourceUnitIndex: undefined, targetCartId: slot.sourceCartId }
    : slot);
  const recipientSlots = (input.rewardKind === "ADDON" ? (input.addonRecipientSlots?.map((slot) => slot && { ...slot, config: stripBundleAddonSelections(slot.config, ownedAddonIdsByLine.get(slot.sourceCartId)) }) ?? qualifierSlots.map((slot) => slot ? {
    config: slot.config,
    sourceCartId: slot.sourceCartId ?? "",
    sourceUnitIndex: slot.sourceUnitIndex ?? -1,
  } : null)) : []).map((slot) => slot ? {
    role: "recipient" as const,
    config: slot.config,
    sourceCartId: slot.sourceCartId,
    sourceUnitIndex: slot.sourceUnitIndex,
  } : null);
  const sourceAssignments = new Map<string, AssignedSlot[]>();
  const targetIds = new Map<string, string>();
  const allSlots: Array<{ slot: BundleDraftSlot; index: number }> = [
    ...qualifierSlots.flatMap((slot, index) => slot ? [{ slot, index }] : []),
    ...rewardSlots.flatMap((slot, index) => slot ? [{ slot, index }] : []),
  ];
  const roleSlots: Array<{ role: BundleDraftRole; slots: readonly (BundleDraftSlot | null)[] }> = [
    { role: "qualifier", slots: qualifierSlots },
    { role: "reward", slots: rewardSlots },
    { role: "recipient", slots: recipientSlots },
  ];
  for (const { role, slots } of roleSlots) {
    slots.forEach((slot, index) => {
      if (!slot) return;
      const key = slotKey(role, index);
      if (slot.sourceCartId === undefined) return;
      if (slot.sourceUnitIndex === undefined || slot.sourceUnitIndex < 0 || !Number.isInteger(slot.sourceUnitIndex)) {
        throw new Error("BUNDLE_SCOPE_MISMATCH");
      }
      const assignments = sourceAssignments.get(slot.sourceCartId) ?? [];
      if (assignments.some((assignment) => assignment.slot.sourceUnitIndex === slot.sourceUnitIndex && assignment.slot.role === role)) {
        throw new Error("BUNDLE_ALLOCATION_OVERLAP");
      }
      assignments.push({ slot, key });
      sourceAssignments.set(slot.sourceCartId, assignments);
    });
  }

  let items: CartItem[] = [];
  for (const item of baseItems) {
    const assignments = sourceAssignments.get(item.cartId);
    if (!assignments || assignments.length === 0) {
      items.push(item);
      continue;
    }
    if (assignments.some((assignment) => (assignment.slot.sourceUnitIndex ?? -1) >= item.quantity)) {
      throw new Error("BUNDLE_SCOPE_MISMATCH");
    }
    const ordered = [...assignments].sort((left, right) => (left.slot.sourceUnitIndex ?? 0) - (right.slot.sourceUnitIndex ?? 0));
    const byUnit = new Map<number, AssignedSlot[]>();
    for (const assignment of ordered) {
      const unit = assignment.slot.sourceUnitIndex ?? -1;
      const unitAssignments = byUnit.get(unit) ?? [];
      unitAssignments.push(assignment);
      byUnit.set(unit, unitAssignments);
    }
    [...byUnit.entries()].sort(([left], [right]) => left - right).forEach(([, unitAssignments], unitIndex) => {
      const targetCartId = unitIndex === 0 ? item.cartId : createCartId();
      const primary = unitAssignments.find((assignment) => assignment.slot.role !== "recipient") ?? unitAssignments[0]!;
      for (const assignment of unitAssignments) {
        assignment.targetCartId = targetCartId;
        targetIds.set(assignment.key, targetCartId);
      }
      items.push(createCartItem(primary.slot, targetCartId, item));
    });
    const remainder = item.quantity - byUnit.size;
    if (remainder > 0) items.push({ ...item, cartId: createCartId(), quantity: remainder });
  }

  for (const entry of allSlots) {
    const { slot, index } = entry;
    if (slot.sourceCartId !== undefined) continue;
    const cartId = slot.targetCartId ?? createCartId();
    targetIds.set(slotKey(slot.role, index), cartId);
    items.push(createCartItem(slot, cartId, undefined));
  }

  const qualifier_allocations = aggregateProductAllocations(qualifierSlots, targetIds);
  let reward_allocations: CartBundleApplication["reward_allocations"];
  let created_reward_effects: CartBundleApplication["created_reward_effects"];
  if (input.rewardKind === "ADDON") {
    if (!input.addonReward) throw new Error("Choose addon reward and recipient");
    const recipients = input.addonReward.recipientSlotIndexes.map((slotIndex) => {
      const slot = recipientSlots[slotIndex];
      const clientLineId = targetIds.get(slotKey("recipient", slotIndex));
      const recipientItem = clientLineId ? items.find((entry) => entry.cartId === clientLineId) : undefined;
      if (!slot || !clientLineId || !recipientItem) throw new Error("Addon recipient must be a valid cart item");
      return { slotIndex, clientLineId, item: recipientItem };
    });
    const materialized = materializeBundleAddonReward({
      items,
      reward: input.addonReward,
      qualifyingQuantity: qualifier_allocations.reduce((sum, allocation) => sum + allocation.quantity, 0),
      recipients,
    });
    items = materialized.items;
    reward_allocations = materialized.rewardAllocations;
    created_reward_effects = materialized.createdEffects;
  } else {
    reward_allocations = aggregateProductAllocations(rewardSlots, targetIds);
    created_reward_effects = rewardSlots.flatMap((slot, index) => {
      if (!slot) return [];
      const source = slot.sourceCartId ? baseItems.find((item) => item.cartId === slot.sourceCartId) : undefined;
      return slot.sourceCartId === undefined || (source !== undefined && staleLineIds.has(source.cartId))
        ? [{ kind: "LINE" as const, client_line_id: targetIds.get(slotKey("reward", index)) ?? "" }]
        : [];
    });
  }

  return { items, qualifier_allocations, reward_allocations, created_reward_effects };
}
