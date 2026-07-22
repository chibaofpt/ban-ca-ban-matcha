import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addressSchema } from "@/lib/validations/address";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";
import { getStoreLocation, goongDistanceMatrix } from "@/lib/goong";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  void req;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const addresses = await prisma.address.findMany({
      where: { user_id: session.id },
      orderBy: [
        { is_default: "desc" },
        { created_at: "desc" }
      ],
    });

    return NextResponse.json({ data: addresses });
  } catch (error) {
    console.error("[GET /api/profile/addresses] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = addressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", code: "VALIDATION_ERROR", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const count = await prisma.address.count({
      where: { user_id: session.id },
    });

    if (count >= DELIVERY_CONFIG.MAX_ADDRESSES_PER_USER) {
      return NextResponse.json(
        { 
          error: `Bạn chỉ được lưu tối đa ${DELIVERY_CONFIG.MAX_ADDRESSES_PER_USER} địa chỉ`, 
          code: "MAX_ADDRESSES_REACHED" 
        },
        { status: 400 }
      );
    }

    const isFirst = count === 0;
    const shouldBeDefault = isFirst || parsed.data.is_default;

    // Calculate exact road distance using Goong API
    const storeLoc = getStoreLocation();
    const distanceEstimate = await goongDistanceMatrix(
      storeLoc.lat,
      storeLoc.lng,
      parsed.data.lat,
      parsed.data.lng
    );

    if (!distanceEstimate) {
      return NextResponse.json(
        { error: "Không thể tính toán khoảng cách đến địa chỉ này. Vui lòng chọn vị trí khác hoặc thử lại.", code: "DELIVERY_ESTIMATE_FAILED" },
        { status: 400 }
      );
    }

    const address = await prisma.$transaction(async (tx) => {
      // If setting default, unset others
      if (shouldBeDefault && !isFirst) {
        await tx.address.updateMany({
          where: { user_id: session.id, is_default: true },
          data: { is_default: false },
        });
      }

      const createdAddress = await tx.address.create({
        data: {
          user_id: session.id,
          ...parsed.data,
          is_default: shouldBeDefault,
          distance_km: distanceEstimate.distanceKm,
        },
      });

      return createdAddress;
    });

    return NextResponse.json({ data: address }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/profile/addresses] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
