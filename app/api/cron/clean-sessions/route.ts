import { NextResponse } from "next/server";
import { runCleanExpiredSessions } from "@/lib/cleanExpiredSessions";
import { verifyCronRequest } from "@/lib/cronAuth";
import { captureServerException } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** GET /api/cron/clean-sessions — delete expired sessions in bounded batches. */
export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const result = await runCleanExpiredSessions();
    return NextResponse.json({ data: result });
  } catch (error) {
    captureServerException(error, { operation: "clean_expired_sessions_route" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
