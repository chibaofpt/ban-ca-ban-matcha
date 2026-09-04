import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRefreshTokenCookie, signJwt, setAuthCookies, clearAuthCookies } from "@/lib/auth";
import { cacheDelete } from "@/lib/redis";
import { RefreshTokenSchema } from "@/lib/validations/auth";

const GRACE_MS = 30_000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** POST /api/auth/refresh — atomically rotates the stable session in place. */
export async function POST() {
  const presentedToken = await getRefreshTokenCookie();
  if (!presentedToken) {
    await clearAuthCookies();
    return NextResponse.json({ error: "Missing refresh token", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!RefreshTokenSchema.safeParse(presentedToken).success) {
    await clearAuthCookies();
    return NextResponse.json({ error: "Invalid refresh token", code: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const now = new Date();
    let session = await prisma.session.findFirst({
      where: { OR: [{ refresh_token: presentedToken }, { previous_refresh_token: presentedToken }] },
      include: { user: true },
    });
    if (!session || session.expires_at <= now) {
      await clearAuthCookies();
      return NextResponse.json({ error: "Session expired", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const sessionId = session.id;
    const userId = session.user_id;
    const inGrace = session.rotating_at !== null && session.rotating_at <= now && now.getTime() - session.rotating_at.getTime() <= GRACE_MS;
    if (session.previous_refresh_token === presentedToken) {
      if (!session.rotating_at || now.getTime() - session.rotating_at.getTime() > GRACE_MS) {
        await clearAuthCookies();
        return NextResponse.json({ error: "Session expired", code: "UNAUTHORIZED" }, { status: 401 });
      }
    } else if (!inGrace) {
      if (session.rotating_at && session.previous_refresh_token === null) {
        await clearAuthCookies();
        return NextResponse.json({ error: "Session expired", code: "UNAUTHORIZED" }, { status: 401 });
      }
      await prisma.session.updateMany({
        where: { id: session.id, user_id: userId, refresh_token: presentedToken, expires_at: { gt: now },
          OR: [{ rotating_at: null }, { previous_refresh_token: { not: null }, rotating_at: { lt: new Date(now.getTime() - GRACE_MS) } }],
        },
        data: {
          refresh_token: randomUUID(), previous_refresh_token: presentedToken, rotating_at: now,
          expires_at: new Date(now.getTime() + REFRESH_TTL_MS),
        },
      });
    }
    session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    const checkedAt = new Date();
    if (!session || session.user_id !== userId || session.user.id !== userId || session.expires_at <= checkedAt ||
        !session.previous_refresh_token || !session.rotating_at || session.rotating_at > checkedAt ||
        checkedAt.getTime() - session.rotating_at.getTime() > GRACE_MS ||
        (session.refresh_token !== presentedToken && session.previous_refresh_token !== presentedToken)) {
      return NextResponse.json({ error: "Session expired", code: "UNAUTHORIZED" }, { status: 401 });
    }
    await cacheDelete(`session:${presentedToken}`);
    const accessToken = await signJwt({
      id: session.user_id, role: session.user.role, phone_number: session.user.phone_number, sid: session.id,
    });
    await setAuthCookies(accessToken, session.refresh_token, session.user.role);
    return NextResponse.json({ data: { success: true } });
  } catch {
    console.error("Refresh temporarily unavailable");
    return NextResponse.json({ error: "Refresh temporarily unavailable", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
