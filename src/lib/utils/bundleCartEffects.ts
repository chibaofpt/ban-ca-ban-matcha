import type { BundleCreatedRewardEffect, CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import type { BundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";

/** Recalculate the client payable price after voucher and addon mutations. */
export function computeCartClientPrice(item: CartItem): number {
  if (item.category === "extras") return item.itemVoucherId ? 0 : item.unitPrice;
  const baseDrinkPrice = item.unitPrice - item.addonsPrice;
  const drinkAfterCredit = Math.max(0, baseDrinkPrice - (item.productVoucherDiscountVnd ?? 0));
  const addonDiscount = item.addonVouchers?.reduce((sum, voucher) => sum + voucher.discountVnd, 0) ?? 0;
  return drinkAfterCredit + Math.max(0, item.addonsPrice - addonDiscount);
}

/** Remove one application's generated lines and addons while preserving paid and foreign effects. */
export function removeBundleEffects(items: CartItem[], application: CartBundleApplication): CartItem[] {
  const lineIds = new Set(application.created_reward_effects.flatMap((effect) => effect.kind === "LINE" ? [effect.client_line_id] : []));
  return items.filter((item) => !lineIds.has(item.cartId)).map((item) => {
    const addonEffects = application.created_reward_effects.filter(
      (effect): effect is Extract<BundleCreatedRewardEffect, { kind: "ADDON" }> =>
        effect.kind === "ADDON" && effect.client_line_id === item.cartId,
    );
    const withoutBundleMarkers = {
      ...item,
      ...(item.bundleQualifierVoucherToken === application.voucher_qr_token ? { bundleQualifierVoucherToken: undefined } : {}),
      ...(item.bundleRewardVoucherToken === application.voucher_qr_token ? { bundleRewardVoucherToken: undefined } : {}),
    };
    if (addonEffects.length === 0) return withoutBundleMarkers;
    const effectByOption = new Map<string, number>();
    for (const effect of addonEffects) effectByOption.set(effect.addon_option_id, (effectByOption.get(effect.addon_option_id) ?? 0) + effect.quantity);
    const selectedOptionIds = item.selectedOptionIds.filter((id) => (effectByOption.get(id) ?? 0) < 1);
    const removedPrice = [...effectByOption.keys()].reduce((sum, id) => sum + (item.addonPrices[id] ?? 0), 0);
    const addonPrices = { ...item.addonPrices };
    const addonMetadata = { ...(item.addonMetadata ?? {}) };
    for (const id of effectByOption.keys()) {
      delete addonPrices[id];
      delete addonMetadata[id];
    }
    const next = {
      ...withoutBundleMarkers,
      selectedOptionIds,
      addonsPrice: Math.max(0, item.addonsPrice - removedPrice),
      unitPrice: Math.max(0, item.unitPrice - removedPrice),
      originalClientPriceVnd: Math.max(0, item.originalClientPriceVnd - removedPrice),
      addonPrices,
      addonMetadata,
    };
    return { ...next, clientPriceVnd: computeCartClientPrice(next) };
  });
}

/** Check allocation ownership independently of cart line marker fields. */
export function isCartLineBundleAllocated(applications: readonly CartBundleApplication[], cartId: string): boolean {
  return applications.some((application) => [...application.qualifier_allocations, ...application.reward_allocations].some((allocation) => allocation.client_line_id === cartId));
}

/** Strip one application's generated addon options before rebuilding its draft. */
export function stripBundleAddonSelections(config: BundleItemConfig, generatedOptionIds: ReadonlySet<string> | undefined): BundleItemConfig {
  if (!generatedOptionIds || generatedOptionIds.size === 0) return config;
  const selectedOptionIds = config.selectedOptionIds.filter((optionId) => !generatedOptionIds.has(optionId));
  const addonPrices = Object.fromEntries(Object.entries(config.addonPrices).filter(([optionId]) => !generatedOptionIds.has(optionId)));
  const addonMetadata = config.addonMetadata
    ? Object.fromEntries(Object.entries(config.addonMetadata).filter(([optionId]) => !generatedOptionIds.has(optionId)))
    : undefined;
  return { ...config, selectedOptionIds, addonPrices, addonMetadata, addonsCost: Object.values(addonPrices).reduce((sum, price) => sum + price, 0) };
}
