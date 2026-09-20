import type {
  DiscountType,
  Role,
  Size,
  UsedChannel,
  VoucherStatus,
  VoucherType,
  VoucherAcquisitionMode,
  VoucherPackageVisibility,
  ProductDiscountMode,
  Prisma,
} from "@prisma/client";
import type { MyVoucher, VoucherAvailability } from "@/contracts/voucher";
import type { Category } from "@/contracts/menu";
import { toBundleRuleDto, type BundleRuleDtoSource } from "@/lib/voucherBundleDto";

type VoucherIssuedVia = Exclude<VoucherAcquisitionMode, "NONE">;

export const PUBLIC_VOUCHER_PACKAGE_SELECT = {
  name: true,
  description: true,
  points_cost: true,
  acquisition_mode: true,
  ends_at: true,
  bundleRule: {
    select: {
      buy_quantity: true,
      reward_quantity: true,
      reward_kind: true,
      reward_mode: true,
      benefit_scaling: true,
      max_applications_order: true,
      max_reward_units_order: true,
      productScopes: {
        select: {
          role: true,
          menu_item_id: true,
          default_powder_id: true,
          default_base_liquid_id: true,
          sizes: { select: { size: true } },
          menuItem: { select: { name: true, category: true, is_available: true } },
        },
      },
      addonRewards: { select: { addon_option_id: true } },
    },
  },
} satisfies Prisma.VoucherPackageSelect;

function narrowVoucherIssuedVia(value: VoucherAcquisitionMode | undefined): VoucherIssuedVia | undefined {
  if (value === "NONE") {
    throw new Error("Voucher issued_via invariant violated: NONE cannot be exposed by public DTO");
  }
  return value;
}

interface VoucherDtoSource {
  id?: unknown;
  user_id?: unknown;
  package_id?: unknown;
  redeemed_by?: unknown;
  qr_token: string;
  voucher_type: VoucherType;
  issued_via?: VoucherAcquisitionMode;
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
  max_discount_vnd: number | null;
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
    visibility?: VoucherPackageVisibility;
    ends_at?: Date | null;
    bundleRule?: BundleRuleDtoSource | null;
  };
  menuItem: { name: string; is_available: boolean } | null;
  menuItemScopes?: Array<{
    menu_item_id: string;
    size?: Size | null;
    matcha_powder_id?: string | null;
    milk_type_id?: string | null;
    covered_price_vnd?: number | null;
    menuItem: { name: string; category: string; is_available: boolean; is_seasonal: boolean };
  }>;
  addonOptionScopes?: Array<{
    addon_option_id: string;
    addonOption: { label: string; price_vnd: number; is_active: boolean; gram_value: unknown | null };
  }>;
  addonOption: { label: string } | null;
  staff: { name: string; role: Role } | null;
  availability?: VoucherAvailability;
}

/** Map a database voucher to the only voucher shape allowed across API/UI boundaries. */
export function toPublicVoucherDto(voucher: VoucherDtoSource) {
  const issuedVia = narrowVoucherIssuedVia(voucher.issued_via);
  const { bundleRule, ...voucherPackage } = voucher.package;
  return {
    ...(typeof voucher.package_id === "string" ? { package_id: voucher.package_id } : {}),
    qr_token: voucher.qr_token,
    voucher_type: voucher.voucher_type,
    ...(issuedVia ? { issued_via: issuedVia } : {}),
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
    max_discount_vnd: voucher.max_discount_vnd,
    status: voucher.status,
    used_channel: voucher.used_channel,
    expires_at: voucher.expires_at,
    redeemed_at: voucher.redeemed_at,
    created_at: voucher.created_at,
    package: {
      ...voucherPackage,
      ...(bundleRule === undefined
        ? {}
        : { bundleRule: bundleRule ? toBundleRuleDto(bundleRule) : null }),
    },
    menuItem: voucher.menuItem,
    eligible_menu_items: (voucher.menuItemScopes ?? []).map((scope) => ({
      menu_item_id: scope.menu_item_id,
      name: scope.menuItem.name,
      category: scope.menuItem.category as Category,
      is_available: scope.menuItem.is_available,
      is_seasonal: scope.menuItem.is_seasonal,
      size: scope.size ?? null,
      matcha_powder_id: scope.matcha_powder_id ?? null,
      milk_type_id: scope.milk_type_id ?? null,
      covered_price_vnd: scope.covered_price_vnd ?? null,
    })),
    eligible_addon_options: (voucher.addonOptionScopes ?? []).map((scope) => ({
      addon_option_id: scope.addon_option_id,
      label: scope.addonOption.label,
      price_vnd: scope.addonOption.price_vnd,
      is_active: scope.addonOption.is_active,
      is_dynamic_gram: scope.addonOption.gram_value !== null,
    })),
    addonOption: voucher.addonOption,
    staff: voucher.staff,
    ...(voucher.availability ? { availability: voucher.availability } : {}),
  };
}

/** Serialize internal voucher dates explicitly at an HTTP response boundary. */
export function serializePublicVoucherDto(
  voucher: ReturnType<typeof toPublicVoucherDto>,
): Omit<MyVoucher, "availability"> & { availability?: VoucherAvailability } {
  const { ends_at: packageEndsAt, ...voucherPackage } = voucher.package;
  return {
    ...voucher,
    expires_at: voucher.expires_at?.toISOString() ?? null,
    redeemed_at: voucher.redeemed_at?.toISOString() ?? null,
    created_at: voucher.created_at.toISOString(),
    package: {
      ...voucherPackage,
      ...(packageEndsAt === undefined
        ? {}
        : { ends_at: packageEndsAt?.toISOString() ?? null }),
    },
  };
}
