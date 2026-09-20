export type { HistoryOrderItem } from "@/contracts/order";

export type ReorderWarningType =
  | "ITEM_UNAVAILABLE"
  | "SIZE_UNAVAILABLE"
  | "ADDON_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "MILK_UNAVAILABLE"
  | "BASE_LIQUID_UNAVAILABLE"
  | "POWDER_UNAVAILABLE";

export interface ReorderWarning {
  type: ReorderWarningType;
  itemName: string;
  details: string;
}
