import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { goongGeocode } from "@/lib/goong";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Query 'address' is required", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const coords = await goongGeocode(address);
    if (!coords) {
      return NextResponse.json(
        { error: "Could not find coordinates for this address", code: "GEOCODING_FAILED" },
        { status: 400 }
      );
    }
    return NextResponse.json({ data: coords });
  } catch (error) {
    console.error("[GET /api/delivery/geocode] Error:", error);
    return NextResponse.json(
      { error: "Failed to geocode address", code: "GOONG_API_ERROR" },
      { status: 502 }
    );
  }
}
