import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCustomerOrder } from "@/lib/customerOrderCreation";
import { getCustomerOrderHistory } from "@/lib/customerOrderHistory";
import { logSystemEvent } from "@/lib/logger";
import { OrderValidationError, PriceChangedError } from "@/lib/orders";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";
import { customerOrderSchema } from "@/lib/validations/order";

export const dynamic = "force-dynamic";

/** POST /api/orders — Customer places a PICKUP/DELIVERY order. Returns payment QR. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const parsed = customerOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Validation failed",
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const orderRateLimit = await checkRateLimits([
    { ruleName: "customerOrderUser", identifier: session.id },
    { ruleName: "customerOrderIp", identifier: getClientIp(req) },
  ]);
  if (!orderRateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Quá nhiều yêu cầu, vui lòng thử lại sau.",
        code: "TOO_MANY_REQUESTS",
      },
      {
        status: 429,
        headers: { "Retry-After": String(orderRateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    return await createCustomerOrder(parsed.data, session.id);
  } catch (error) {
    if (error instanceof OrderValidationError) {
      const statusMap: Record<string, number> = {
        VALIDATION_ERROR: 400,
        NOT_FOUND: 404,
        FORBIDDEN: 403,
      };
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusMap[error.code] ?? 400 },
      );
    }
    if (error instanceof PriceChangedError) {
      return NextResponse.json(
        {
          error: "One or more item prices have changed. Please review and resubmit.",
          code: "PRICE_CHANGED",
          details: { conflicts: error.conflicts },
        },
        { status: 409 },
      );
    }

    console.error("[POST /api/orders] UNHANDLED ERROR:", {
      name: error instanceof Error ? error.name : typeof error,
    });
    await logSystemEvent({
      level: "error",
      source: "POST /api/orders",
      message: "Unhandled order creation error",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

/** GET /api/orders — Customer gets their order history. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(
    1,
    Math.min(100, parseInt(searchParams.get("limit") || "10", 10)),
  );
  try {
    return await getCustomerOrderHistory(session.id, page, limit);
  } catch (error) {
    console.error("[GET /api/orders]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
