import { z } from "zod";
import { normalizeAccountEmail } from "@/src/utils/accountEmail";
import { normalizePhone } from "@/src/utils/phone";
import { NextResponse } from "next/server";
import type { QrScanResult } from "@/contracts/staff";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logSystemEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

const fallbackSchema = z.object({
  phone_number: z.string().transform(normalizePhone).pipe(z.string().regex(/^\+84\d{9}$/)).optional(),
  email: z.string().trim().email().max(254).transform(normalizeAccountEmail).optional(),
  code: z.string().regex(/^[a-zA-Z0-9]{6}$/),
}).strict().refine((data) => Boolean(data.phone_number) !== Boolean(data.email));

/** Verify one email or phone together with its personal QR short code. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "STAFF" && session.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const parsed = fallbackSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Missing required fields", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { phone_number, email, code } = parsed.data;
    const user = await prisma.user.findUnique({
      where: email ? { email } : { phone_number: phone_number! },
      select: {
        name: true,
        phone_number: true,
        email: true,
        insta_name: true,
        role: true,
        sourceMerge: { select: { target_user_id: true } },
        points_balance: true,
        qr_token: true,
      },
    });

    if (!user || user.role !== "CUSTOMER" || user.sourceMerge) {
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
    const result = {
        type: "user",
        data: {
          qr_token: user.qr_token,
          name: user.name,
          phone_number: user.phone_number,
          email: user.email,
          insta_name: user.insta_name,
          points_balance: user.points_balance,
        },
    } satisfies QrScanResult;
    return NextResponse.json({ data: result });
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
