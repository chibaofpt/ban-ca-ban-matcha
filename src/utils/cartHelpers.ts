import { CartItem } from "@/src/lib/types/cart";
import type { AddonGroup, MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import { Powder } from "@/src/lib/types/powder";
import { SWEETNESS_OPTIONS, ICE_OPTIONS } from "@/src/constants/orderOptions";
import { ceilTo1000 } from "@/src/utils/pricing";

/** Build a default standalone cart row for a fixed-price Add-on menu item. */
export function buildExtrasCartItem(
  item: MenuItem,
  bundleRewardVoucherToken?: string,
): Omit<CartItem, "cartId"> {
  const unitPrice = item.unit_price_vnd ?? 0;
  return {
    menuItemId: item.id, name: item.name, category: "extras", imageUrl: item.image_url,
    size: null, unitPrice, quantity: 1, sweetness: "FULL", iceOption: "NORMAL",
    coldwhisk: false, note: "", selectedOptionIds: [], quantityMap: {}, addonsPrice: 0,
    addonPrices: {}, quantityAddonOptions: [], clientPriceVnd: unitPrice,
    originalClientPriceVnd: unitPrice, bundleRewardVoucherToken,
  };
}

export function line1ItemDetails(
  item: CartItem,
  menuItem: MenuItem | undefined,
  milkTypes: MilkTypeOption[],
  powders?: Powder[],
): string[] {
  const chips: string[] = [];
  
  // Size
  if (item.size) {
    const sizeLabel = item.size === "SMALL" ? "cá nhỏ (360ml)" : item.size === "MEDIUM" ? "cá vừa (500ml)" : "cá lớn (700ml)";
    chips.push(sizeLabel);
  } else {
    chips.push("Add-on");
  }

  if (!menuItem) return chips;

  // Milk / Powder
  const selectedBaseLiquidId = item.selectedBaseLiquidId ?? item.selectedMilkTypeId;
  if (selectedBaseLiquidId) {
    const liquid = milkTypes.find((candidate) => candidate.id === selectedBaseLiquidId);
    if (liquid) chips.push(liquid.name);
  }
  if (item.category === "fusion") {
    // Fusion
    const pwd = powders?.find(p => p.id === item.selectedPowderId);
    if (pwd) {
      chips.push(pwd.name);
    }
  }

  return chips;
}

export function line2ItemDetails(item: CartItem): string[] {
  if (item.category === "extras") return [];

  const chips: string[] = [];

  // Sweetness
  const sweetnessLabel = SWEETNESS_OPTIONS.find((o) => o.value === item.sweetness)?.label;
  if (sweetnessLabel) chips.push(`Ngọt ${sweetnessLabel}`);

  // Ice
  if (item.iceOption !== "NORMAL") {
    const iceLabel = ICE_OPTIONS.find((o) => o.value === item.iceOption)?.label;
    if (iceLabel) {
      chips.push(iceLabel);
    }
  }

  // Coldwhisk
  if (item.coldwhisk) {
    chips.push("Coldwhisk");
  }

  return chips;
}

export function addonsDetails(
  item: CartItem,
  menuItem: MenuItem | undefined,
  addonGroups: AddonGroup[],
  powders?: Powder[],
): string[] {
  const chips: string[] = [];
  if (!menuItem) return chips;

  // SELECTOR + TOGGLE addons
  for (const g of addonGroups) {
    if (g.type === "SELECTOR" || g.type === "TOGGLE") {
      for (const opt of g.options) {
        if (item.selectedOptionIds.includes(opt.id)) {
          // Extra matcha
          if (opt.gram_value != null) {
            if (powders) {
              const powderId = item.category === "fusion" ? item.selectedPowderId : menuItem.powder?.id;
              const pwd = powders.find(p => p.id === powderId);
              if (pwd) {
                const pwdPricePerGram = pwd.price_per_gram ?? 0;
                const rawCost = opt.gram_value * pwdPricePerGram;
                const cost = ceilTo1000(rawCost);
                const priceSuffix = cost > 0 ? ` (+${cost / 1000}k)` : "";
                chips.push(`+${opt.gram_value}g ${pwd.name}${priceSuffix}`);
              } else {
                chips.push(`+${opt.gram_value}g${opt.price_vnd > 0 ? ` (+${opt.price_vnd / 1000}k)` : ""}`);
              }
            } else {
               chips.push(`+${opt.gram_value}g${opt.price_vnd > 0 ? ` (+${opt.price_vnd / 1000}k)` : ""}`);
            }
            continue;
          }

          // Other SELECTOR / TOGGLE addons
          const price = opt.price_vnd;
          const priceSuffix = price > 0 ? ` (+${price / 1000}k)` : "";
          chips.push(`${opt.label}${priceSuffix}`);
        }
      }
    }
  }

  // QUANTITY addons
  for (const g of addonGroups) {
    if (g.type === "QUANTITY") {
      const qty = item.quantityMap[g.id] ?? 0;
      if (qty > 0 && g.options[0]) {
        const opt = g.options[0];
        
        // Other quantity addons
        const rawCost = qty * opt.price_vnd;
        const cost = ceilTo1000(rawCost);
        const priceSuffix = cost > 0 ? ` (+${cost / 1000}k)` : "";
        chips.push(`${qty}x ${g.name}${priceSuffix}`);
      }
    }
  }

  return chips;
}
