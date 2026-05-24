import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/clean-sessions
 * Vercel Cron Job endpoint to delete expired sessions.
 * Configured in vercel.json to run daily.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await prisma.session.deleteMany({
      where: {
        expires_at: {
          lt: new Date(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      deleted_count: result.count,
      message: `Cleaned up ${result.count} expired sessions.`,
    });
  } catch (err: unknown) {
    console.error("[CRON] Clean sessions error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
