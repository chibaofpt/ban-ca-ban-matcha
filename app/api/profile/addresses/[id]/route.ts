import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addressSchema } from "@/lib/validations/address";
import { getStoreLocation, goongDistanceMatrix } from "@/lib/goong";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.address.findUnique({
      where: { id },
    });

    if (!existing || existing.user_id !== session.id) {
      return NextResponse.json({ error: "Address not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = addressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", code: "VALIDATION_ERROR", details: parsed.error.format() },
        { status: 400 }
      );
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

    const shouldBeDefault = parsed.data.is_default;

    let finalDistanceKm = existing.distance_km;
    const coordsChanged = existing.lat !== parsed.data.lat || existing.lng !== parsed.data.lng;
    
    if (coordsChanged || existing.distance_km === null) {
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
      finalDistanceKm = distanceEstimate.distanceKm;
    }

    const address = await prisma.$transaction(async (tx) => {
      if (shouldBeDefault && !existing.is_default) {
        await tx.address.updateMany({
          where: { user_id: session.id, is_default: true },
          data: { is_default: false },
        });
      }

      return tx.address.update({
        where: { id },
        data: {
          ...parsed.data,
          distance_km: finalDistanceKm,
        },
      });
    });

    return NextResponse.json({ data: address });
  } catch (error) {
    console.error("[PUT /api/profile/addresses/:id] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.address.findUnique({
      where: { id },
    });

    if (!existing || existing.user_id !== session.id) {
      return NextResponse.json({ error: "Address not found", code: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      if (existing.is_default) {
        // If we deleted the default, assign default to the most recent one if exists
        const nextAddress = await tx.address.findFirst({
          where: { user_id: session.id },
          orderBy: { created_at: "desc" },
        });

        if (nextAddress) {
          await tx.address.update({
            where: { id: nextAddress.id },
            data: { is_default: true },
          });
        }
      }
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("[DELETE /api/profile/addresses/:id] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
