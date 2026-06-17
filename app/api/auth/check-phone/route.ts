import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth";

const BodySchema = z.object({
  phone_number: z
    .string()
    .regex(/^(0|\+84)\d{9}$/, "Số điện thoại không hợp lệ"),
});

/**
 * POST /api/auth/check-phone
 * Body: { phone_number: "0912345678" }
 * Returns { data: { exists: boolean } } — true if the number is already registered.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(parsed.data.phone_number);

    const existing = await prisma.user.findUnique({
      where: { phone_number: normalizedPhone },
      select: { id: true, password_hash: true },
    });

    // Ghost user (placed an order before registering) is not yet a real account.
    // Allow them through to the register flow so they can convert their account.
    const isRegistered =
      existing !== null && existing.password_hash !== "GHOST_USER_NO_PASSWORD";

    return NextResponse.json({ data: { exists: isRegistered } }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Đã có lỗi xảy ra", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
