import { NextRequest, NextResponse } from "next/server";
import type { Category } from "@/contracts/menu";
import type { QrScanResult } from "@/contracts/staff";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  loadVoucherAvailabilityCatalog,
  retainUsableVoucherTargetScopes,
  resolveVoucherTargetAvailability,
  type VoucherAvailabilityDatabase,
} from "@/lib/voucherAvailability";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "STAFF" && session.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing token", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // 1. Check if token belongs to a User (personal QR)
    const user = await prisma.user.findUnique({
      where: { qr_token: token },
      select: {
        name: true,
        phone_number: true,
        points_balance: true,
      },
    });

    if (user) {
      const result = {
        type: "user",
        data: {
          qr_token: token,
          name: user.name,
          phone_number: user.phone_number,
          points_balance: user.points_balance,
        },
      } satisfies QrScanResult;
      return NextResponse.json({
        data: result,
      });
    }

    const voucher = await prisma.voucher.findUnique({
      where: { qr_token: token },
      include: {
        menuItemScopes: {
          include: { menuItem: { select: { name: true, category: true, is_available: true, is_seasonal: true } } },
        },
      },
    });

    if (voucher) {
      // GET is read-only: project expiry without mutating persisted lifecycle state.
      let effectiveStatus = voucher.status;
      if (voucher.status === "ACTIVE" && voucher.expires_at && voucher.expires_at <= new Date()) {
        effectiveStatus = "EXPIRED";
      }

      let scopedVoucher = voucher;
      if (voucher.voucher_type === "PRODUCT" || voucher.voucher_type === "ITEM") {
        const catalog = await loadVoucherAvailabilityCatalog(prisma as unknown as VoucherAvailabilityDatabase);
        const resolved = resolveVoucherTargetAvailability({
          ...voucher,
          addonOptionScopes: [],
          package: {},
        }, catalog);
        scopedVoucher = retainUsableVoucherTargetScopes(voucher, resolved);
      }

      const result = {
          type: "voucher",
          data: {
            qr_token: voucher.qr_token,
            voucher_type: voucher.voucher_type,
            discount_type: voucher.discount_type,
            discount_value: voucher.discount_value,
            menu_item_id: voucher.menu_item_id,
            size: voucher.size,
            matcha_powder_id: voucher.matcha_powder_id,
            milk_type_id: voucher.milk_type_id,
            covered_price_vnd: voucher.covered_price_vnd,
            has_normalized_targets: voucher.menuItemScopes.length > 0,
            eligible_menu_items: scopedVoucher.menuItemScopes.map((scope) => ({
              menu_item_id: scope.menu_item_id,
              name: scope.menuItem.name,
              category: scope.menuItem.category as Category,
              is_available: scope.menuItem.is_available,
              is_seasonal: scope.menuItem.is_seasonal,
              size: scope.size,
              matcha_powder_id: scope.matcha_powder_id,
              milk_type_id: scope.milk_type_id,
              covered_price_vnd: scope.covered_price_vnd,
            })),
            status: effectiveStatus,
            expires_at: voucher.expires_at ? voucher.expires_at.toISOString() : null,
          },
      } satisfies QrScanResult;
      return NextResponse.json({ data: result });
    }

    // 3. Not found
    return NextResponse.json(
      { error: "Invalid QR code", code: "NOT_FOUND" },
      { status: 404 }
    );
  } catch (error) {
    console.error("GET /api/staff/scan error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
