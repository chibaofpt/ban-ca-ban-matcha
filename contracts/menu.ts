/** All menu categories. Extras are fixed-price non-drink menu items. */
export type Category = "latte" | "fusion" | "extras";

export type Size = "SMALL" | "MEDIUM" | "LARGE";

export type SweetnessLevel =
  | "NONE"
  | "QUARTER"
  | "HALF"
  | "THREE_QUARTER"
  | "FULL"
  | "EXTRA";

export interface AddonOption {
  id: string;
  label: string;
  image_url: string | null;
  /** Always 0 for extra matcha; actual price uses the selected powder. */
  price_vnd: number;
  /** Gram amount for extra matcha options; null for other addon types. */
  gram_value: number | null;
  sort_order: number;
}

export interface AddonGroup {
  id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
  max_select: number;
  is_dynamic_gram: boolean;
  options: AddonOption[];
}

/** Milk option attached to Latte items only. */
export interface MilkTypeOption {
  id: string;
  name: string;
  price_per_ml: number;
  is_default: boolean;
  display_order: number;
  is_active?: boolean;
  image_url?: string | null;
}

export type BaseLiquidOption = MilkTypeOption;

export interface MenuItemPowder {
  id: string;
  name: string;
  type: "RECOMMEND" | "NEW" | "SEASONAL" | "NONE";
}

export interface MenuItemSize {
  size: Size;
  /** Runtime base price; the final price is computed by pricing. */
  base_price_vnd: number;
  /** Default milk volume for this size. */
  milk_ml: number;
  /** Effective Base Liquid volume after item override and system fallback. */
  base_liquid_ml?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: Category;
  unit_price_vnd?: number | null;
  is_seasonal: boolean;
  image_url: string | null;
  sort_order: number;
  base_liquid_note: string | null;
  custom_powder_grams: {
    SMALL?: number;
    MEDIUM?: number;
    LARGE?: number;
  } | null;
  powder: MenuItemPowder | null;
  resolved_default_powder_id: string | null;
  allowed_powder_ids: string[];
  default_base_liquid_id?: string | null;
  allowed_base_liquid_ids?: string[];
  sizes: MenuItemSize[];
}

/** The complete menu structure returned by GET /api/menu. */
export interface MenuData {
  updated_at: string;
  latte: MenuItem[];
  fusion: MenuItem[];
  extras?: MenuItem[];
  milk_types: MilkTypeOption[];
  base_liquids?: BaseLiquidOption[];
  addon_groups: AddonGroup[];
}
