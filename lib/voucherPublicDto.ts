import type {
  DiscountType,
  Role,
  Size,
  UsedChannel,
  VoucherStatus,
  VoucherType,
  VoucherAcquisitionMode,
} from "@prisma/client";

interface VoucherDtoSource {
  id?: unknown;
  user_id?: unknown;
  package_id?: unknown;
  redeemed_by?: unknown;
  qr_token: string;
  voucher_type: VoucherType;
  discount_type: DiscountType | null;
  discount_value: number | null;
  menu_item_id: string | null;
  size: Size | null;
  matcha_powder_id: string | null;
  milk_type_id: string | null;
  included_addon_option_ids: string[];
  addon_option_id: string | null;
  covered_price_vnd: number | null;
  covered_delivery_fee_vnd: number | null;
  min_order_vnd: number | null;
  status: VoucherStatus;
  used_channel: UsedChannel | null;
  expires_at: Date | null;
  redeemed_at: Date | null;
  created_at: Date;
  package: {
    name: string;
    description: string | null;
    points_cost: number;
    acquisition_mode?: VoucherAcquisitionMode;
    promotion?: unknown;
  };
  menuItem: { name: string; is_available: boolean } | null;
  addonOption: { label: string } | null;
  staff: { name: string; role: Role } | null;
}

/** Map a database voucher to the only voucher shape allowed across API/UI boundaries. */
export function toPublicVoucherDto(voucher: VoucherDtoSource) {
  return {
    qr_token: voucher.qr_token,
    voucher_type: voucher.voucher_type,
    discount_type: voucher.discount_type,
    discount_value: voucher.discount_value,
    menu_item_id: voucher.menu_item_id,
    size: voucher.size,
    matcha_powder_id: voucher.matcha_powder_id,
    milk_type_id: voucher.milk_type_id,
    included_addon_option_ids: voucher.included_addon_option_ids,
    addon_option_id: voucher.addon_option_id,
    covered_price_vnd: voucher.covered_price_vnd,
    covered_delivery_fee_vnd: voucher.covered_delivery_fee_vnd,
    min_order_vnd: voucher.min_order_vnd,
    status: voucher.status,
    used_channel: voucher.used_channel,
    expires_at: voucher.expires_at,
    redeemed_at: voucher.redeemed_at,
    created_at: voucher.created_at,
    package: voucher.package,
    menuItem: voucher.menuItem,
    addonOption: voucher.addonOption,
    staff: voucher.staff,
  };
}
