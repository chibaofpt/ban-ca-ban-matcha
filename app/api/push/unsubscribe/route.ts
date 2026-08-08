import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unsubscribeSchema } from "@/lib/validations/push";
import { checkRateLimit } from "@/lib/rateLimit";
import { captureServerException } from "@/lib/observability";

/** Disable one web-push subscription owned by the authenticated staff account. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  if (session.role === "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit("pushMutationAccount", session.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const { endpoint } = parsed.data;

    await prisma.pushSubscription.updateMany({
      where: {
        user_id: session.id,
        endpoint,
      },
      data: { is_active: false },
    });

    return NextResponse.json({ data: { unsubscribed: true } });
  } catch {
    captureServerException(new Error("Push subscription mutation failed"), {
      operation: "push_unsubscribe",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
