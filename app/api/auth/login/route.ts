import { NextResponse } from "next/server";
import { LoginSchema } from "@/lib/validations/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone, signJwt, createSession, setAuthCookies } from "@/lib/auth";
import bcrypt from "bcryptjs";


// Dummy hash to prevent timing attacks. It corresponds to an empty string with cost 12.
const DUMMY_HASH = "$2a$12$R9h/cIPz0gi.URNNX3rub2A9WEH71/x7LpZ9zL1Pz.x0bI/tXh9eW";

/**
 * Handle POST request for user login.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsedParams = LoginSchema.safeParse(body);

    if (!parsedParams.success) {
      const firstError = parsedParams.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message ?? "Dữ liệu không hợp lệ", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const { phone_number, password } = parsedParams.data;
    const normalizedPhone = normalizePhone(phone_number);

    const user = await prisma.user.findUnique({
      where: { phone_number: normalizedPhone },
    });

    if (user && user.locked_until && user.locked_until > new Date()) {
      return NextResponse.json(
        { error: "Tài khoản bị khoá tạm thời. Vui lòng thử lại sau 15 phút.", code: "ACCOUNT_LOCKED" },
        { status: 429 }
      );
    }

    // Timing-safe password compare
    const isValidPassword = await bcrypt.compare(
      password,
      user ? user.password_hash : DUMMY_HASH
    );

    if (!user || !isValidPassword) {
      if (user) {
        const newAttempts = user.failed_login_attempts + 1;
        let lockedUntil = null;
        if (newAttempts >= 5) {
          lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
        }
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failed_login_attempts: newAttempts,
            locked_until: lockedUntil,
          },
        });
      }
      return NextResponse.json({ error: "Số điện thoại hoặc mật khẩu không chính xác", code: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    if (user.failed_login_attempts > 0 || user.locked_until !== null) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: 0,
          locked_until: null,
        },
      });
    }

    // Create session
    const refreshToken = await createSession(user.id, user.role);
    const accessToken = await signJwt({ id: user.id, role: user.role, phone_number: user.phone_number });

    // Set cookies
    await setAuthCookies(accessToken, refreshToken, user.role);

    return NextResponse.json(
      {
        data: {
          name: user.name,
          phone_number: user.phone_number,
          role: user.role,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("Login Error:", err);
    return NextResponse.json({ error: "Đã xảy ra lỗi hệ thống", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
