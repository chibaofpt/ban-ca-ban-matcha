import {
  bundleAvailableProductQuantity,
  bundleProductUnitUsage,
  type BundleCartItem,
  type BundlePromotionRule,
  type BundleQualifierAllocation,
  type BundleRewardAllocation,
} from "@/src/utils/bundlePromotion";
import type { BundleApplicationEvaluationInput } from "@/src/utils/bundlePromotionApplications";
import type { BundleSelectionApplication, BundleSelectionPlanInput } from "@/src/utils/bundleSelection";

export type BundleSelectionUsage = { product: Map<string, number>; addon: Map<string, number> };

/** Normalize repeated qualifier selections by cart line. */
export function normalizeBundleQualifiers(allocations: readonly BundleQualifierAllocation[]): BundleQualifierAllocation[] {
  const quantities = new Map<string, number>();
  for (const allocation of allocations) {
    if (allocation.quantity > 0) quantities.set(allocation.client_line_id, (quantities.get(allocation.client_line_id) ?? 0) + allocation.quantity);
  }
  return [...quantities].map(([client_line_id, quantity]) => ({ client_line_id, quantity }));
}

/** Normalize repeated product or addon rewards by cart line and option. */
export function normalizeBundleRewards(allocations: readonly BundleRewardAllocation[]): BundleRewardAllocation[] {
  const quantities = new Map<string, BundleRewardAllocation>();
  for (const allocation of allocations) {
    if (allocation.quantity < 1) continue;
    const key = `${allocation.client_line_id}:${allocation.addon_option_id ?? "PRODUCT"}`;
    const previous = quantities.get(key);
    quantities.set(key, {
      client_line_id: allocation.client_line_id,
      ...(allocation.addon_option_id ? { addon_option_id: allocation.addon_option_id } : {}),
      quantity: (previous?.quantity ?? 0) + allocation.quantity,
    });
  }
  return [...quantities.values()];
}

/** Sum product and addon capacity already consumed by sibling BUNDLE applications. */
export function bundleSelectionSiblingUsage(applications: readonly BundleApplicationEvaluationInput[]): BundleSelectionUsage {
  const usage: BundleSelectionUsage = { product: new Map(), addon: new Map() };
  for (const application of applications) {
    for (const [lineId, quantity] of bundleProductUnitUsage(application.rule, application.qualifier_allocations, application.reward_allocations)) usage.product.set(lineId, (usage.product.get(lineId) ?? 0) + quantity);
    for (const allocation of application.reward_allocations) {
      if (allocation.addon_option_id) {
        const key = `${allocation.client_line_id}:${allocation.addon_option_id}`;
        usage.addon.set(key, (usage.addon.get(key) ?? 0) + allocation.quantity);
      }
    }
  }
  return usage;
}

function matchesScope(item: BundleCartItem, product: { menu_item_id: string; allowed_sizes: BundleCartItem["size"][] }): boolean {
  return item.menu_item_id === product.menu_item_id && (item.size === null ? product.allowed_sizes.length === 0 : product.allowed_sizes.includes(item.size));
}

function addUsage(usage: BundleSelectionUsage, rule: BundlePromotionRule, qualifiers: readonly BundleQualifierAllocation[], rewards: readonly BundleRewardAllocation[]): void {
  for (const [lineId, quantity] of bundleProductUnitUsage(rule, qualifiers, rewards)) usage.product.set(lineId, (usage.product.get(lineId) ?? 0) + quantity);
  for (const allocation of rewards) {
    if (allocation.addon_option_id) {
      const key = `${allocation.client_line_id}:${allocation.addon_option_id}`;
      usage.addon.set(key, (usage.addon.get(key) ?? 0) + allocation.quantity);
    }
  }
}

function addProducts(input: BundleSelectionPlanInput, usage: BundleSelectionUsage, scope: BundlePromotionRule["qualifier_products"], quantity: number, target: BundleQualifierAllocation[] | BundleRewardAllocation[], menuId?: string): void {
  let remaining = quantity;
  const orderedItems = input.items
    .map((item, index) => ({ item, index, scopeIndex: scope.findIndex((product) => matchesScope(item, product)) }))
    .filter(({ item, scopeIndex }) => scopeIndex >= 0 && (menuId === undefined || item.menu_item_id === menuId))
    .sort((left, right) => left.scopeIndex - right.scopeIndex || left.index - right.index);
  for (const { item } of orderedItems) {
    if (remaining === 0) break;
    const capacity = Math.max(0, bundleAvailableProductQuantity(item) - (usage.product.get(item.client_line_id) ?? 0));
    const take = Math.min(capacity, remaining);
    if (take > 0) {
      target.push({ client_line_id: item.client_line_id, quantity: take });
      usage.product.set(item.client_line_id, (usage.product.get(item.client_line_id) ?? 0) + take);
      remaining -= take;
    }
  }
}

/** Fill missing BUNDLE units deterministically while preserving every explicit choice. */
export function autofillBundleSelection(input: BundleSelectionPlanInput): BundleSelectionApplication {
  const qualifiers = normalizeBundleQualifiers(input.qualifier_allocations ?? []);
  const rewards = normalizeBundleRewards(input.reward_allocations ?? []);
  const selectedQualifierQuantity = qualifiers.reduce((sum, allocation) => sum + allocation.quantity, 0);
  const selectedRewardQuantity = rewards.reduce((sum, allocation) => sum + allocation.quantity, 0);
  const applications = input.selected_application_count && Number.isInteger(input.selected_application_count)
    ? input.selected_application_count
    : input.rule.benefit_scaling === "ONCE_PER_ORDER"
      ? 1
      : input.rule.benefit_scaling === "PER_QUALIFYING_ITEM"
        ? Math.max(1, Math.ceil(selectedQualifierQuantity / input.rule.buy_quantity))
        : selectedRewardQuantity > 0 && selectedRewardQuantity % input.rule.reward_quantity === 0
          ? selectedRewardQuantity / input.rule.reward_quantity
          : 1;
  const qualifying = input.rule.benefit_scaling === "PER_QUALIFYING_ITEM"
    ? Math.max(input.selected_qualifier_quantity ?? selectedQualifierQuantity, selectedRewardQuantity > 0 ? Math.ceil(selectedRewardQuantity / input.rule.reward_quantity) : 0, input.rule.buy_quantity)
    : applications * input.rule.buy_quantity;
  const cappedQualifying = Math.min(qualifying, input.rule.buy_quantity * input.rule.max_applications_per_order);
  const requiredRewards = input.rule.benefit_scaling === "PER_QUALIFYING_ITEM"
    ? input.rule.max_reward_units_per_order === null ? cappedQualifying * input.rule.reward_quantity : Math.min(cappedQualifying * input.rule.reward_quantity, input.rule.max_reward_units_per_order)
    : input.rule.benefit_scaling === "ONCE_PER_ORDER" ? input.rule.reward_quantity : applications * input.rule.reward_quantity;
  const usage = bundleSelectionSiblingUsage(input.sibling_applications ?? []);
  const siblingProductUsage = new Map(usage.product);
  addUsage(usage, input.rule, qualifiers, rewards);
  const itemByLine = new Map(input.items.map((item) => [item.client_line_id, item]));
  const sameConfig = input.rule.reward_kind === "PRODUCT" && input.rule.reward_mode === "SAME_CONFIG";
  if (input.rule.reward_kind === "PRODUCT" && sameConfig) {
    const explicitMenus = [...qualifiers, ...rewards].map((allocation) => itemByLine.get(allocation.client_line_id)?.menu_item_id).filter((menuId): menuId is string => Boolean(menuId));
    const configuredMenus = input.rule.qualifier_products.map((product) => product.menu_item_id).filter((menuId, index, menus) => menus.indexOf(menuId) === index);
    const candidateMenus = [...new Set([...explicitMenus, ...configuredMenus])].sort((left, right) => configuredMenus.indexOf(left) - configuredMenus.indexOf(right));
    const explicitMenuSet = new Set(explicitMenus);
    const explicitRewardByMenu = new Map<string, number>();
    const explicitQualifierByMenu = new Map<string, number>();
    for (const allocation of rewards) {
      const menuId = itemByLine.get(allocation.client_line_id)?.menu_item_id;
      if (menuId) explicitRewardByMenu.set(menuId, (explicitRewardByMenu.get(menuId) ?? 0) + allocation.quantity);
    }
    for (const allocation of qualifiers) {
      const menuId = itemByLine.get(allocation.client_line_id)?.menu_item_id;
      if (menuId) explicitQualifierByMenu.set(menuId, (explicitQualifierByMenu.get(menuId) ?? 0) + allocation.quantity);
    }
    const defaultApplications = Math.max(1, applications);
    let selectedMenu: string | undefined;
    if (explicitMenus.length === 0) {
      selectedMenu = candidateMenus.find((menuId) => input.items.filter((item) => item.menu_item_id === menuId && input.rule.qualifier_products.some((product) => matchesScope(item, product))).reduce((sum, item) => sum + Math.max(0, bundleAvailableProductQuantity(item) - (usage.product.get(item.client_line_id) ?? 0)), 0) >= defaultApplications * (input.rule.buy_quantity + input.rule.reward_quantity));
    }
    for (const menuId of candidateMenus) {
      if (selectedMenu && menuId !== selectedMenu) continue;
      if (!selectedMenu && !explicitMenuSet.has(menuId)) continue;
      const explicitRewardQuantity = explicitRewardByMenu.get(menuId) ?? 0;
      const explicitQualifierQuantity = explicitQualifierByMenu.get(menuId) ?? 0;
      const menuApplications = Math.max(1, explicitRewardQuantity > 0 ? Math.ceil(explicitRewardQuantity / input.rule.reward_quantity) : 0, explicitQualifierQuantity > 0 ? Math.ceil(explicitQualifierQuantity / input.rule.buy_quantity) : 0, selectedMenu ? defaultApplications : 1);
      addProducts(input, usage, input.rule.qualifier_products, Math.max(0, menuApplications * input.rule.reward_quantity - explicitRewardQuantity), rewards, menuId);
      addProducts(input, usage, input.rule.qualifier_products, Math.max(0, menuApplications * input.rule.buy_quantity - explicitQualifierQuantity), qualifiers, menuId);
    }
    if (selectedMenu === undefined && explicitMenus.length === 0) {
      addProducts(input, usage, input.rule.qualifier_products, Math.max(0, qualifying - selectedQualifierQuantity), qualifiers);
      addProducts(input, usage, input.rule.qualifier_products, Math.max(0, requiredRewards - selectedRewardQuantity), rewards);
    }
  } else if (input.rule.reward_kind === "PRODUCT") {
    addProducts(input, usage, input.rule.reward_products, Math.max(0, requiredRewards - selectedRewardQuantity), rewards);
    addProducts(input, usage, input.rule.qualifier_products, Math.max(0, qualifying - selectedQualifierQuantity), qualifiers);
  } else {
    addProducts(input, usage, input.rule.qualifier_products, Math.max(0, qualifying - selectedQualifierQuantity), qualifiers);
    const addonId = rewards.find((allocation) => allocation.addon_option_id)?.addon_option_id;
    let remaining = Math.max(0, requiredRewards - selectedRewardQuantity);
    const qualifierUsage = new Map<string, number>();
    for (const allocation of qualifiers) qualifierUsage.set(allocation.client_line_id, (qualifierUsage.get(allocation.client_line_id) ?? 0) + allocation.quantity);
    const addonRecipientUsage = new Map<string, number>();
    for (const allocation of rewards) if (allocation.addon_option_id) addonRecipientUsage.set(allocation.client_line_id, (addonRecipientUsage.get(allocation.client_line_id) ?? 0) + allocation.quantity);
    const addonItems = input.items.map((item, index) => ({ item, index, scopeIndex: input.rule.qualifier_products.findIndex((product) => matchesScope(item, product)) })).filter(({ scopeIndex }) => scopeIndex >= 0).sort((left, right) => left.scopeIndex - right.scopeIndex || left.index - right.index);
    if (addonId) for (const { item } of addonItems) {
      if (remaining === 0) break;
      const addon = item.addons.find((candidate) => candidate.addon_option_id === addonId);
      const key = `${item.client_line_id}:${addonId}`;
      const capacity = addon ? Math.min(bundleAvailableProductQuantity(item), Math.max(0, addon.quantity - (addon.personal_voucher_quantity ?? addon.voucher_discounted_quantity ?? 0) - (usage.addon.get(key) ?? 0))) : 0;
      const siblingProduct = siblingProductUsage.get(item.client_line_id) ?? 0;
      const qualifierQuantity = qualifierUsage.get(item.client_line_id) ?? 0;
      const addonRecipientQuantity = addonRecipientUsage.get(item.client_line_id) ?? 0;
      const productCapacity = Math.max(0, bundleAvailableProductQuantity(item) - siblingProduct - Math.max(qualifierQuantity, addonRecipientQuantity));
      const take = Math.min(capacity, productCapacity, remaining);
      if (take > 0) {
        rewards.push({ client_line_id: item.client_line_id, addon_option_id: addonId, quantity: take });
        usage.addon.set(key, (usage.addon.get(key) ?? 0) + take);
        addonRecipientUsage.set(item.client_line_id, addonRecipientQuantity + take);
        remaining -= take;
      }
    }
  }
  return { voucher_qr_token: input.voucher_qr_token, qualifier_allocations: normalizeBundleQualifiers(qualifiers), reward_allocations: normalizeBundleRewards(rewards) };
}
