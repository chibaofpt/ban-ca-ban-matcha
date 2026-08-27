import type {
  DiscountType,
  Role,
  Size,
  UsedChannel,
  VoucherStatus,
  VoucherType,
  VoucherAcquisitionMode,
  ProductDiscountMode,
} from "@prisma/client";
import { toBundleRuleDto, type BundleRuleDtoSource } from "@/lib/voucherBundleDto";
import type { VoucherAvailability } from "@/lib/voucherAvailability";

interface VoucherDtoSource {
  id?: unknown;
  user_id?: unknown;
  package_id?: unknown;
  redeemed_by?: unknown;
  qr_token: string;
  voucher_type: VoucherType;
  discount_type: DiscountType | null;
  discount_value: number | null;
  product_discount_mode?: ProductDiscountMode | null;
  menu_item_id: string | null;
  eligible_sizes?: Size[];
  reference_size?: Size | null;
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
    ends_at?: Date | null;
    bundleRule?: BundleRuleDtoSource | null;
  };
  menuItem: { name: string; is_available: boolean } | null;
  menuItemScopes?: Array<{ menu_item_id: string; menuItem: { name: string; category: string; is_available: boolean; is_seasonal: boolean } }>;
  addonOption: { label: string } | null;
  staff: { name: string; role: Role } | null;
  availability?: VoucherAvailability;
}

/** Map a database voucher to the only voucher shape allowed across API/UI boundaries. */
export function toPublicVoucherDto(voucher: VoucherDtoSource) {
  return {
    qr_token: voucher.qr_token,
    voucher_type: voucher.voucher_type,
    discount_type: voucher.discount_type,
    discount_value: voucher.discount_value,
    product_discount_mode: voucher.product_discount_mode ?? null,
    menu_item_id: voucher.menu_item_id,
    eligible_sizes: voucher.eligible_sizes ?? [],
    reference_size: voucher.reference_size ?? null,
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
    package: {
      ...voucher.package,
      ...(voucher.package.bundleRule === undefined
        ? {}
        : { bundleRule: voucher.package.bundleRule ? toBundleRuleDto(voucher.package.bundleRule) : null }),
    },
    menuItem: voucher.menuItem,
    eligible_menu_items: (voucher.menuItemScopes ?? []).map((scope) => ({
      menu_item_id: scope.menu_item_id,
      name: scope.menuItem.name,
      category: scope.menuItem.category,
      is_available: scope.menuItem.is_available,
      is_seasonal: scope.menuItem.is_seasonal,
    })),
    addonOption: voucher.addonOption,
    staff: voucher.staff,
    ...(voucher.availability ? { availability: voucher.availability } : {}),
  };
}
