import type { SweetnessLevel, Size } from "./menu";

export type IceOption = "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE";

/** A single row in the staff/customer cart. */
export interface CartItem {
  /** Unique cart row id — crypto.randomUUID() at add time. */
  cartId: string;
  menuItemId: string;
  name: string;
  category: "latte" | "fusion";
  imageUrl: string | null;
  /** Always required — all items have M/L/XL. */
  size: Size;
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
  /** Resolved QUANTITY addon options (option_id + qty > 0 only). Sent to API. */
  quantityAddonOptions: { option_id: string; quantity: number }[];
  /** Fusion only — selected powder id. */
  selectedPowderId?: string;
  /** Latte only — selected milk type id. */
  selectedMilkTypeId?: string;
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
  /** Explicit list of human-readable customization details to display in the cart. */
  details?: string[];
}
