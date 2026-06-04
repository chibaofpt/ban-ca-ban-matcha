import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  if (session.role === "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const sentCount = await sendPushToUser(session.id, {
      title: "✅ Test Notification",
      body: "Push notification system is working properly!",
      url: session.role === "ADMIN" ? "/admin/orders" : "/staff/orders",
    });

    return NextResponse.json({ data: { sent: sentCount } });
  } catch (error) {
    console.error("[POST /api/push/test]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
