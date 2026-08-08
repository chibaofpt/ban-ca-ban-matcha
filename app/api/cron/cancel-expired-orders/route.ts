import { NextRequest, NextResponse } from "next/server";
import { runCancelExpiredOrders } from "@/lib/cancelExpiredOrders";
import { verifyCronRequest } from "@/lib/cronAuth";
import { captureServerException, withAutoCancelMonitor } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** GET /api/cron/cancel-expired-orders — cancel one bounded batch of expired orders. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  try {
    const result = await withAutoCancelMonitor(runCancelExpiredOrders);
    if (result.failed > 0) {
      return NextResponse.json(
        {
          error: "Some expired orders could not be cancelled",
          code: "INTERNAL_ERROR",
          details: result,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    captureServerException(error, { operation: "cancel_expired_orders_route" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
