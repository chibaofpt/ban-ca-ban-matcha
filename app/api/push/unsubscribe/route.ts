import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unsubscribeSchema } from "@/lib/validations/push";

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
    const parsed = unsubscribeSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { endpoint } = parsed.data;

    await prisma.pushSubscription.updateMany({
      where: {
        user_id: session.id,
        endpoint,
      },
      data: { is_active: false },
    });

    return NextResponse.json({ data: { unsubscribed: true } });
  } catch (error) {
    console.error("[POST /api/push/unsubscribe]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
