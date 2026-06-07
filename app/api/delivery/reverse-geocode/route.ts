import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { goongReverseGeocode } from "@/lib/goong";

export const dynamic = "force-dynamic";

/** Reverse geocode lat/lng to a human-readable address via Goong. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");

  if (!latStr || !lngStr) {
    return NextResponse.json({ error: "lat and lng are required", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng must be valid numbers", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await goongReverseGeocode(lat, lng);
    if (!result) {
      return NextResponse.json(
        { error: "Không tìm thấy địa chỉ cho vị trí này", code: "REVERSE_GEOCODE_FAILED" },
        { status: 400 }
      );
    }
    return NextResponse.json({ data: { address: result.address, lat, lng } });
  } catch (error) {
    console.error("[GET /api/delivery/reverse-geocode] Error:", error);
    return NextResponse.json(
      { error: "Failed to reverse geocode", code: "GOONG_API_ERROR" },
      { status: 502 }
    );
  }
}
