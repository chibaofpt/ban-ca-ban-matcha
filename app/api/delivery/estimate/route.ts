import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStoreLocation, goongDistanceMatrix } from "@/lib/goong";
import { calcShippingFee } from "@/src/utils/pricing";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";
import { locationQuerySchema } from "@/lib/validations/delivery";
import { captureServerException } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Estimate distance, duration, and shipping fee for validated coordinates. */
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

  const { lat: destLat, lng: destLng } = parsed.data;

  try {
    const store = getStoreLocation();
    const result = await goongDistanceMatrix(store.lat, store.lng, destLat, destLng);
    
    if (!result) {
      return NextResponse.json(
        { error: "Could not calculate distance to this location", code: "DISTANCE_MATRIX_FAILED" },
        { status: 400 }
      );
    }

    const { distanceKm, durationMinutes } = result;

    if (distanceKm > DELIVERY_CONFIG.MAX_RADIUS_KM) {
      return NextResponse.json(
        { 
          error: `Khoảng cách giao hàng (${distanceKm.toFixed(1)}km) vượt quá giới hạn cho phép (${DELIVERY_CONFIG.MAX_RADIUS_KM}km)`, 
          code: "DELIVERY_OUT_OF_RANGE",
          details: { distanceKm }
        },
        { status: 400 }
      );
    }

    const shipping_fee_vnd = calcShippingFee(distanceKm);

    return NextResponse.json({
      data: {
        distance_km: distanceKm,
        duration_minutes: durationMinutes,
        shipping_fee_vnd
      }
    });
  } catch {
    captureServerException(new Error("Delivery estimate upstream failure"), {
      operation: "delivery_estimate",
    });
    return NextResponse.json(
      { error: "Failed to estimate delivery fee", code: "GOONG_API_ERROR" },
      { status: 502 }
    );
  }
}
