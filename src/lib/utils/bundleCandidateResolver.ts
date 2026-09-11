import type { CartBundleApplication, ProjectedCartLine } from "@/src/lib/types/cart";
import type { AddonGroup } from "@/src/lib/types/menu";
import {
  cartItemToBundleConfig,
  type BundleItemConfig,
  type BundleProductScope,
} from "@/src/lib/utils/voucherUseNowHelpers";

export type BundleCandidateRole = "QUALIFIER" | "PRODUCT_REWARD" | "ADDON_RECIPIENT";

export type BundleCandidateConflict =
  | "SIBLING_BUNDLE"
  | "PERSONAL_VOUCHER"
  | "PRODUCT_REWARD_IS_QUALIFIER"
  | "OUT_OF_SCOPE"
  | "ADDON_GROUP_FULL"
  | "EXTRA_MATCHA";

export interface BundleUnitCandidate {
  cartId: string;
  unitIndex: number;
  role: BundleCandidateRole;
  configuration: BundleItemConfig;
  conflicts: BundleCandidateConflict[];
}

export interface BundleCandidateRequirement {
  role: BundleCandidateRole;
  count: number;
  scopes: readonly BundleProductScope[];
  addon?: {
    group: AddonGroup;
    optionId: string;
  };
}

export type BundleAutofillResolution =
  | { status: "NONE" | "AMBIGUOUS"; selections: Partial<Record<BundleCandidateRole, BundleUnitCandidate[]>> }
  | { status: "UNIQUE" | "PERSISTED"; selections: Partial<Record<BundleCandidateRole, BundleUnitCandidate[]>> };

function unitKey(cartId: string, unitIndex: number): string {
  return `${cartId}:${unitIndex}`;
}

function allocatedUnits(
  applications: readonly CartBundleApplication[],
  currentVoucherToken: string,
): Set<string> {
  const allocated = new Set<string>();
  for (const application of applications) {
    if (application.voucher_qr_token === currentVoucherToken) continue;
    const productQuantities = new Map<string, number>();
    const addonQuantities = new Map<string, number>();
    for (const allocation of application.qualifier_allocations) {
      productQuantities.set(allocation.client_line_id, (productQuantities.get(allocation.client_line_id) ?? 0) + allocation.quantity);
    }
    for (const allocation of application.reward_allocations) {
      const target = allocation.addon_option_id ? addonQuantities : productQuantities;
      target.set(allocation.client_line_id, (target.get(allocation.client_line_id) ?? 0) + allocation.quantity);
    }
    const lineIds = new Set([...productQuantities.keys(), ...addonQuantities.keys()]);
    for (const cartId of lineIds) {
      const quantity = Math.max(productQuantities.get(cartId) ?? 0, addonQuantities.get(cartId) ?? 0);
      for (let index = 0; index < quantity; index += 1) allocated.add(unitKey(cartId, index));
    }
  }
  return allocated;
}

function scopeFor(
  item: ProjectedCartLine,
  scopes: readonly BundleProductScope[],
): BundleProductScope | undefined {
  return scopes.find((scope) => scope.menu_item_id === item.menuItemId
    && (item.configuration.size === null
      ? scope.allowed_sizes.length === 0
      : scope.allowed_sizes.includes(item.configuration.size)));
}

/** Resolve every current-cart unit for one BUNDLE role and explain excluded units. */
export function resolveBundleUnitCandidates(input: {
  items: readonly ProjectedCartLine[];
  requirement: BundleCandidateRequirement;
  applications: readonly CartBundleApplication[];
  currentVoucherToken: string;
  qualifierUnitKeys?: ReadonlySet<string>;
}): BundleUnitCandidate[] {
  const siblings = allocatedUnits(input.applications, input.currentVoucherToken);
  return input.items.flatMap((item) => {
    const scope = scopeFor(item, input.requirement.scopes);
    if (!scope) return [];
    return Array.from({ length: item.quantity }, (_, unitIndex): BundleUnitCandidate => {
      const conflicts: BundleCandidateConflict[] = [];
      const key = unitKey(item.cartId, unitIndex);
      if (siblings.has(key)) conflicts.push("SIBLING_BUNDLE");
      if (unitIndex === 0 && (item.lineVoucher || item.addonVouchers.length > 0)) {
        conflicts.push("PERSONAL_VOUCHER");
      }
      if (input.requirement.role === "PRODUCT_REWARD" && input.qualifierUnitKeys?.has(key)) {
        conflicts.push("PRODUCT_REWARD_IS_QUALIFIER");
      }
      if (input.requirement.role === "ADDON_RECIPIENT" && input.requirement.addon) {
        const { group, optionId } = input.requirement.addon;
        const option = group.options.find((candidate) => candidate.id === optionId);
        if (!option || group.is_dynamic_gram || option.gram_value !== null) conflicts.push("EXTRA_MATCHA");
        const selectedInGroup = item.resolvedAddons.filter((addon) => addon.groupId === group.id).length;
        const alreadySelected = item.configuration.size !== null
          && item.configuration.addonOptionIds.includes(optionId);
        if (!alreadySelected && selectedInGroup >= group.max_select) conflicts.push("ADDON_GROUP_FULL");
      }
      return {
        cartId: item.cartId,
        unitIndex,
        role: input.requirement.role,
        configuration: cartItemToBundleConfig(item, scope),
        conflicts,
      };
    });
  });
}

function combinations<T>(values: readonly T[], count: number, limit = 100): T[][] {
  if (count === 0) return [[]];
  const result: T[][] = [];
  const visit = (start: number, selected: T[]): void => {
    if (result.length >= limit) return;
    if (selected.length === count) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index <= values.length - (count - selected.length); index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
      if (result.length >= limit) return;
    }
  };
  visit(0, []);
  return result;
}

function fromAllocations(
  candidates: readonly BundleUnitCandidate[],
  allocations: CartBundleApplication["qualifier_allocations"],
  addonOnly: boolean,
  occupied: ReadonlySet<string> = new Set(),
): BundleUnitCandidate[] | null {
  const selected: BundleUnitCandidate[] = [];
  for (const allocation of allocations) {
    if (Boolean(allocation.addon_option_id) !== addonOnly) continue;
    const matches = candidates.filter((candidate) => candidate.cartId === allocation.client_line_id
      && !occupied.has(unitKey(candidate.cartId, candidate.unitIndex)));
    if (matches.length < allocation.quantity) return null;
    selected.push(...matches.slice(0, allocation.quantity));
  }
  return selected;
}

/** Autofill only a single complete allocation; preserve a committed allocation verbatim. */
export function resolveBundleAutofill(input: {
  items: readonly ProjectedCartLine[];
  requirements: readonly BundleCandidateRequirement[];
  applications: readonly CartBundleApplication[];
  currentVoucherToken: string;
  initialApplication?: CartBundleApplication;
  sameProductRatio?: { buyQuantity: number; rewardQuantity: number };
}): BundleAutofillResolution {
  const byRole = new Map<BundleCandidateRole, BundleUnitCandidate[]>();
  for (const requirement of input.requirements) {
    byRole.set(requirement.role, resolveBundleUnitCandidates({
      items: input.items,
      requirement,
      applications: input.applications,
      currentVoucherToken: input.currentVoucherToken,
    }));
  }

  if (input.initialApplication) {
    const selections: Partial<Record<BundleCandidateRole, BundleUnitCandidate[]>> = {};
    const occupiedProductUnits = new Set<string>();
    for (const requirement of input.requirements) {
      const allocations = requirement.role === "QUALIFIER"
        ? input.initialApplication.qualifier_allocations
        : input.initialApplication.reward_allocations;
      const restored = fromAllocations(
        byRole.get(requirement.role) ?? [],
        allocations,
        requirement.role === "ADDON_RECIPIENT",
        requirement.role === "PRODUCT_REWARD" ? occupiedProductUnits : undefined,
      );
      if (restored === null || restored.length !== requirement.count) return { status: "NONE", selections: {} };
      selections[requirement.role] = restored;
      if (requirement.role !== "ADDON_RECIPIENT") {
        for (const candidate of restored) occupiedProductUnits.add(unitKey(candidate.cartId, candidate.unitIndex));
      }
    }
    return { status: "PERSISTED", selections };
  }

  const qualifiers = input.requirements.find((requirement) => requirement.role === "QUALIFIER");
  const qualifierOptions = qualifiers
    ? combinations((byRole.get("QUALIFIER") ?? []).filter((candidate) => candidate.conflicts.length === 0), qualifiers.count)
    : [[]];
  const plans: Array<Partial<Record<BundleCandidateRole, BundleUnitCandidate[]>>> = [];
  for (const qualifierSelection of qualifierOptions) {
    const qualifierKeys = new Set(qualifierSelection.map((candidate) => unitKey(candidate.cartId, candidate.unitIndex)));
    let partialPlans: Array<Partial<Record<BundleCandidateRole, BundleUnitCandidate[]>>> = [
      qualifierSelection.length ? { QUALIFIER: qualifierSelection } : {},
    ];
    for (const requirement of input.requirements.filter((candidate) => candidate.role !== "QUALIFIER")) {
      const resolved = resolveBundleUnitCandidates({
        items: input.items,
        requirement,
        applications: input.applications,
        currentVoucherToken: input.currentVoucherToken,
        qualifierUnitKeys: qualifierKeys,
      }).filter((candidate) => candidate.conflicts.length === 0);
      const choices = combinations(resolved, requirement.count);
      partialPlans = partialPlans.flatMap((plan) => choices.map((choice) => ({ ...plan, [requirement.role]: choice })));
      if (partialPlans.length === 0) break;
    }
    const completePlans = input.sameProductRatio ? partialPlans.filter((plan) => {
      const qualifierCounts = new Map<string, number>();
      const rewardCounts = new Map<string, number>();
      for (const candidate of plan.QUALIFIER ?? []) {
        const id = candidate.configuration.menuItemId;
        qualifierCounts.set(id, (qualifierCounts.get(id) ?? 0) + 1);
      }
      for (const candidate of plan.PRODUCT_REWARD ?? []) {
        const id = candidate.configuration.menuItemId;
        rewardCounts.set(id, (rewardCounts.get(id) ?? 0) + 1);
      }
      const menuIds = new Set([...qualifierCounts.keys(), ...rewardCounts.keys()]);
      return [...menuIds].every((id) => {
        const rewards = rewardCounts.get(id) ?? 0;
        return rewards > 0
          && rewards % input.sameProductRatio!.rewardQuantity === 0
          && qualifierCounts.get(id) === rewards / input.sameProductRatio!.rewardQuantity * input.sameProductRatio!.buyQuantity;
      });
    }) : partialPlans;
    plans.push(...completePlans.slice(0, Math.max(0, 2 - plans.length)));
    if (plans.length > 1) break;
  }
  if (plans.length === 0) return { status: "NONE", selections: {} };
  if (plans.length > 1) return { status: "AMBIGUOUS", selections: {} };
  return { status: "UNIQUE", selections: plans[0] };
}
