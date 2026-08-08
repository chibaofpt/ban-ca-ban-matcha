/**
 * useAddVoucherToCart — Handles "Dùng ngay" flow for PRODUCT vouchers.
 *
 * Fetches current menu data, finds the matching item, computes its price
 * with the voucher configuration (size, powder, milk, addons), builds a
 * CartItem, applies the voucher credit, and adds it to the cart store.
 *
 * Usage: Call addToCart(voucher) from MyVouchersPage VoucherCard.
 */

"use client";

import { useState, useCallback } from "react";
import { useCartStore } from "@/src/lib/store/cartStore";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { fetchMenu } from "@/src/services/menuService";
import { calcLattePrice, calcFusionPrice, resolveGram, ceilTo1000 } from "@/src/utils/pricing";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { CartItem } from "@/src/lib/types/cart";
import type { AddonGroup, MenuItem, MilkTypeOption, Size } from "@/src/lib/types/menu";

/** Result of attempting to add a PRODUCT voucher item to the cart. */
export type AddVoucherResult =
  | { ok: true }
  | { ok: false; reason: "item_unavailable" | "size_unavailable" | "fetch_failed" };

/**
 * Resolves the price of a menu item with a given configuration.
 * Returns drink and addon prices separately for correct PRODUCT credit capping.
 */
function computeVoucherItemPrice(
  menuItem: MenuItem,
  size: Size,
  powderId: string | null,
  milkTypeId: string | null,
  addonOptionIds: string[],
  powders: ReturnType<typeof usePowderStore.getState>["data"],
  defaultPowderGram: ReturnType<typeof usePowderStore.getState>["defaultPowderGram"],
  latteItems: MenuItem[],
  milkTypes: MilkTypeOption[],
  addonGroups: AddonGroup[],
): { drinkPrice: number; addonsCost: number } {
  const sizeObj = menuItem.sizes.find((s) => s.size === size);
  const base_price_vnd = sizeObj?.base_price_vnd ?? 0;

  const activePowderId = menuItem.category === "latte"
    ? (menuItem.powder?.id ?? powderId ?? "")
    : (powderId ?? menuItem.resolved_default_powder_id ?? "");

  const activePowder = powders.find((p) => p.id === activePowderId);
  const pwd_price_per_gram = activePowder?.price_per_gram ?? 0;
  const gram = resolveGram(size, menuItem.custom_powder_grams, activePowder?.size_config ?? [], defaultPowderGram);

  let drinkPrice = 0;
  if (menuItem.category === "latte") {
    const milk_ml = sizeObj?.milk_ml ?? 0;
    const milk = milkTypes.find((candidate) => candidate.id === milkTypeId);
    const defaultMilk = milkTypes.find((candidate) => candidate.is_default);
    const milk_price_per_ml = (milk ?? defaultMilk)?.price_per_ml ?? 40;
    drinkPrice = calcLattePrice({ base_price_vnd, gram, powder_price_per_gram: pwd_price_per_gram, milk_ml, milk_price_per_ml });
  } else {
    let premium_latte = 0;
    const defaultPowderId = menuItem.resolved_default_powder_id;
    const defaultPowder = powders.find((p) => p.id === defaultPowderId);
    if (activePowder?.reference_latte_item_id && defaultPowder?.reference_latte_item_id && activePowderId !== defaultPowderId) {
      const selBase = latteItems.find((i) => i.id === activePowder.reference_latte_item_id)?.sizes.find((s) => s.size === size)?.base_price_vnd ?? 0;
      const defBase = latteItems.find((i) => i.id === defaultPowder.reference_latte_item_id)?.sizes.find((s) => s.size === size)?.base_price_vnd ?? 0;
      premium_latte = selBase - defBase;
    }
    drinkPrice = calcFusionPrice({ base_price_vnd, gram, powder_price_per_gram: pwd_price_per_gram, premium_latte });
  }

  // Resolve addon prices for included_addon_option_ids
  let addonsCost = 0;
  for (const group of addonGroups) {
    for (const opt of group.options) {
      if (addonOptionIds.includes(opt.id)) {
        const rawCost = opt.gram_value != null
          ? opt.gram_value * pwd_price_per_gram
          : opt.price_vnd;
        addonsCost += ceilTo1000(rawCost);
      }
    }
  }

  return { drinkPrice, addonsCost };
}

/**
 * Hook for the "Dùng ngay" flow.
 * Returns addToCart function and loading state.
 */
export function useAddVoucherToCart() {
  const { addItem, applyProductVoucher, setCartOpen } = useCartStore();
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGram = usePowderStore((s) => s.defaultPowderGram);
  const [loading, setLoading] = useState(false);

  const addToCart = useCallback(
    async (voucher: MyVoucher): Promise<AddVoucherResult> => {
      if (voucher.voucher_type !== "PRODUCT" || !voucher.menu_item_id) {
        return { ok: false, reason: "fetch_failed" };
      }

      setLoading(true);
      try {
        // Fetch fresh menu data (cannot rely on MenuPage cache from outside that context)
        const menuData = await fetchMenu();
        const allItems = [...menuData.latte, ...menuData.fusion];
        const latteItems = menuData.latte;

        const menuItem = allItems.find((i) => i.id === voucher.menu_item_id);
        if (!menuItem) {
          return { ok: false, reason: "item_unavailable" };
        }

        // Use voucher's size config (soft match: item must support this size)
        const voucherSize = (voucher.size ?? "SMALL") as Size;
        const sizeObj = menuItem.sizes.find((s) => s.size === voucherSize);
        if (!sizeObj || sizeObj.base_price_vnd == null) {
          return { ok: false, reason: "size_unavailable" };
        }

        // Resolve addons — voucher.included_addon_option_ids is the snapshot config
        const includedAddonIds = (voucher as MyVoucher & { included_addon_option_ids?: string[] }).included_addon_option_ids ?? [];

        // Compute the server-equivalent price for this item at its voucher configuration
        const { drinkPrice, addonsCost } = computeVoucherItemPrice(
          menuItem,
          voucherSize,
          voucher.matcha_powder_id ?? null,
          voucher.milk_type_id ?? null,
          includedAddonIds,
          powders,
          defaultPowderGram,
          latteItems,
          menuData.milk_types,
          menuData.addon_groups,
        );
        const originalPrice = drinkPrice + addonsCost;

        // Build addon details for display
        const allAddonOptions = menuData.addon_groups.flatMap((group) => group.options);
        const addonDetails = includedAddonIds
          .map((id) => allAddonOptions.find((o) => o.id === id)?.label)
          .filter((l): l is string => l != null && l.length > 0);

        const details: string[] = [
          `Size ${voucherSize}`,
          ...addonDetails,
          "🎁 Voucher sản phẩm",
        ];
        void details;

        // Determine selected option ids (use voucher config as selected)
        const defaultOptionIds = menuData.addon_groups
          .flatMap((group) => group.options.filter((option) => option.is_default).map((option) => option.id));
        const selectedOptionIds = [...new Set([...defaultOptionIds, ...includedAddonIds])];
        const addonPrices: Record<string, number> = {};
        const activePowderId = menuItem.category === "latte"
          ? (menuItem.powder?.id ?? voucher.matcha_powder_id ?? "")
          : (voucher.matcha_powder_id ?? menuItem.resolved_default_powder_id ?? "");
        const activePowderPrice = powders.find(
          (powder) => powder.id === activePowderId
        )?.price_per_gram ?? 0;
        for (const option of allAddonOptions) {
          if (!includedAddonIds.includes(option.id)) continue;
          const rawPrice = option.gram_value !== null
            ? option.gram_value * activePowderPrice
            : option.price_vnd;
          addonPrices[option.id] = ceilTo1000(rawPrice);
        }
        const quantityAddonOptions = menuData.addon_groups
          .filter((group) => group.type === "QUANTITY")
          .flatMap((group) =>
            group.options
              .filter((option) => includedAddonIds.includes(option.id))
              .map((option) => ({ option_id: option.id, quantity: 1 }))
          );
        const quantityMap = Object.fromEntries(
          menuData.addon_groups
            .filter((group) => group.type === "QUANTITY")
            .map((group) => [
              group.id,
              quantityAddonOptions.filter((option) =>
                group.options.some((groupOption) => groupOption.id === option.option_id)
              ).length,
            ])
        );

        // Build CartItem with separated drink/addon prices for correct PRODUCT credit capping
        const cartItemBase: Omit<CartItem, "cartId"> = {
          menuItemId: menuItem.id,
          name: menuItem.name,
          category: menuItem.category as "latte" | "fusion",
          imageUrl: menuItem.image_url,
          size: voucherSize,
          unitPrice: originalPrice,
          quantity: 1,
          sweetness: "QUARTER",
          iceOption: "NORMAL",
          coldwhisk: false,
          note: "",
          selectedOptionIds,
          quantityMap,
          addonsPrice: addonsCost,
          addonPrices,
          quantityAddonOptions,
          selectedPowderId: menuItem.category === "fusion" ? (voucher.matcha_powder_id ?? undefined) : undefined,
          selectedMilkTypeId: menuItem.category === "latte" ? (voucher.milk_type_id ?? undefined) : undefined,
          clientPriceVnd: originalPrice,
          originalClientPriceVnd: originalPrice,
        };

        // addItem assigns cartId internally
        addItem(cartItemBase);

        // Get the newly added item's cartId (it's last in the list)
        const newCartId = useCartStore.getState().items.at(-1)?.cartId;
        if (newCartId) {
          applyProductVoucher(newCartId, voucher.qr_token, voucher.covered_price_vnd ?? 0);
        }

        setCartOpen(true);
        return { ok: true };
      } catch {
        return { ok: false, reason: "fetch_failed" };
      } finally {
        setLoading(false);
      }
    },
    [addItem, applyProductVoucher, setCartOpen, powders, defaultPowderGram]
  );

  return { addToCart, loading };
}
