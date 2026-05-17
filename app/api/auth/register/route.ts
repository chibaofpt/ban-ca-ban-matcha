import { NextResponse } from "next/server";
import { RegisterSchema } from "@/lib/validations/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone, signJwt, createSession, setAuthCookies } from "@/lib/auth";
import bcrypt from "bcryptjs";

/**
 * Handle POST request for user registration.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsedParams = RegisterSchema.safeParse(body);

    if (!parsedParams.success) {
      const firstError = parsedParams.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message ?? "Dữ liệu không hợp lệ", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const { name, phone_number, password } = parsedParams.data;
    const normalizedPhone = normalizePhone(phone_number);

    // Check for existing user
    const existingUser = await prisma.user.findUnique({
      where: { phone_number: normalizedPhone },
    });

    const DUMMY_HASH = "$2b$12$invalidhashfortimingsafetyxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    if (existingUser) {
      // Timing-safe: always run bcrypt even when returning early
      await bcrypt.compare("dummy", DUMMY_HASH);
      return NextResponse.json({ error: "Số điện thoại đã được đăng ký", code: "CONFLICT" }, { status: 409 });
    }

    // Hash password with cost 12
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user, award welcome points, and open a session in one atomic transaction
    const { user, refreshToken } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          phone_number: normalizedPhone,
          password_hash: passwordHash,
          // role and qr_token have defaults in schema
        },
      });

      // Award 5 welcome bonus points (system action — performed_by is null)
      await tx.user.update({
        where: { id: createdUser.id },
        data: { points_balance: { increment: 5 } },
      });

      await tx.pointsLog.create({
        data: {
          user_id: createdUser.id,
          delta: 5,
          reason: "welcome_bonus",
          performed_by: null,
        },
      });

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const session = await tx.session.create({
        data: {
          user_id: createdUser.id,
          expires_at: expiresAt,
        },
      });

      return { user: createdUser, refreshToken: session.refresh_token };
    });

    // Create access token
    const accessToken = await signJwt({ id: user.id, role: user.role, phone_number: user.phone_number });

    // Set cookies
    await setAuthCookies(accessToken, refreshToken, role);

    return NextResponse.json(
      {
        data: {
          id: user.id,
          name: user.name,
          phone_number: user.phone_number,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("Register Error:", err);
    return NextResponse.json({ error: "Đã xảy ra lỗi hệ thống", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
