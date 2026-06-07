import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { goongAutocomplete } from "@/lib/goong";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const sessionToken = searchParams.get("session_token");

  if (!q) {
    return NextResponse.json({ error: "Query 'q' is required", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const predictions = await goongAutocomplete(q, sessionToken || undefined);
    return NextResponse.json({ data: { predictions } });
  } catch (error) {
    console.error("[GET /api/delivery/autocomplete] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch address suggestions", code: "GOONG_API_ERROR" },
      { status: 502 }
    );
  }
}
