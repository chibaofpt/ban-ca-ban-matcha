import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subscribeSchema } from "@/lib/validations/push";

export async function POST(req: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  if (session.role === "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

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
  } catch (error) {
    console.error("[POST /api/push/subscribe]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
