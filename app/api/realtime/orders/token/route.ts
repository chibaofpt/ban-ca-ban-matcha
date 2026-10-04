import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createOrderRealtimeToken } from "@/lib/orderRealtime";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Issue a short-lived receive-only capability to an authenticated operator. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401, headers });
  }
  if (session.role !== "ADMIN" && session.role !== "STAFF") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403, headers });
  }
  try {
    const data = await createOrderRealtimeToken(session.role, session.session_id ?? "");
    return NextResponse.json({ data }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Realtime unavailable", code: "SERVICE_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
