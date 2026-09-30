import type { ProductVoucherInfo } from "@/lib/orders/orderVoucherTargets";
import { resolveOwnedVoucherIdentifier } from "@/lib/publicIdentifiers";
import type { CustomerOrderInput } from "@/lib/validations/order";
import { assertVoucherUsable, VoucherError } from "@/lib/vouchers/voucherRules";
import type { Prisma } from "@prisma/client";

export interface CustomerItemVoucherContext {
  productVoucherMap: Map<string, ProductVoucherInfo>;
  addonVoucherMap: Map<string, string>;
  addonVoucherIds: Set<string>;
  voucherQrTokens: Map<string, string>;
}

/** Plain item-voucher failure mapped to HTTP by the customer-order boundary. */
export interface CustomerItemVoucherFailure {
  ok: false;
  error: { error: string; code: string };
  status: number;
}

export type CustomerItemVoucherResult =
  | { ok: true; context: CustomerItemVoucherContext }
  | CustomerItemVoucherFailure;

function voucherErrorResponse(error: VoucherError): CustomerItemVoucherFailure {
  const statusMap: Record<string, number> = {
    NOT_FOUND: 404,
    VOUCHER_REDEEMED: 422,
    VOUCHER_EXPIRED: 422,
    CONFLICT: 422,
    VALIDATION_ERROR: 400,
  };
  return {
    ok: false,
    error: { error: error.message, code: error.code },
    status: statusMap[error.code] ?? 400,
  };
}

/** Resolves ITEM/legacy PRODUCT and ADDON voucher tokens with ownership checks. */
export async function resolveCustomerItemVouchers(
  data: CustomerOrderInput,
  userId: string,
  db?: Pick<Prisma.TransactionClient, "voucher">,
  acceptanceDate = new Date(),
): Promise<CustomerItemVoucherResult> {
  const productVoucherMap = new Map<string, ProductVoucherInfo>();
  const addonVoucherMap = new Map<string, string>();
  const addonVoucherIds = new Set<string>();
  const voucherQrTokens = new Map<string, string>();

  for (const item of data.items) {
    if (item.item_voucher_id && item.product_voucher_id) {
      return {
        ok: false,
        error: { error: "Chỉ được gửi một loại voucher cho mỗi món", code: "VALIDATION_ERROR" },
        status: 400,
      };
    }
    const submittedVoucherId = item.item_voucher_id ?? item.product_voucher_id;
    if (!submittedVoucherId) continue;
    const voucher = await resolveOwnedVoucherIdentifier(submittedVoucherId, userId, db);
    if (voucher && productVoucherMap.has(voucher.id)) {
      return {
        ok: false,
        error: {
          error: "The same product voucher cannot be applied to multiple items",
          code: "VALIDATION_ERROR",
        },
        status: 400,
      };
    }
    try {
      const expectedType = item.item_voucher_id ? "ITEM" : "PRODUCT";
      assertVoucherUsable(voucher, userId, expectedType, acceptanceDate);
    } catch (error) {
      if (error instanceof VoucherError) {
        return voucherErrorResponse(error);
      }
      throw error;
    }
    const menuScope = voucher?.menuItemScopes?.find((scope) => scope.menu_item_id === item.menu_item_id);
    const hasNormalizedTargets = (voucher?.menuItemScopes?.length ?? 0) > 0;
    const matchesMenuTarget = Boolean(
      voucher && (hasNormalizedTargets ? menuScope : voucher.menu_item_id === item.menu_item_id),
    );
    const matchingCoverage = hasNormalizedTargets
      ? menuScope?.covered_price_vnd ?? 0
      : voucher?.covered_price_vnd ?? 0;
    if (!voucher || !matchesMenuTarget || (voucher.voucher_type === "PRODUCT" && matchingCoverage <= 0)) {
      return {
        ok: false,
        error: { error: "ITEM voucher is not properly configured", code: "VALIDATION_ERROR" },
        status: 400,
      };
    }
    productVoucherMap.set(voucher.id, {
      menu_item_id: item.menu_item_id,
      eligible_menu_item_ids: voucher.menuItemScopes?.map((scope) => scope.menu_item_id) ?? [],
      covered_price_vnd: matchingCoverage,
      voucher_type: voucher.voucher_type === "ITEM" ? "ITEM" : voucher.voucher_type === "PRODUCT_DISCOUNT" ? "PRODUCT_DISCOUNT" : "PRODUCT",
      product_discount_mode: voucher.product_discount_mode,
      eligible_sizes: voucher.eligible_sizes,
      reference_size: voucher.reference_size,
      discount_value: voucher.discount_value,
      milk_type_id: menuScope?.milk_type_id ?? voucher.milk_type_id ?? null,
    });
    if (item.item_voucher_id) item.item_voucher_id = voucher.id;
    else item.product_voucher_id = voucher.id;
    voucherQrTokens.set(voucher.id, voucher.qr_token);
  }

  for (const item of data.items) {
    const itemAddonOptionIds = new Set<string>();
    for (const inputVoucher of item.addon_voucher_ids) {
      const voucher = await resolveOwnedVoucherIdentifier(inputVoucher.voucher_id, userId, db);
      if (voucher && addonVoucherIds.has(voucher.id)) {
        return {
          ok: false,
          error: {
            error: "The same addon voucher cannot be applied to multiple items",
            code: "VALIDATION_ERROR",
          },
          status: 400,
        };
      }
      if (itemAddonOptionIds.has(inputVoucher.addon_option_id)) {
        return {
          ok: false,
          error: {
            error: "Cannot apply multiple vouchers for the same addon on a single item",
            code: "VALIDATION_ERROR",
          },
          status: 400,
        };
      }
      itemAddonOptionIds.add(inputVoucher.addon_option_id);

      if (!item.addon_option_ids.includes(inputVoucher.addon_option_id)) {
        return {
          ok: false,
          error: {
            error: "Voucher áp dụng cho addon không có trong món nước",
            code: "VALIDATION_ERROR",
          },
          status: 400,
        };
      }

      try {
        assertVoucherUsable(voucher, userId, "ADDON", acceptanceDate);
      } catch (error) {
        if (error instanceof VoucherError) {
          return voucherErrorResponse(error);
        }
        throw error;
      }
      const addonTargets = voucher?.addonOptionScopes?.length
        ? voucher.addonOptionScopes.map((scope) => scope.addon_option_id)
        : voucher?.addon_option_id ? [voucher.addon_option_id] : [];
      if (!voucher || !addonTargets.includes(inputVoucher.addon_option_id)) {
        return {
          ok: false,
          error: { error: "Addon voucher option mismatch or missing", code: "VALIDATION_ERROR" },
          status: 400,
        };
      }
      addonVoucherMap.set(voucher.id, inputVoucher.addon_option_id);
      addonVoucherIds.add(voucher.id);
      inputVoucher.voucher_id = voucher.id;
      voucherQrTokens.set(voucher.id, voucher.qr_token);
    }
  }

  return {
    ok: true,
    context: { productVoucherMap, addonVoucherMap, addonVoucherIds, voucherQrTokens },
  };
}
