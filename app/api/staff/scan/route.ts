import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
      return NextResponse.json({
        data: {
          type: "user",
          data: {
            id: token, // API.md: "Never return internal id — always qr_token"
            name: user.name,
            phone_number: user.phone_number,
            points_balance: user.points_balance,
          },
        },
      });
    }

    // 2. Check if token belongs to a Voucher
    const voucher = await prisma.voucher.findUnique({
      where: { qr_token: token },
      include: {
        package: {
          select: {
            discount_type: true,
            discount_value: true,
          },
        },
      },
    });

    if (voucher) {
      return NextResponse.json({
        data: {
          type: "voucher",
          data: {
            id: voucher.qr_token, // API.md: "Never return internal id — always qr_token"
            voucher_type: voucher.voucher_type,
            discount_type: voucher.package?.discount_type || null,
            discount_value: voucher.package?.discount_value || null,
            menu_item_id: voucher.menu_item_id,
            status: voucher.status,
            expires_at: voucher.expires_at ? voucher.expires_at.toISOString() : null,
          },
        },
      });
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
