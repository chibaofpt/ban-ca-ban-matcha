import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { goongGeocode } from "@/lib/goong";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";
import { geocodeQuerySchema } from "@/lib/validations/delivery";
import { captureServerException } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Resolve a validated delivery address to coordinates. */
export async function GET(req: NextRequest) {
  const parsed = geocodeQuerySchema.safeParse({
    address: req.nextUrl.searchParams.get("address") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", code: "VALIDATION_ERROR" }, { status: 400 });
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

  try {
    const coords = await goongGeocode(parsed.data.address);
    if (!coords) {
      return NextResponse.json(
        { error: "Could not find coordinates for this address", code: "GEOCODING_FAILED" },
        { status: 400 }
      );
    }
    return NextResponse.json({ data: coords });
  } catch {
    captureServerException(new Error("Delivery geocode upstream failure"), {
      operation: "delivery_geocode",
    });
    return NextResponse.json(
      { error: "Failed to geocode address", code: "GOONG_API_ERROR" },
      { status: 502 }
    );
  }
}
