import type { CartItem, ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import { ICE_OPTIONS, SWEETNESS_OPTIONS } from "@/src/constants/orderOptions";

/** Build a minimal standalone cart row for a fixed-price extras item. */
export function buildExtrasCartItem(item: MenuItem, _bundleToken?: string): Omit<CartItem, "cartId"> {
  return { menuItemId: item.id, quantity: 1, configuration: { size: null, note: "" }, addonVouchers: [] };
}

export function line1ItemDetails(
  item: ProjectedCartLine,
  menuItem: MenuItem | undefined,
  milkTypes: MilkTypeOption[],
  powders?: Powder[],
): string[] {
  const config = item.configuration;
  const chips: string[] = [];
  if (config.size) chips.push(config.size === "SMALL" ? "cá nhỏ (360ml)" : config.size === "MEDIUM" ? "cá vừa (500ml)" : "cá lớn (700ml)");
  else chips.push("Add-on");
  if (!menuItem || config.size === null) return chips;
  const liquid = milkTypes.find((candidate) => candidate.id === config.baseLiquidId);
  if (liquid) chips.push(liquid.name);
  if (item.category === "fusion") {
    const powder = powders?.find((candidate) => candidate.id === config.powderId);
    if (powder) chips.push(powder.name);
  }
  return chips;
}

export function line2ItemDetails(item: ProjectedCartLine): string[] {
  const config = item.configuration;
  if (config.size === null) return [];
  const chips: string[] = [];
  const sweetness = SWEETNESS_OPTIONS.find((option) => option.value === config.sweetness)?.label;
  if (sweetness) chips.push(`Ngọt ${sweetness}`);
  if (config.iceOption !== "NORMAL") {
    const ice = ICE_OPTIONS.find((option) => option.value === config.iceOption)?.label;
    if (ice) chips.push(ice);
  }
  if (config.coldwhisk) chips.push("Coldwhisk");
  return chips;
}

export function addonsDetails(item: ProjectedCartLine): string[] {
  return item.resolvedAddons.map((addon) => addon.isExtraMatcha
    ? `${addon.label}${addon.priceVnd > 0 ? ` (+${addon.priceVnd / 1000}k)` : ""}`
    : `${addon.label}${addon.priceVnd > 0 ? ` (+${addon.priceVnd / 1000}k)` : ""}`);
}
