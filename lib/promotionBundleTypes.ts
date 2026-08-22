export type BundleSize = "SMALL" | "MEDIUM" | "LARGE";
export type BundleRewardKind = "PRODUCT" | "ADDON";
export type BundleRewardMode = "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
export type BundleBenefitScaling = "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";

export interface BundleProductDefinition {
  menu_item_id: string;
  allowed_sizes: BundleSize[];
  default_powder_id: string | null;
  default_base_liquid_id: string | null;
  /** Server-resolved current baseline prices; never accepted from public API. */
  baseline_prices_vnd: Partial<Record<BundleSize, number>>;
  /** Current fixed price for an extras item. */
  baseline_price_vnd?: number;
}

export interface BundleCartAddon {
  addon_option_id: string;
  quantity: number;
  unit_price_vnd: number;
  gram_value: number | null;
  voucher_discounted_quantity?: number;
}

export interface BundleCartItem {
  client_line_id: string;
  menu_item_id: string;
  size: BundleSize | null;
  selected_powder_id: string | null;
  selected_milk_type_id: string | null;
  unit_price_vnd: number;
  quantity: number;
  product_voucher_quantity: number;
  item_voucher_quantity?: number;
  addons: BundleCartAddon[];
}

export interface BundlePromotionRule {
  min_order_vnd: number | null;
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: BundleRewardKind;
  reward_mode: BundleRewardMode;
  benefit_scaling: BundleBenefitScaling;
  max_applications_per_order: number;
  max_reward_units_per_order: number | null;
  qualifier_products: BundleProductDefinition[];
  reward_products: BundleProductDefinition[];
  reward_addon_option_ids: string[];
}

export interface BundleQualifierAllocation {
  client_line_id: string;
  quantity: number;
}

export interface BundleRewardAllocation extends BundleQualifierAllocation {
  addon_option_id?: string;
}

export interface BundleRewardResult {
  client_line_id: string;
  addon_option_id: string | null;
  quantity: number;
  /** Total discount for every unit represented by this result. */
  discount_vnd: number;
}

export interface BundleEvaluationResult {
  application_count: number;
  total_discount_vnd: number;
  rewards: BundleRewardResult[];
}

/** Business error returned by the BUNDLE evaluator with a stable API details.reason. */
export class BundlePromotionError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = "BundlePromotionError";
  }
}
