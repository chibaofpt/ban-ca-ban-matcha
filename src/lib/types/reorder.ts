import type { IceOption } from "@/src/lib/types/cart";
import type {
  Category,
  Size,
  SweetnessLevel,
} from "@/src/lib/types/menu";

export type ReorderWarningType =
  | "ITEM_UNAVAILABLE"
  | "SIZE_UNAVAILABLE"
  | "ADDON_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "MILK_UNAVAILABLE"
  | "POWDER_UNAVAILABLE";

export interface ReorderWarning {
  type: ReorderWarningType;
  itemName: string;
  details: string;
}

export interface HistoryOrderItem {
  menu_item_id: string;
  quantity: number;
  size: Size;
  unit_price_vnd: number;
  addons_price_vnd: number;
  sweetness: SweetnessLevel;
  ice_option: IceOption;
  coldwhisk: boolean;
  note: string | null;
  selected_powder_id: string | null;
  selected_milk_type_id: string | null;
  menuItem: { name: string; category: Category };
  addons: Array<{
    addon_option_id: string;
    unit_price_vnd: number;
    quantity: number;
    addonOption: {
      label: string;
      price_vnd: number;
      gram_value: string | null;
      group: { name: string };
    };
  }>;
}
