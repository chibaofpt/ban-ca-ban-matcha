/**
 * useAddVoucherToCart — Handles "Dùng ngay" flow for PRODUCT vouchers.
 *
 * Fetches current menu data, resolves the voucher configuration, and adds a
 * minimal CartItem whose price and benefit are projected from current data.
 *
 * Usage: Call addToCart(voucher) from MyVouchersPage VoucherCard.
 */

"use client";

import { useState, useCallback } from "react";
import { useCartStore } from "@/src/lib/store/cartStore";
import type { usePowderStore } from "@/src/lib/store/powderStore";
import { fetchMenu } from "@/src/services/menuService";
import {
  calcBaseLiquidDelta,
  calcLattePrice,
  calcFusionPrice,
  resolveGram,
  ceilTo1000,
} from "@/src/utils/pricing";
import { getBaseLiquidOptionsForItem } from "@/src/utils/baseLiquid";
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
export function computeVoucherItemPrice(
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
    const milk_ml = sizeObj?.base_liquid_ml ?? sizeObj?.milk_ml ?? 0;
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
    const selectedLiquid = milkTypes.find((candidate) => candidate.id === milkTypeId);
    const defaultLiquid = milkTypes.find(
      (candidate) => candidate.id === menuItem.default_base_liquid_id,
    );
    const liquidMl = sizeObj?.base_liquid_ml ?? sizeObj?.milk_ml ?? 0;
    drinkPrice = calcFusionPrice({
      base_price_vnd,
      gram,
      powder_price_per_gram: pwd_price_per_gram,
      premium_latte,
      base_liquid_delta_vnd: selectedLiquid && defaultLiquid
        ? calcBaseLiquidDelta(
            liquidMl,
            selectedLiquid.price_per_ml,
            defaultLiquid.price_per_ml,
          )
        : 0,
    });
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

/** Compute one PRODUCT_DISCOUNT benefit from canonical drink-only prices. */
export function computeProductDiscountBenefit(
  voucher: Pick<MyVoucher, "product_discount_mode" | "discount_value">,
  actualDrinkPrice: number,
  referenceDrinkPrice: number | null,
): number {
  if (voucher.product_discount_mode === "FIXED_AMOUNT") {
    return Math.min(actualDrinkPrice, Math.max(0, voucher.discount_value ?? 0));
  }
  return referenceDrinkPrice === null ? 0 : Math.max(0, actualDrinkPrice - referenceDrinkPrice);
}

/** Resolve a PRODUCT voucher Base Liquid against the item's current allow-list. */
export function resolveVoucherBaseLiquidId(
  menuItem: MenuItem,
  requestedId: string | null,
  activeLiquids: MilkTypeOption[],
): string | null {
  const configured = getBaseLiquidOptionsForItem(menuItem, activeLiquids);
  const options = menuItem.default_base_liquid_id ? configured : activeLiquids;
  const requested = options.find((liquid) => liquid.id === requestedId);
  if (requested) return requested.id;
  return options.find((liquid) => liquid.id === menuItem.default_base_liquid_id)?.id
    ?? options.find((liquid) => liquid.is_default)?.id
    ?? null;
}

/**
 * Hook for the "Dùng ngay" flow.
 * Returns addToCart function and loading state.
 */
export function useAddVoucherToCart() {
  const { addItem, setCartOpen } = useCartStore();
  const [loading, setLoading] = useState(false);

  const addToCart = useCallback(
    async (
      voucher: MyVoucher,
      selection?: { menuItemId: string; size: Size },
      canCommit: () => boolean = () => true,
    ): Promise<AddVoucherResult> => {
      const supportsAddToCart = voucher.voucher_type === "PRODUCT" ||
        voucher.voucher_type === "PRODUCT_DISCOUNT" || voucher.voucher_type === "ITEM";
      const targetMenuItemId = selection?.menuItemId
        ?? voucher.eligible_menu_items?.[0]?.menu_item_id
        ?? voucher.menu_item_id;
      if (!supportsAddToCart || !targetMenuItemId) {
        return { ok: false, reason: "fetch_failed" };
      }

      setLoading(true);
      try {
        // Fetch fresh menu data (cannot rely on MenuPage cache from outside that context)
        const menuData = await fetchMenu();
        const allItems = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];
        const menuItem = allItems.find((i) => i.id === targetMenuItemId);
        if (!menuItem) {
          return { ok: false, reason: "item_unavailable" };
        }

        if (voucher.voucher_type === "ITEM") {
          if (menuItem.category !== "extras" || menuItem.unit_price_vnd == null) {
            return { ok: false, reason: "item_unavailable" };
          }
          if (!canCommit()) return { ok: false, reason: "fetch_failed" };
          const result = addItem({
            menuItemId: menuItem.id,
            quantity: 1,
            configuration: { size: null, note: "" },
            lineVoucher: { token: voucher.qr_token, kind: "ITEM" },
            addonVouchers: [],
          });
          if (!result.ok) return { ok: false, reason: "fetch_failed" };
          setCartOpen(true);
          return { ok: true };
        }

        // Use voucher's size config (soft match: item must support this size)
        const selectedScope = voucher.eligible_menu_items?.find((target) => target.menu_item_id === targetMenuItemId);
        const voucherSize = (voucher.voucher_type === "PRODUCT_DISCOUNT"
          ? selection?.size ?? voucher.eligible_sizes?.find((size) => menuItem.sizes.some((row) => row.size === size && row.base_price_vnd !== null))
          : selectedScope?.size ?? voucher.size) as Size | undefined;
        if (!voucherSize) return { ok: false, reason: "size_unavailable" };
        const sizeObj = menuItem.sizes.find((s) => s.size === voucherSize);
        if (!sizeObj || sizeObj.base_price_vnd == null) {
          return { ok: false, reason: "size_unavailable" };
        }

        // Resolve addons — voucher.included_addon_option_ids is the snapshot config
        const includedAddonIds = (voucher as MyVoucher & { included_addon_option_ids?: string[] }).included_addon_option_ids ?? [];

        const resolvedBaseLiquidId = resolveVoucherBaseLiquidId(
          menuItem,
          selectedScope?.milk_type_id ?? voucher.milk_type_id ?? null,
          menuData.base_liquids ?? menuData.milk_types,
        );
        const effectivePowderId = selectedScope?.matcha_powder_id ?? voucher.matcha_powder_id ?? null;
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
        const selectedOptionIds = [...new Set(includedAddonIds)];


        // Build CartItem with separated drink/addon prices for correct PRODUCT credit capping
        const cartItemBase: Omit<CartItem, "cartId"> = {
          menuItemId: menuItem.id,
          quantity: 1,
          configuration: {
            size: voucherSize,
            sweetness: "QUARTER",
            iceOption: "NORMAL",
            coldwhisk: false,
            note: "",
            ...(menuItem.category === "fusion" && effectivePowderId ? { powderId: effectivePowderId } : {}),
            ...(resolvedBaseLiquidId ? { baseLiquidId: resolvedBaseLiquidId } : {}),
            addonOptionIds: selectedOptionIds,
          },
          lineVoucher: {
            token: voucher.qr_token,
            kind: voucher.voucher_type === "PRODUCT_DISCOUNT" ? "PRODUCT_DISCOUNT" : "PRODUCT",
          },
          addonVouchers: [],
        };

        if (!canCommit()) return { ok: false, reason: "fetch_failed" };
        const result = addItem(cartItemBase);
        if (!result.ok) return { ok: false, reason: "fetch_failed" };

        setCartOpen(true);
        return { ok: true };
      } catch {
        return { ok: false, reason: "fetch_failed" };
      } finally {
        setLoading(false);
      }
    },
    [addItem, setCartOpen]
  );

  return { addToCart, loading };
}
