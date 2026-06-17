import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRefreshTokenCookie, signJwt, createSession, setAuthCookies, clearAuthCookies } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const refreshToken = await getRefreshTokenCookie();

    if (!refreshToken) {
      await clearAuthCookies();
      return NextResponse.json({ error: "Missing refresh token", code: "UNAUTHORIZED" }, { status: 401 });
    }

    // Find the session
    const session = await prisma.session.findUnique({
      where: { refresh_token: refreshToken },
      include: { user: true }
    });

    if (!session || session.expires_at < new Date()) {
      // Missing or expired
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      await clearAuthCookies();
      return NextResponse.json({ error: "Session expired", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = session.user_id;

    // Grace Period for Token Rotation (30 seconds)
    // Instead of deleting the old session immediately, we truncate its lifetime to 30s.
    // This allows concurrent requests (e.g. from multiple tabs) using the same old token to succeed.
    await prisma.session.update({
      where: { id: session.id },
      data: { expires_at: new Date(Date.now() + 30 * 1000) }
    });
    const newRefreshToken = await createSession(userId, session.user.role);

    // Issue new access token
    const newAccessToken = await signJwt({ id: userId, role: session.user.role, phone_number: session.user.phone_number });

    // Set new cookies
    await setAuthCookies(newAccessToken, newRefreshToken, session.user.role);

    return NextResponse.json({ data: { success: true } }, { status: 200 });

  } catch (err: unknown) {
    console.error("Refresh Error:", err);
    await clearAuthCookies();
    return NextResponse.json({ error: "Refresh failed", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
