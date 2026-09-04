import type { MenuItem, Size } from "@/src/lib/types/menu";

interface VoucherEligibleMenuItemDescriptor {
  menu_item_id: string;
  is_available: boolean;
}

export interface EligibleProductDiscountItem {
  item: MenuItem;
  allowedSizes: Size[];
}

/** Intersects a product-discount voucher scope with currently sellable menu-item sizes. */
export function getEligibleProductDiscountItems(
  menuItems: MenuItem[],
  eligibleMenuItems: VoucherEligibleMenuItemDescriptor[] | undefined,
  fallbackMenuItemId: string | null,
  eligibleSizes: Size[] | undefined,
): EligibleProductDiscountItem[] {
  const eligibleIds = new Set(
    eligibleMenuItems?.length
      ? eligibleMenuItems
          .filter((item) => item.is_available)
          .map((item) => item.menu_item_id)
      : fallbackMenuItemId
        ? [fallbackMenuItemId]
        : [],
  );
  const voucherSizes = [...new Set(eligibleSizes ?? [])];

  return menuItems.flatMap((item) => {
    if (!eligibleIds.has(item.id)) return [];
    const sellableSizes = new Set(item.sizes.map((row) => row.size));
    const allowedSizes = voucherSizes.filter((size) => sellableSizes.has(size));
    return allowedSizes.length > 0 ? [{ item, allowedSizes }] : [];
  });
}

export type VoucherActionModel =
  | { kind: "use-now"; label: string; disabled: boolean; reason?: string; busy: boolean }
  | { kind: "selection"; selected: boolean; disabled: boolean; reason?: string }
  | { kind: "none" };

export interface VoucherSelectionModel {
  selected: boolean;
  selectable: boolean;
  disabledReason: string | null;
  estimatedBenefitVnd: number;
  replacementVoucherToken?: string;
}

type ActionInput =
  | ({ context: "wallet"; busy: boolean } & Partial<VoucherSelectionModel>)
  | ({ context: "cart"; busy?: boolean } & VoucherSelectionModel);

export interface ProductDiscountTarget {
  cartId: string;
  menuItemId: string;
  size: "SMALL" | "MEDIUM" | "LARGE";
  estimatedBenefitVnd: number;
}

export type ProductDiscountSelection =
  | { kind: "none"; reason: string }
  | { kind: "single"; target: ProductDiscountTarget; replacementVoucherToken?: string }
  | { kind: "multiple"; targets: ProductDiscountTarget[]; replacementVoucherToken?: string };

export type WalletUseNowIntent =
  | { kind: "apply-product"; selection?: { menuItemId: string; size: ProductDiscountTarget["size"] } }
  | { kind: "apply-order" }
  | { kind: "open-bundle" }
  | { kind: "open-detail" };

interface MainCartVoucherDescriptor {
  voucher_type: string;
  status: string;
}

interface OrderVoucherDescriptor {
  qr_token: string;
  voucher_type: string;
  discount_type: string | null;
}

/** Keeps active main-cart vouchers visible while the picker owns eligibility messaging. */
export function filterActiveMainCartVouchers<T extends MainCartVoucherDescriptor>(
  vouchers: T[],
  voucherType: "DISCOUNT" | "FREESHIP" | "BUNDLE" | "PRODUCT_DISCOUNT" | "PRODUCT" | "ITEM" | "ADDON",
): T[] {
  return vouchers.filter((voucher) => voucher.voucher_type === voucherType && voucher.status === "ACTIVE");
}

/** Selects an order voucher while replacing the mutually exclusive token of the same class. */
export function selectOrderVoucherToken<T extends OrderVoucherDescriptor>(
  currentTokens: string[],
  voucher: T,
  activeVouchers: T[],
): string[] {
  const retained = currentTokens.filter((token) => {
    const current = activeVouchers.find((candidate) => candidate.qr_token === token);
    if (!current) return true;
    if (voucher.voucher_type === "FREESHIP") return current.voucher_type !== "FREESHIP";
    if (voucher.voucher_type === "DISCOUNT" && voucher.discount_type === "PERCENT") {
      return !(current.voucher_type === "DISCOUNT" && current.discount_type === "PERCENT");
    }
    return true;
  });
  return retained.includes(voucher.qr_token) ? retained : [...retained, voucher.qr_token];
}

/** Resolves wallet action routing without coupling card content to its action. */
export function resolveWalletUseNowIntent(_input: {
  voucherType: string;
  productDiscountTargets?: ProductDiscountTarget[];
  canApplyOrder?: boolean;
}): WalletUseNowIntent {
  const { voucherType, productDiscountTargets = [], canApplyOrder = false } = _input;
  if (voucherType === "PRODUCT" || voucherType === "ITEM") return { kind: "apply-product" };
  if (voucherType === "PRODUCT_DISCOUNT") {
    // Always open detail so customer can pick item + customize via ProductModal
    return { kind: "open-detail" };
  }
  if (voucherType === "BUNDLE") return { kind: "open-bundle" };
  if ((voucherType === "DISCOUNT" || voucherType === "FREESHIP") && canApplyOrder) return { kind: "apply-order" };
  return { kind: "open-detail" };
}

/** Builds the presentation-only action rendered separately from voucher content. */
export function buildVoucherActionModel(input: ActionInput): VoucherActionModel {
  if (input.context === "wallet") {
    return {
      kind: "use-now",
      label: "Dùng ngay",
      disabled: input.busy || input.selectable === false,
      ...(input.disabledReason ? { reason: input.disabledReason } : {}),
      busy: input.busy,
    };
  }
  return {
    kind: "selection",
    selected: input.selected,
    disabled: !input.selectable,
    ...(input.disabledReason ? { reason: input.disabledReason } : {}),
  };
}

/** Resolves whether PRODUCT_DISCOUNT applies directly or needs target selection. */
export function getProductDiscountSelection(
  targets: ProductDiscountTarget[],
  replacementVoucherToken: string | null,
): ProductDiscountSelection {
  const eligibleTargets = targets.filter((target) => target.estimatedBenefitVnd > 0);
  const replacement = replacementVoucherToken
    ? { replacementVoucherToken }
    : {};
  if (eligibleTargets.length === 0) {
    return { kind: "none", reason: "Chưa có sản phẩm phù hợp" };
  }
  if (eligibleTargets.length === 1) {
    return { kind: "single", target: eligibleTargets[0]!, ...replacement };
  }
  return { kind: "multiple", targets: eligibleTargets, ...replacement };
}
