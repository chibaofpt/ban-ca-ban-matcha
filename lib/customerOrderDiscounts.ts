import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  calcOrderTotals,
  type CalcDiscountVoucher,
  type CalcFreeshipVoucher,
  type CalcOrderItem,
  type CalcOrderResult,
} from "@/lib/orderCalculator";
import { resolveOwnedVoucherIdentifier } from "@/lib/publicIdentifiers";
import type { CustomerOrderInput } from "@/lib/validations/order";
import { assertVoucherUsable, VoucherError } from "@/lib/vouchers";

export interface CustomerDiscountContext {
  calculation: CalcOrderResult;
  discountVouchers: CalcDiscountVoucher[];
  freeshipVoucherId: string | null;
}

export type CustomerDiscountResult =
  | { ok: true; context: CustomerDiscountContext }
  | { ok: false; response: NextResponse };

function voucherErrorResponse(error: VoucherError): NextResponse {
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : 422;
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}

/** Validates order-level vouchers and calculates canonical PRODUCT-to-FREESHIP totals. */
export async function calculateCustomerOrderDiscounts(
  data: CustomerOrderInput,
  userId: string,
  items: CalcOrderItem[],
  shippingFeeVnd: number,
  voucherQrTokens: Map<string, string>,
  db: Pick<typeof prisma, "voucher"> = prisma,
  acceptanceDate = new Date(),
): Promise<CustomerDiscountResult> {
  const baseCalculation = calcOrderTotals({
    items,
    discountVouchers: [],
    freeshipVoucher: null,
    shipping_fee_vnd: 0,
  });
  const validatedDiscounts: CalcDiscountVoucher[] = [];
  let percentVoucherCount = 0;
  let finalFreeshipIdentifier =
    data.order_type === "DELIVERY" ? data.freeship_voucher_id : undefined;
  let freeshipFromDiscount: Awaited<ReturnType<typeof resolveOwnedVoucherIdentifier>> = null;

  for (const identifier of Array.from(new Set(data.discount_voucher_ids))) {
    const voucher = await resolveOwnedVoucherIdentifier(identifier, userId, db);
    if (voucher?.voucher_type === "FREESHIP") {
      if (data.order_type !== "DELIVERY") continue;
      if (finalFreeshipIdentifier && finalFreeshipIdentifier !== identifier) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Chỉ được áp dụng tối đa 1 voucher FREESHIP", code: "VALIDATION_ERROR" },
            { status: 400 },
          ),
        };
      }
      finalFreeshipIdentifier = voucher.qr_token;
      freeshipFromDiscount = voucher;
      continue;
    }

    try {
      assertVoucherUsable(voucher, userId, "DISCOUNT", acceptanceDate);
    } catch (error) {
      if (error instanceof VoucherError) {
        return { ok: false, response: voucherErrorResponse(error) };
      }
      throw error;
    }
    if (!voucher) continue;
    if (voucher?.discount_type === "PERCENT" && ++percentVoucherCount > 1) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "Chỉ được áp tối đa 1 voucher giảm phần trăm cho một đơn hàng",
            code: "VALIDATION_ERROR",
          },
          { status: 400 },
        ),
      };
    }
    if (
      voucher?.min_order_vnd !== null &&
      baseCalculation.discountable_subtotal_vnd < voucher.min_order_vnd
    ) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `Đơn hàng tối thiểu ${(voucher.min_order_vnd / 1000).toLocaleString("vi-VN")}k để sử dụng voucher giảm giá này`,
            code: "MIN_ORDER_NOT_MET",
          },
          { status: 400 },
        ),
      };
    }
    validatedDiscounts.push({
      id: voucher.id,
      discount_type: voucher.discount_type as "FIXED" | "PERCENT",
      discount_value: voucher.discount_value ?? 0,
      min_order_vnd: voucher.min_order_vnd,
      max_discount_vnd: voucher.max_discount_vnd,
    });
    voucherQrTokens.set(voucher.id, voucher.qr_token);
  }

  const calculationBeforeFreeship = calcOrderTotals({
    items,
    discountVouchers: validatedDiscounts,
    freeshipVoucher: null,
    shipping_fee_vnd: 0,
  });
  let freeshipVoucher: CalcFreeshipVoucher | null = null;
  if (finalFreeshipIdentifier) {
    if (data.order_type !== "DELIVERY") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Voucher FREESHIP chỉ áp dụng cho đơn giao hàng", code: "VALIDATION_ERROR" },
          { status: 400 },
        ),
      };
    }
    const voucher =
      freeshipFromDiscount ??
      (await resolveOwnedVoucherIdentifier(finalFreeshipIdentifier, userId, db));
    try {
      assertVoucherUsable(voucher, userId, "FREESHIP", acceptanceDate);
    } catch (error) {
      if (error instanceof VoucherError) {
        return { ok: false, response: voucherErrorResponse(error) };
      }
      throw error;
    }
    if (!voucher?.covered_delivery_fee_vnd) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Voucher FREESHIP không hợp lệ (thiếu số tiền hỗ trợ)", code: "VALIDATION_ERROR" },
          { status: 400 },
        ),
      };
    }
    if (
      voucher.min_order_vnd !== null &&
      calculationBeforeFreeship.total_vnd < voucher.min_order_vnd
    ) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `Đơn hàng tối thiểu ${(voucher.min_order_vnd / 1000).toLocaleString("vi-VN")}k để sử dụng voucher freeship này`,
            code: "MIN_ORDER_NOT_MET",
          },
          { status: 400 },
        ),
      };
    }
    freeshipVoucher = {
      id: voucher.id,
      covered_delivery_fee_vnd: voucher.covered_delivery_fee_vnd,
      min_order_vnd: voucher.min_order_vnd,
    };
    voucherQrTokens.set(voucher.id, voucher.qr_token);
  }

  const calculation = calcOrderTotals({
    items,
    discountVouchers: validatedDiscounts,
    freeshipVoucher,
    shipping_fee_vnd: shippingFeeVnd,
  });
  const appliedIds = new Set(calculation.appliedVoucherIds);
  return {
    ok: true,
    context: {
      calculation,
      discountVouchers: validatedDiscounts.filter((voucher) => appliedIds.has(voucher.id)),
      freeshipVoucherId:
        freeshipVoucher && appliedIds.has(freeshipVoucher.id) ? freeshipVoucher.id : null,
    },
  };
}
