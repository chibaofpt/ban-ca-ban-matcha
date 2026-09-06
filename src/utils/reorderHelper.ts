import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type {
  HistoryOrderItem,
  ReorderWarning,
} from "@/src/lib/types/reorder";
import { calcLattePrice, calcFusionPrice, calcBaseLiquidDelta, resolveGram, ceilTo1000, formatMoney } from "@/src/utils/pricing";
import { getBaseLiquidOptionsForItem } from "@/src/utils/baseLiquid";
import { formatOrderSize } from "@/src/utils/display";

export interface ReorderItemResult {
  cartItem: Omit<CartItem, "cartId"> | null;
  warnings: ReorderWarning[];
  configSummary: string[];
}

/** Return selected addon IDs that may legally receive an ADDON voucher. */
export function getReorderVoucherEligibleAddonIds(
  menuData: MenuData,
  item: Pick<CartItem, "selectedOptionIds">,
): string[] {
  const selectedIds = new Set(item.selectedOptionIds);
  return menuData.addon_groups.flatMap((group) =>
    group.options
      .filter(
        (option) => selectedIds.has(option.id) && option.gram_value === null,
      )
      .map((option) => option.id),
  );
}

/**
 * Validates a single past order item against current menu data and builds a CartItem payload.
 */
export function buildReorderItem(
  item: HistoryOrderItem,
  menuData: MenuData,
  powderData: PowderApiResponse
): ReorderItemResult {
  const warnings: ReorderWarning[] = [];
  const configSummary: string[] = [];

  // 1. Find menu item
  const allMenuItems = [
    ...(menuData.latte || []),
    ...(menuData.fusion || []),
    ...(menuData.extras || []),
  ];
  const menuItem = allMenuItems.find(m => m.id === item.menu_item_id);

  if (!menuItem) {
    warnings.push({
      type: "ITEM_UNAVAILABLE",
      itemName: item.menuItem.name,
      details: "Món này hiện không còn phục vụ."
    });
    return { cartItem: null, warnings, configSummary };
  }

  configSummary.push(`${menuItem.name} — ${item.size ? formatOrderSize(item.size) : "Add-on"}`);

  if (menuItem.category === "extras") {
    const fixedPrice = menuItem.unit_price_vnd ?? 0;
    if (fixedPrice < 1000 || fixedPrice % 1000 !== 0) {
      warnings.push({ type: "ITEM_UNAVAILABLE", itemName: menuItem.name, details: "Giá Add-on hiện không hợp lệ." });
      return { cartItem: null, warnings, configSummary };
    }
    if (item.unit_price_vnd !== fixedPrice) {
      warnings.push({
        type: "PRICE_CHANGED",
        itemName: menuItem.name,
        details: `Giá đã thay đổi từ ${formatMoney(item.unit_price_vnd)}đ sang ${formatMoney(fixedPrice)}đ`,
      });
    }
    return {
      cartItem: {
        menuItemId: menuItem.id,
        name: menuItem.name,
        category: "extras",
        imageUrl: menuItem.image_url,
        size: null,
        quantity: item.quantity,
        sweetness: item.sweetness,
        iceOption: item.ice_option,
        coldwhisk: false,
        note: item.note || "",
        selectedOptionIds: [],
        addonsPrice: 0,
        addonPrices: {},
        unitPrice: fixedPrice,
        clientPriceVnd: fixedPrice,
        originalClientPriceVnd: fixedPrice,
      },
      warnings,
      configSummary,
    };
  }

  if (!item.size) {
    warnings.push({ type: "SIZE_UNAVAILABLE", itemName: menuItem.name, details: "Món nước trong lịch sử thiếu size hợp lệ." });
    return { cartItem: null, warnings, configSummary };
  }

  // 2. Find size
  const sizeConfig = menuItem.sizes.find(s => s.size === item.size);
  if (!sizeConfig || sizeConfig.base_price_vnd === null) {
    warnings.push({
      type: "SIZE_UNAVAILABLE",
      itemName: menuItem.name,
      details: `Size ${formatOrderSize(item.size)} hiện không còn bán.`
    });
    return { cartItem: null, warnings, configSummary };
  }

  // Sweetness & Ice & Coldwhisk config display
  const sweetnessMap: Record<string, string> = { NONE: "0%", QUARTER: "25%", HALF: "50%", THREE_QUARTER: "75%", FULL: "100%", EXTRA: "120%" };
  const iceMap: Record<string, string> = { LESS_ICE: "Ít đá", NO_ICE: "Không đá", SEPARATE_ICE: "Đá riêng", NORMAL: "" };

  const baseConfigs = [`Ngọt ${sweetnessMap[item.sweetness] || item.sweetness}`];
  if (item.ice_option !== "NORMAL" && iceMap[item.ice_option]) {
    baseConfigs.push(iceMap[item.ice_option]);
  }
  if (item.coldwhisk) baseConfigs.push("Coldwhisk");

  // 3. Resolve Milk & Powder
  let finalMilkTypeId: string | undefined = undefined;
  let finalPowderId: string | undefined = undefined;
  let powderGram = 0;
  let powderPricePerGram = 0;

  if (menuItem.category === "latte") {
    // Check milk
    const catalogLiquids = menuData.base_liquids ?? menuData.milk_types ?? [];
    const configuredLiquids = getBaseLiquidOptionsForItem(menuItem, catalogLiquids);
    // Compatibility for cached menu payloads created before per-item allow-lists existed.
    const activeMilkTypes = menuItem.default_base_liquid_id
      ? configuredLiquids
      : catalogLiquids;
    const requestedMilk = activeMilkTypes.find(
      (milk) => milk.id === item.selected_milk_type_id,
    );
    const defaultMilk = activeMilkTypes.find(
      (milk) => milk.id === menuItem.default_base_liquid_id,
    ) ?? activeMilkTypes.find((milk) => milk.is_default);
    const resolvedMilk = requestedMilk ?? defaultMilk;
    if (item.selected_milk_type_id && !requestedMilk) {
      warnings.push({
        type: "MILK_UNAVAILABLE",
        itemName: menuItem.name,
        details: `Loại sữa cũ không còn. Tự động chuyển sang ${defaultMilk?.name || "Sữa bò"}.`
      });
    }
    if (resolvedMilk) {
      finalMilkTypeId = resolvedMilk.id;
      baseConfigs.push(resolvedMilk.name);
    }

    // Check powder (Latte uses fixed powder from item)
    finalPowderId = menuItem.powder?.id;
    if (finalPowderId) {
      const powder = powderData.data.find(p => p.id === finalPowderId);
      if (powder) {
        powderPricePerGram = powder.price_per_gram;
        powderGram = resolveGram(
          item.size,
          menuItem.custom_powder_grams,
          powder.size_config,
          powderData.default_powder_gram
        );
      }
    }
  } else {
    // Fusion: Check powder
    const activePowders = powderData.data.filter((powder) => powder.is_available);
    const defaultPowder = activePowders.find(
      (powder) => powder.id === menuItem.resolved_default_powder_id,
    );
    const requestedPowder = activePowders.find(
      (powder) =>
        powder.id === item.selected_powder_id &&
        (powder.id === menuItem.resolved_default_powder_id ||
          (menuItem.allowed_powder_ids ?? []).includes(powder.id)),
    );
    const resolvedPowder = requestedPowder ?? defaultPowder;
    if (item.selected_powder_id && !requestedPowder) {
      warnings.push({
        type: "POWDER_UNAVAILABLE",
        itemName: menuItem.name,
        details: `Loại bột matcha cũ không còn. Tự động chuyển sang ${defaultPowder?.name || "Mặc định"}.`
      });
    }
    if (resolvedPowder) {
      finalPowderId = resolvedPowder.id;
      baseConfigs.push(resolvedPowder.name);
    }

    if (finalPowderId) {
      const p = powderData.data.find(p => p.id === finalPowderId);
      if (p) {
        powderPricePerGram = p.price_per_gram;
        powderGram = resolveGram(
          item.size,
          menuItem.custom_powder_grams,
          p.size_config,
          powderData.default_powder_gram
        );
      }
    }

    const baseLiquidOptions = getBaseLiquidOptionsForItem(
      menuItem,
      menuData.base_liquids ?? menuData.milk_types,
    );
    const requestedBaseLiquid = baseLiquidOptions.find(
      (liquid) => liquid.id === item.selected_milk_type_id,
    );
    const defaultBaseLiquid = baseLiquidOptions.find(
      (liquid) => liquid.id === menuItem.default_base_liquid_id,
    );
    const resolvedBaseLiquid = requestedBaseLiquid ?? defaultBaseLiquid;
    if (item.selected_milk_type_id && !requestedBaseLiquid) {
      warnings.push({
        type: "BASE_LIQUID_UNAVAILABLE",
        itemName: menuItem.name,
        details: `Base Liquid cũ không còn khả dụng. Đã chuyển về ${defaultBaseLiquid?.name ?? "mặc định"}.`,
      });
    }
    if (resolvedBaseLiquid) {
      finalMilkTypeId = resolvedBaseLiquid.id;
      baseConfigs.push(resolvedBaseLiquid.name);
    }
  }

  configSummary.push(baseConfigs.join(" · "));

  // 4. Resolve Addons
  const selectedOptionIds: string[] = [];
  const addonPrices: Record<string, number> = {};
  let totalAddonsPrice = 0;
  const addonNames: string[] = [];

  for (const oldAddon of item.addons) {
    let found = false;
    for (const group of (menuData.addon_groups || [])) {
      const option = group.options.find(o => o.id === oldAddon.addon_option_id);
      if (option) {
        found = true;
        let price = option.price_vnd;
        let label = option.label;

        // Extra matcha pricing
        if (option.gram_value !== null) {
          price = ceilTo1000(option.gram_value * powderPricePerGram);
          const pData = powderData.data.find(p => p.id === finalPowderId);
          label = `+${option.gram_value}g ${pData?.name || "Matcha"}`;
        }

        selectedOptionIds.push(option.id);
        addonPrices[option.id] = price;
        totalAddonsPrice += price;
        addonNames.push(label);
        break;
      }
    }

    if (!found) {
      warnings.push({
        type: "ADDON_UNAVAILABLE",
        itemName: oldAddon.addonOption.label,
        details: "Tuỳ chọn này không còn phục vụ. (Món chính vẫn được thêm)"
      });
    }
  }

  if (addonNames.length > 0) {
    configSummary.push(addonNames.join(" · "));
  }

  // 5. Calculate new drink price
  let newDrinkPrice = sizeConfig.base_price_vnd;
  if (menuItem.category === "latte") {
    const milk = (menuData.milk_types || []).find(m => m.id === finalMilkTypeId);
    newDrinkPrice = calcLattePrice({
      base_price_vnd: sizeConfig.base_price_vnd,
      gram: powderGram,
      powder_price_per_gram: powderPricePerGram,
      milk_ml: sizeConfig.milk_ml,
      milk_price_per_ml: milk?.price_per_ml || 0
    });
  } else {
    // Fusion premium calc
    let premiumLatte = 0;
    if (finalPowderId && finalPowderId !== menuItem.resolved_default_powder_id) {
      const selectedP = powderData.data.find(p => p.id === finalPowderId);
      const defaultP = powderData.data.find(p => p.id === menuItem.resolved_default_powder_id);
      if (selectedP && selectedP.reference_latte_item_id && defaultP && defaultP.reference_latte_item_id) {
        const sLatte = allMenuItems.find(m => m.id === selectedP.reference_latte_item_id);
        const dLatte = allMenuItems.find(m => m.id === defaultP.reference_latte_item_id);
        const sSize = sLatte?.sizes.find(s => s.size === item.size)?.base_price_vnd || 0;
        const dSize = dLatte?.sizes.find(s => s.size === item.size)?.base_price_vnd || 0;
        premiumLatte = sSize - dSize;
      }
    }

    newDrinkPrice = calcFusionPrice({
      base_price_vnd: sizeConfig.base_price_vnd,
      gram: powderGram,
      powder_price_per_gram: powderPricePerGram,
      premium_latte: premiumLatte,
      base_liquid_delta_vnd: (() => {
        const liquids = menuData.base_liquids ?? menuData.milk_types;
        const selected = liquids.find((liquid) => liquid.id === finalMilkTypeId);
        const fallback = liquids.find((liquid) => liquid.id === menuItem.default_base_liquid_id);
        return selected && fallback
          ? calcBaseLiquidDelta(
              sizeConfig.base_liquid_ml ?? sizeConfig.milk_ml,
              selected.price_per_ml,
              fallback.price_per_ml,
            )
          : 0;
      })(),
    });
  }

  // 6. Check price changes
  const oldTotalPrice = item.unit_price_vnd + item.addons_price_vnd;
  const newTotalPrice = newDrinkPrice + totalAddonsPrice;
  if (oldTotalPrice !== newTotalPrice) {
    warnings.push({
      type: "PRICE_CHANGED",
      itemName: menuItem.name,
      details: `Giá đã thay đổi từ ${formatMoney(oldTotalPrice)}đ sang ${formatMoney(newTotalPrice)}đ`
    });
  }

  // 7. Build CartItem
  const cartItem: Omit<CartItem, "cartId"> = {
    menuItemId: menuItem.id,
    name: menuItem.name,
    category: menuItem.category,
    imageUrl: menuItem.image_url,
    size: item.size,
    quantity: item.quantity,
    sweetness: item.sweetness,
    iceOption: item.ice_option,
    coldwhisk: item.coldwhisk,
    note: item.note || "",
    selectedOptionIds,
    addonsPrice: totalAddonsPrice,
    addonPrices,
    selectedPowderId: finalPowderId,
    selectedMilkTypeId: finalMilkTypeId,
    selectedBaseLiquidId: finalMilkTypeId,
    unitPrice: newTotalPrice,
    clientPriceVnd: newTotalPrice,
    originalClientPriceVnd: newTotalPrice,
  };

  return { cartItem, warnings, configSummary };
}
