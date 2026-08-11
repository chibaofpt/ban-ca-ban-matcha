/** All menu categories — exactly 2 in Phase 2. */
export type Category = "latte" | "fusion";

export type Size = "SMALL" | "MEDIUM" | "LARGE";

export type SweetnessLevel =
  | "NONE"
  | "QUARTER"
  | "HALF"
  | "THREE_QUARTER"
  | "FULL"
  | "EXTRA";

// ── Addon types ────────────────────────────────────────────────────────────────

export interface AddonOption {
  id: string;
  label: string;
  /** Always 0 for extra matcha — actual price = gram_value × selected_powder.price_per_gram */
  price_vnd: number;
  /** gram amount for extra matcha options; null for all other addon types */
  gram_value: number | null;
  sort_order: number;
}

export interface AddonGroup {
  id: string;
  name: string;
  image_url: string | null;
  type: "SELECTOR" | "TOGGLE" | "QUANTITY";
  max_quantity: number | null;
  options: AddonOption[];
}

// ── Milk ───────────────────────────────────────────────────────────────────────

/** Milk option attached to Latte items only. */
export interface MilkTypeOption {
  id: string;
  name: string;
  price_per_ml: number;
  is_default: boolean;
  display_order: number;
}

// ── Powder (lightweight — for menu response only) ──────────────────────────────

export interface MenuItemPowder {
  id: string;
  name: string;
  type: "RECOMMEND" | "NEW" | "SEASONAL" | "NONE";
}

// ── Size ───────────────────────────────────────────────────────────────────────

export interface MenuItemSize {
  size: Size;
  /** Runtime base price (not final). Final price computed by pricing.ts. */
  base_price_vnd: number;
  /** ml of default milk for this size — from default_size_config. Used for milk swap recalculation. */
  milk_ml: number;
}

// ── MenuItem ───────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: Category;
  is_seasonal: boolean;
  image_url: string | null;
  sort_order: number;

  /** Fusion only — display text for base liquid (e.g. "Nước ép cam"). */
  base_liquid_note: string | null;

  custom_powder_grams: {
    SMALL?: number;
    MEDIUM?: number;
    LARGE?: number;
  } | null;

  /** Latte only — the fixed powder for this item. */
  powder: MenuItemPowder | null;

  /** Fusion only — server-resolved default powder id; never null in API response. */
  resolved_default_powder_id: string | null;

  /** Fusion only — powder ids that can be swapped. Empty = swap UI hidden. */
  allowed_powder_ids: string[];

  /** Sizes with base_price_vnd != null only (null sizes are excluded entirely). */
  sizes: MenuItemSize[];
}

/** The complete menu structure returned by GET /api/menu. */
export interface MenuData {
  updated_at: string;
  latte: MenuItem[];
  fusion: MenuItem[];
  /** All active milk types; consumers apply them to Latte items only. */
  milk_types: MilkTypeOption[];
  /** All active addon groups; applies globally to every menu item. */
  addon_groups: AddonGroup[];
}

/** Admin-facing shape returned by GET /api/admin/menu. Includes unavailable items and all sizes (even null base_price_vnd). */
export interface AdminMenuItem {
  id: string;
  name: string;
  description: string | null;
  category: Category;
  is_seasonal: boolean;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  base_liquid_note: string | null;
  custom_powder_grams: { M?: number; L?: number; XL?: number } | null;
  updated_at: string;
  /** Latte only */
  matcha_powder_id: string | null;
  powder: MenuItemPowder | null;
  /** Fusion only */
  default_powder_id: string | null;
  default_powder: MenuItemPowder | null;
  allowed_powder_ids: string[];
  /** All 3 size rows — base_price_vnd may be null (size not sold). */
  sizes: { size: Size; base_price_vnd: number | null; milk_ml: number }[];
}
