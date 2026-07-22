import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRefreshTokenCookie, clearAuthCookies } from "@/lib/auth";

export async function POST() {
  try {
    const refreshToken = await getRefreshTokenCookie();
    
    // Best-effort removal of session in DB if the token is present
    if (refreshToken) {
      await prisma.session.deleteMany({
        where: { refresh_token: refreshToken }
      });
    }

    // Always clear the cookies
    await clearAuthCookies();

    return NextResponse.json({ data: { success: true } });
  } catch (err: unknown) {
    console.error("Logout Error:", err);
    // Ignore internal DB errors on logout and still clear cookies anyway
    await clearAuthCookies();
    return NextResponse.json({ data: { success: true } });
  }
}
