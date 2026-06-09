import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "STAFF" && session.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id: qrToken } = await params;

    // We look up the voucher by qr_token
    const voucher = await prisma.voucher.findUnique({
      where: { qr_token: qrToken },
    });

    if (!voucher) {
      return NextResponse.json(
        { error: "Voucher not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (voucher.status === "REDEEMED") {
      return NextResponse.json(
        { error: "Voucher already redeemed", code: "VOUCHER_REDEEMED" },
        { status: 409 }
      );
    }

    if (voucher.status === "EXPIRED") {
      return NextResponse.json(
        { error: "Voucher expired", code: "VOUCHER_EXPIRED" },
        { status: 409 }
      );
    }

    if (voucher.expires_at && new Date() > voucher.expires_at) {
      return NextResponse.json(
        { error: "Voucher expired", code: "VOUCHER_EXPIRED" },
        { status: 409 }
      );
    }

    // Mark as REDEEMED (offline flow, so no order id attached directly)
    const updated = await prisma.voucher.update({
      where: { id: voucher.id },
      data: {
        status: "REDEEMED",
        used_channel: "OFFLINE",
        redeemed_at: new Date(),
        redeemed_by: session.id,
      },
    });

    return NextResponse.json({
      data: {
        id: updated.qr_token,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error("PATCH /api/staff/vouchers/[id]/redeem error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
