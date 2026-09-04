import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { clearAuthCookies, verifyJwt } from "@/lib/auth";
import { RefreshTokenSchema } from "@/lib/validations/auth";

/** POST /api/auth/logout — revokes the stable session before clearing credentials. */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;
    const refreshToken = cookieStore.get("refresh_token")?.value;
    const claims = accessToken ? await verifyJwt(accessToken) : null;
    const deletedByAccess = claims
      ? await prisma.session.deleteMany({ where: { id: claims.sid, user_id: claims.id } })
      : { count: 0 };
    if (deletedByAccess.count === 0 && refreshToken && RefreshTokenSchema.safeParse(refreshToken).success) {
      await prisma.session.deleteMany({
        where: {
          OR: [
            { refresh_token: refreshToken },
            { previous_refresh_token: refreshToken, rotating_at: { gte: new Date(Date.now() - 30_000) } },
          ],
        },
      });
    }
    await clearAuthCookies();
    return NextResponse.json({ data: { success: true } });
  } catch {
    console.error("Logout temporarily unavailable");
    return NextResponse.json({ error: "Đăng xuất tạm thời không khả dụng", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
