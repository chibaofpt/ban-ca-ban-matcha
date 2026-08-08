import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subscribeSchema } from "@/lib/validations/push";
import { checkRateLimit } from "@/lib/rateLimit";
import { captureServerException } from "@/lib/observability";

/** Subscribe the authenticated staff account to web push. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
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
    const { endpoint, keys } = parsed.data;

    await prisma.pushSubscription.upsert({
      where: {
        user_id_endpoint: {
          user_id: session.id,
          endpoint,
        },
      },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        is_active: true,
      },
      create: {
        user_id: session.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        is_active: true,
      },
    });

    return NextResponse.json({ data: { subscribed: true } });
  } catch {
    captureServerException(new Error("Push subscription mutation failed"), {
      operation: "push_subscribe",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
