import { NextResponse } from "next/server";
import { LoginSchema } from "@/lib/validations/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone, signJwt, createSession, setAuthCookies } from "@/lib/auth";
import {
  checkLoginFailLimit,
  checkIdentifierFloodGuard,
  recordLoginFail,
  recordIdentifierFloodAttempt,
  resetLoginFail,
  resetIdentifierFlood,
  type LoginIdentifierKind,
} from "@/lib/rateLimit";
import bcrypt from "bcryptjs";

// Dummy hash to prevent timing attacks. It corresponds to an empty string with cost 12.
const DUMMY_HASH = "$2a$12$R9h/cIPz0gi.URNNX3rub2A9WEH71/x7LpZ9zL1Pz.x0bI/tXh9eW";

/** Maximum number of concurrent active sessions per user. */
const MAX_ACTIVE_SESSIONS = 5;

/**
 * Handle POST request for user login.
 * Rate limiting: IP-based fail counter (5/15min) + phone flood guard (10/15min).
 * Both counters only increment on wrong password — correct password resets them.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsedParams = LoginSchema.safeParse(body);

    if (!parsedParams.success) {
      const firstError = parsedParams.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message ?? "Dữ liệu không hợp lệ", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const { phone_number, insta_name, password } = parsedParams.data;
    const identifierKind: LoginIdentifierKind =
      phone_number !== undefined ? "phone" : "instagram";
    const normalizedIdentifier =
      phone_number !== undefined ? normalizePhone(phone_number) : insta_name!;

    // Extract IP for rate limiting (x-forwarded-for set by Vercel/proxy)
    const ip =
      req.headers instanceof Headers
        ? (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown")
        : "unknown";

    // ── Layer 2: IP-based fail counter ────────────────────────────────────────
    // Checked BEFORE DB lookup to short-circuit early and save a DB query.
    const ipCheck = await checkLoginFailLimit(ip);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        { error: "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.", code: "IP_BLOCKED" },
        { status: 429 }
      );
    }

    // Catches distributed attacks where many IPs target one login identifier.
    const identifierCheck = await checkIdentifierFloodGuard(
      identifierKind,
      normalizedIdentifier,
    );
    if (!identifierCheck.allowed) {
      return NextResponse.json(
        {
          error: "Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau 15 phút.",
          code: identifierKind === "phone" ? "PHONE_FLOOD" : "TOO_MANY_REQUESTS",
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where:
        identifierKind === "phone"
          ? { phone_number: normalizedIdentifier }
          : { insta_name: normalizedIdentifier },
    });
    const isAllowedCandidate =
      user !== null &&
      (identifierKind === "phone" || user.role === "CUSTOMER");

    // EDGE-3: Ghost user guard — must run bcrypt for timing-safety, then reject clearly.
    // Ghost users have never set a password; they should register, not login.
    if (
      identifierKind === "phone" &&
      user &&
      user.password_hash === "GHOST_USER_NO_PASSWORD"
    ) {
      await bcrypt.compare(password, DUMMY_HASH); // timing-safe: always run compare
      return NextResponse.json(
        { error: "Số điện thoại chưa được đăng ký. Vui lòng tạo tài khoản.", code: "NOT_REGISTERED" },
        { status: 401 }
      );
    }

    // Timing-safe password compare
    const isValidPassword = await bcrypt.compare(
      password,
      isAllowedCandidate ? user.password_hash : DUMMY_HASH
    );

    if (!isAllowedCandidate || !isValidPassword) {
      // Record failed attempt — both counters increment only on wrong password.
      // Run in parallel to minimize latency impact.
      await Promise.all([
        recordLoginFail(ip),
        recordIdentifierFloodAttempt(identifierKind, normalizedIdentifier),
      ]);

      return NextResponse.json(
        { error: "Thông tin đăng nhập hoặc mật khẩu không chính xác", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    // Correct password — reset both counters so legitimate users never hit their own limit.
    // Run in parallel to minimize latency impact.
    await Promise.all([
      resetLoginFail(ip),
      resetIdentifierFlood(identifierKind, normalizedIdentifier),
    ]);

    // EDGE-4: Session limit — keep at most MAX_ACTIVE_SESSIONS-1 existing sessions
    // so the new one makes exactly MAX_ACTIVE_SESSIONS total.
    const activeSessions = await prisma.session.findMany({
      where: { user_id: user.id, expires_at: { gt: new Date() } },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    if (activeSessions.length >= MAX_ACTIVE_SESSIONS) {
      // Delete oldest sessions, keep (MAX_ACTIVE_SESSIONS - 1) newest
      const idsToDelete = activeSessions
        .slice(0, activeSessions.length - (MAX_ACTIVE_SESSIONS - 1))
        .map((s) => s.id);
      await prisma.session.deleteMany({ where: { id: { in: idsToDelete } } });
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
          insta_name: user.insta_name,
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
