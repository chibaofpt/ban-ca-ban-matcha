import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logSystemEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "STAFF" && session.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { phone_number, code } = await request.json();

    if (!phone_number || !code) {
      return NextResponse.json(
        { error: "Missing required fields", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // 1. Look up user by phone
    const user = await prisma.user.findUnique({
      where: { phone_number },
      select: {
        name: true,
        phone_number: true,
        points_balance: true,
        qr_token: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // 2. Verify short code (case insensitive comparison)
    const actualShortCode = user.qr_token.slice(-6).toUpperCase();
    if (code.toUpperCase() !== actualShortCode) {
      return NextResponse.json(
        { error: "Mã nhập tay không chính xác", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // 3. Record the manual bypass without identifiers or submitted secrets.
    await logSystemEvent({
      level: "info",
      source: "qr_fallback",
      message: "Staff manually verified a QR short code",
    });

    // 4. Return same shape as /api/staff/scan
    return NextResponse.json({
      data: {
        type: "user",
        data: {
          qr_token: user.qr_token,
          name: user.name,
          phone_number: user.phone_number,
          points_balance: user.points_balance,
        },
      },
    });
  } catch (error) {
    console.error("POST /api/staff/scan-fallback error", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
