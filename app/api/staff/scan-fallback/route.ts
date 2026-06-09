import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
        id: true,
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

    // 3. Log the manual bypass to SystemLog
    await prisma.systemLog.create({
      data: {
        level: "audit",
        source: "qr_fallback",
        message: "Staff manually entered QR short code",
        context: {
          staff_id: session.id,
          user_id: user.id,
          phone_number: user.phone_number,
          entered_code: code,
        },
      },
    });

    // 4. Return same shape as /api/staff/scan
    return NextResponse.json({
      data: {
        type: "user",
        data: {
          id: user.qr_token, // Always return qr_token as id
          name: user.name,
          phone_number: user.phone_number,
          points_balance: user.points_balance,
        },
      },
    });
  } catch (error) {
    console.error("POST /api/staff/scan-fallback error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
