import type { SweetnessLevel, Size } from "./menu";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";

export type IceOption = "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE";

/** A single row in the staff/customer cart. */
export interface CartItem {
  /** Unique cart row id — crypto.randomUUID() at add time. */
  cartId: string;
  menuItemId: string;
  name: string;
  category: "latte" | "fusion" | "extras";
  imageUrl: string | null;
  /** Required for drinks; null for fixed-price Add-on items. */
  size: Size | null;
  /** Snapshot of computed final price at add time (post-ceil, post-milk, post-powder). */
  unitPrice: number;
  quantity: number;
  sweetness: SweetnessLevel;
  iceOption: IceOption;
  coldwhisk: boolean;
  note: string;
  /** Selected option ids for SELECTOR and TOGGLE groups. */
  selectedOptionIds: string[];
  /** { [addon_group_id]: qty } for QUANTITY groups — display only. */
  quantityMap: Record<string, number>;
  /** Total addon cost snapshot in VND. */
  addonsPrice: number;
  /** Exact price for each selected addon option. Used for precise Addon Voucher discounts. */
  addonPrices: Record<string, number>;
  /** Resolved QUANTITY addon options (option_id + qty > 0 only). Sent to API. */
  quantityAddonOptions: { option_id: string; quantity: number }[];
  /** Fusion only — selected powder id. */
  selectedPowderId?: string;
  /** Latte only — selected milk type id. */
  selectedMilkTypeId?: string;
  /** Current Base Liquid selection; selectedMilkTypeId remains as a legacy alias. */
  selectedBaseLiquidId?: string;
  /**
   * Client-computed final price (= unitPrice). Required by API.
   * Server recomputes and rejects entire order on mismatch (PRICE_CHANGED).
   */
  clientPriceVnd: number;
  /**
   * Original price before any PRODUCT voucher credit was applied.
   * Stored so the cart can restore the correct price if the voucher is removed or swapped.
   * Equals clientPriceVnd when no voucher is applied.
   */
  originalClientPriceVnd: number;
  /** Set when this item was added via a PRODUCT voucher (unit price reduced by voucher credit). */
  productVoucherId?: string;
  productVoucherDiscountVnd?: number;
  /** New ITEM voucher identifier; productVoucherId remains a compatibility alias. */
  itemVoucherId?: string;
  /** In-cart BUNDLE reward line; excluded from persisted cart state. */
  bundleRewardVoucherToken?: string;
  /** In-cart BUNDLE qualifier line; excluded from persisted cart state. */
  bundleQualifierVoucherToken?: string;
  /** Applied ADDON vouchers. Unlimited, each targeting a different addon_option_id. */
  addonVouchers?: { voucherId: string; addonOptionId: string; discountVnd: number }[];
}

export type BundleApplicationStatus = "REVALIDATING" | "READY" | "NEEDS_CONFIGURATION" | "CONFLICT" | "UNAVAILABLE" | "VERIFY_FAILED" | "NO_BENEFIT";

export type BundleCreatedRewardEffect =
  | { kind: "LINE"; client_line_id: string }
  | { kind: "ADDON"; client_line_id: string; addon_option_id: string; quantity: number };

/** Client-only bookkeeping for one persisted BUNDLE voucher application. */
export interface CartBundleApplication {
  voucher_qr_token: string;
  owner_key: string;
  qualifier_allocations: BundleSelectionAllocation[];
  reward_allocations: BundleSelectionAllocation[];
  created_reward_effects: BundleCreatedRewardEffect[];
  status?: BundleApplicationStatus;
  message?: string;
}
