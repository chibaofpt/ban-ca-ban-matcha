import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { goongReverseGeocode } from "@/lib/goong";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";
import { locationQuerySchema } from "@/lib/validations/delivery";
import { captureServerException } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Reverse geocode lat/lng to a human-readable address via Goong. */
export async function GET(req: NextRequest) {
  const parsed = locationQuerySchema.safeParse({
    lat: req.nextUrl.searchParams.get("lat") ?? undefined,
    lng: req.nextUrl.searchParams.get("lng") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid coordinates", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const limit = await checkRateLimits([
    { ruleName: "deliveryAccount", identifier: session.id },
    { ruleName: "deliveryIp", identifier: getClientIp(req) },
  ]);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const { lat, lng } = parsed.data;

  try {
    const result = await goongReverseGeocode(lat, lng);
    if (!result) {
      return NextResponse.json(
        { error: "Không tìm thấy địa chỉ cho vị trí này", code: "REVERSE_GEOCODE_FAILED" },
        { status: 400 }
      );
    }
    return NextResponse.json({ data: { address: result.address, lat, lng } });
  } catch {
    captureServerException(new Error("Delivery reverse geocode upstream failure"), {
      operation: "delivery_reverse_geocode",
    });
    return NextResponse.json(
      { error: "Failed to reverse geocode", code: "GOONG_API_ERROR" },
      { status: 502 }
    );
  }
}
