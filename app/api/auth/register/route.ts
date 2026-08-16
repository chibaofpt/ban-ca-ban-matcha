import { NextResponse } from "next/server";
import { RegisterSchemaWithInstagram } from "@/lib/validations/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone, signJwt, setAuthCookies } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import bcrypt from "bcryptjs";
import {
  ensureAutoGrantedVouchers,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";

/**
 * Handle POST request for user registration.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsedParams = RegisterSchemaWithInstagram.safeParse(body);

    if (!parsedParams.success) {
      const firstError = parsedParams.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message ?? "Dữ liệu không hợp lệ", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const { name, phone_number, password, insta_name } = parsedParams.data;
    const normalizedPhone = normalizePhone(phone_number);

    // Check for existing user
    const existingUser = await prisma.user.findUnique({
      where: { phone_number: normalizedPhone },
    });

    // Valid bcrypt hash for timing safety
    const DUMMY_HASH = "$2a$12$R9h/cIPz0gi.URNNX3rub2A9WEH71/x7LpZ9zL1Pz.x0bI/tXh9eW";

    if (existingUser) {
      if (existingUser.password_hash !== "GHOST_USER_NO_PASSWORD") {
        // Timing-safe: always run bcrypt even when returning early
        await bcrypt.compare("dummy", DUMMY_HASH);
        return NextResponse.json({ error: "Số điện thoại đã được đăng ký", code: "CONFLICT" }, { status: 409 });
      }
    }

    // Hash password with cost 12
    const passwordHash = await bcrypt.hash(password, 12);

    /** Maximum number of concurrent active sessions per user. */
    const MAX_ACTIVE_SESSIONS = 5;

    // Create or update user, award welcome points, and open a session in one atomic transaction
    const { user, refreshToken } = await prisma.$transaction(async (tx) => {
      let finalUser;

      if (existingUser && existingUser.password_hash === "GHOST_USER_NO_PASSWORD") {
        // Convert ghost user to real user
        finalUser = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name,
            password_hash: passwordHash,
            insta_name,
            points_balance: { increment: 5 }, // Award welcome bonus
          },
        });
      } else {
        // Create brand new user
        finalUser = await tx.user.create({
          data: {
            name,
            phone_number: normalizedPhone,
            password_hash: passwordHash,
            insta_name,
            points_balance: 5, // Award welcome bonus
          },
        });
      }

      await tx.pointsLog.create({
        data: {
          user_id: finalUser.id,
          delta: 5,
          reason: "welcome_bonus",
          performed_by: null,
        },
      });

      // EDGE-4: Session limit — enforce max active sessions before creating new one
      const activeSessions = await tx.session.findMany({
        where: { user_id: finalUser.id, expires_at: { gt: new Date() } },
        orderBy: { created_at: "asc" },
        select: { id: true },
      });
      if (activeSessions.length >= MAX_ACTIVE_SESSIONS) {
        const idsToDelete = activeSessions
          .slice(0, activeSessions.length - (MAX_ACTIVE_SESSIONS - 1))
          .map((s) => s.id);
        await tx.session.deleteMany({ where: { id: { in: idsToDelete } } });
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const session = await tx.session.create({
        data: {
          user_id: finalUser.id,
          expires_at: expiresAt,
        },
      });

      return { user: finalUser, refreshToken: session.refresh_token };
    });

    // Create access token
    const accessToken = await signJwt({ id: user.id, role: user.role, phone_number: user.phone_number });

    // Set cookies
    await setAuthCookies(accessToken, refreshToken, user.role);

    // Registration remains successful on a transient grant error; wallet access retries lazily.
    try {
      await ensureAutoGrantedVouchers(prisma as unknown as VoucherIssuanceDatabase, user.id);
    } catch (grantError) {
      console.error("[POST /api/auth/register] auto-grant deferred", {
        name: grantError instanceof Error ? grantError.name : typeof grantError,
      });
    }

    return NextResponse.json(
      {
        data: {
          name: user.name,
          phone_number: user.phone_number,
          insta_name: user.insta_name,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: "Tên Instagram này đã được sử dụng", code: "CONFLICT" },
        { status: 409 },
      );
    }
    console.error("Register Error:", err);
    return NextResponse.json({ error: "Đã xảy ra lỗi hệ thống", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
