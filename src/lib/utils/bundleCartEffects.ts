import type { BundleCreatedRewardEffect, CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import type { BundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";

/** Remove generated reward effects while retaining every paid line and addon. */
export function removeBundleEffects(items: CartItem[], application: CartBundleApplication): CartItem[] {
  const lineIds = new Set(application.created_reward_effects.flatMap((effect) => effect.kind === "LINE" ? [effect.client_line_id] : []));
  return items.flatMap((item) => {
    if (lineIds.has(item.cartId)) return [];
    const addonIds = new Set(application.created_reward_effects.flatMap((effect): string[] =>
      effect.kind === "ADDON" && effect.client_line_id === item.cartId ? [effect.addon_option_id] : [],
    ));
    if (addonIds.size === 0 || item.configuration.size === null) return [item];
    return [{
      ...item,
      configuration: { ...item.configuration, addonOptionIds: item.configuration.addonOptionIds.filter((id) => !addonIds.has(id)) },
      addonVouchers: item.addonVouchers.filter((voucher) => !addonIds.has(voucher.addonOptionId)),
    }];
  });
}

/** Check BUNDLE ownership from allocations rather than cart-line markers. */
export function isCartLineBundleAllocated(applications: readonly CartBundleApplication[], cartId: string): boolean {
  return applications.some((application) => [...application.qualifier_allocations, ...application.reward_allocations]
    .some((allocation) => allocation.client_line_id === cartId && allocation.quantity > 0));
}

/** Strip generated addon choices from a local BUNDLE configuration draft. */
export function stripBundleAddonSelections(config: BundleItemConfig, generatedOptionIds: ReadonlySet<string> | undefined): BundleItemConfig {
  if (!generatedOptionIds?.size) return config;
  const selectedOptionIds = config.selectedOptionIds.filter((optionId) => !generatedOptionIds.has(optionId));
  const addonPrices = Object.fromEntries(Object.entries(config.addonPrices).filter(([optionId]) => !generatedOptionIds.has(optionId)));
  const addonMetadata = config.addonMetadata
    ? Object.fromEntries(Object.entries(config.addonMetadata).filter(([optionId]) => !generatedOptionIds.has(optionId)))
    : undefined;
  return { ...config, selectedOptionIds, addonPrices, addonMetadata, addonsCost: Object.values(addonPrices).reduce((sum, price) => sum + price, 0) };
}

export type BundleEffect = BundleCreatedRewardEffect;
