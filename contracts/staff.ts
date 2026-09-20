import type { Category, Size } from "./menu";
import type {
  OwnedVoucherStatus,
  VoucherDiscountType,
  VoucherType,
} from "./voucher";

export interface CustomerSearchResult {
  qr_token: string;
  name: string;
  phone_number: string;
  points_balance: number;
}

export interface ScannedVoucherMenuTarget {
  menu_item_id: string;
  name: string;
  category: Category;
  is_available: boolean;
  is_seasonal: boolean;
  size: Size | null;
  matcha_powder_id: string | null;
  milk_type_id: string | null;
  covered_price_vnd: number | null;
}

export type QrScanResult =
  | { type: "user"; data: CustomerSearchResult }
  | {
      type: "voucher";
      data: {
        qr_token: string;
        voucher_type: VoucherType;
        discount_type: VoucherDiscountType | null;
        discount_value: number | null;
        menu_item_id: string | null;
        size: Size | null;
        matcha_powder_id: string | null;
        milk_type_id: string | null;
        covered_price_vnd: number | null;
        has_normalized_targets: boolean;
        eligible_menu_items: ScannedVoucherMenuTarget[];
        status: OwnedVoucherStatus;
        expires_at: string | null;
      };
    };
