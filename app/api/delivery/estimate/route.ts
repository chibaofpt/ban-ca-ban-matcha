import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStoreLocation, goongDistanceMatrix } from "@/lib/goong";
import { calcShippingFee } from "@/src/utils/pricing";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const destLatStr = searchParams.get("lat");
  const destLngStr = searchParams.get("lng");

  if (!destLatStr || !destLngStr) {
    return NextResponse.json({ error: "Query 'lat' and 'lng' are required", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const destLat = parseFloat(destLatStr);
  const destLng = parseFloat(destLngStr);

  if (isNaN(destLat) || isNaN(destLng)) {
    return NextResponse.json({ error: "Invalid coordinates", code: "VALIDATION_ERROR" }, { status: 400 });
  }

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
  } catch (error) {
    console.error("[GET /api/delivery/estimate] Error:", error);
    return NextResponse.json(
      { error: "Failed to estimate delivery fee", code: "GOONG_API_ERROR" },
      { status: 502 }
    );
  }
}
