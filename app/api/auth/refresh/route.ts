import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRefreshTokenCookie, signJwt, createSession, setAuthCookies, clearAuthCookies } from "@/lib/auth";
import { cacheDelete } from "@/lib/redis";

/** POST /api/auth/refresh — rotates the refresh token and issues a new access token. */
export async function POST() {
  const refreshToken = await getRefreshTokenCookie();

  if (!refreshToken) {
    await clearAuthCookies();
    return NextResponse.json({ error: "Missing refresh token", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // Find the session
  let session;
  try {
    session = await prisma.session.findUnique({
      where: { refresh_token: refreshToken },
      include: { user: true },
    });
  } catch (err) {
    // Transient DB error — do NOT clear cookies (session may still be valid).
    // The client can retry; the next request will attempt another refresh.
    console.error("Refresh: DB error finding session:", err);
    return NextResponse.json(
      { error: "Refresh temporarily unavailable", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }

  if (!session || session.expires_at < new Date()) {
    if (session) {
      // Clean up genuinely expired session — best-effort, ignore errors
      try { await prisma.session.delete({ where: { id: session.id } }); } catch { /* noop */ }
    }
    await clearAuthCookies();
    return NextResponse.json({ error: "Session expired", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // ── Rotation lock — prevents double-rotation with middleware ─────────────
  // Use Prisma updateMany with a conditional WHERE so the UPDATE is atomic.
  // Only one concurrent request can acquire the lock; others back off.
  const staleThreshold = new Date(Date.now() - 30_000);

  let lockResult;
  try {
    lockResult = await prisma.session.updateMany({
      where: {
        id: session.id,
        OR: [
          { rotating_at: null },
          { rotating_at: { lt: staleThreshold } },
        ],
      },
      data: { rotating_at: new Date() },
    });
  } catch (err) {
    // Transient DB error on lock — fail safe: don't clear cookies.
    console.error("Refresh: DB error acquiring rotation lock:", err);
    return NextResponse.json(
      { error: "Refresh temporarily unavailable", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }

  if (lockResult.count === 0) {
    // Another concurrent request (likely middleware rotating on page navigation)
    // is already rotating this session. Wait briefly so its new cookies land,
    // then report success — the browser will have valid cookies from the winner.
    await new Promise<void>((r) => setTimeout(r, 300));
    return NextResponse.json({ data: { success: true } }, { status: 200 });
  }

  // ── Perform rotation ─────────────────────────────────────────────────────
  try {
    // Evict Redis cache for old token before setting grace period
    await cacheDelete(`session:${refreshToken}`);

    // Grace Period (30s): truncate old session lifetime instead of deleting it.
    // Concurrent requests using the same old refresh_token can still look it up
    // (and will see rotating_at set, so they'll skip rotation and get user info).
    await prisma.session.update({
      where: { id: session.id },
      data: { expires_at: new Date(Date.now() + 30 * 1000) },
    });

    const newRefreshToken = await createSession(session.user_id, session.user.role);
    const newAccessToken = await signJwt({
      id: session.user_id,
      role: session.user.role,
      phone_number: session.user.phone_number,
    });

    await setAuthCookies(newAccessToken, newRefreshToken, session.user.role);

    return NextResponse.json({ data: { success: true } }, { status: 200 });
  } catch (err) {
    // Rotation failed mid-flight — do NOT clear cookies.
    // The old session still has its grace period so the user isn't immediately locked out.
    console.error("Refresh: rotation failed:", err);
    return NextResponse.json(
      { error: "Refresh failed", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
