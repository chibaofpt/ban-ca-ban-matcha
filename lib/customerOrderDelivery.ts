import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { goongDistanceMatrix, getStoreLocation } from "@/lib/goong";
import { checkStoreOpen, validatePickupTime } from "@/lib/storeSchedule";
import type { CustomerOrderInput } from "@/lib/validations/order";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";
import { calcShippingFee } from "@/src/utils/pricing";

export interface CustomerDeliveryResolution {
  shipping_fee_vnd: number;
  actual_distance_km: number | null;
  address_id: string | null;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  receiver_name: string | null;
  receiver_phone: string | null;
}

export type CustomerFulfillmentResult =
  | { ok: true; delivery: CustomerDeliveryResolution }
  | { ok: false; response: NextResponse };

function errorResponse(error: string, code: string, status: number): CustomerFulfillmentResult {
  return { ok: false, response: NextResponse.json({ error, code }, { status }) };
}

/** Validates store hours, pickup time, and server-authoritative delivery details. */
export async function resolveCustomerFulfillment(
  data: CustomerOrderInput,
  userId: string,
): Promise<CustomerFulfillmentResult> {
  const storeStatus = await checkStoreOpen();
  if (!storeStatus.is_open) {
    const error = storeStatus.closure_note
      ? `Cửa hàng tạm đóng cửa: ${storeStatus.closure_note}`
      : "Cửa hàng hiện đang đóng cửa, vui lòng đặt hàng trong giờ mở cửa";
    return errorResponse(error, "STORE_CLOSED", 503);
  }

  const pickupTime = data.pickup_time
    ? new Date(data.pickup_time)
    : new Date(Date.now() + 10 * 60 * 1000);
  const pickupValidation = await validatePickupTime(pickupTime);
  if (!pickupValidation.isValid) {
    return errorResponse(pickupValidation.error ?? "Invalid pickup time", "INVALID_PICKUP_TIME", 400);
  }

  const delivery: CustomerDeliveryResolution = {
    shipping_fee_vnd: 0,
    actual_distance_km: null,
    address_id: null,
    delivery_address: null,
    delivery_lat: null,
    delivery_lng: null,
    receiver_name: null,
    receiver_phone: null,
  };
  if (data.order_type !== "DELIVERY") return { ok: true, delivery };

  if (data.address_id) {
    const address = await prisma.address.findFirst({
      where: { id: data.address_id, user_id: userId },
    });
    if (!address) return errorResponse("Delivery address not found", "NOT_FOUND", 404);
    delivery.address_id = address.id;
    delivery.delivery_address = address.full_address;
    delivery.delivery_lat = address.lat;
    delivery.delivery_lng = address.lng;
    delivery.actual_distance_km = address.distance_km;
    delivery.receiver_name = data.delivery_receiver_name ?? address.receiver_name;
    delivery.receiver_phone = data.delivery_receiver_phone ?? address.receiver_phone;
  } else {
    if (
      data.delivery_lat === undefined ||
      data.delivery_lng === undefined ||
      !data.delivery_receiver_name ||
      !data.delivery_receiver_phone
    ) {
      return errorResponse("Vui lòng cung cấp đầy đủ thông tin giao hàng", "VALIDATION_ERROR", 400);
    }
    delivery.delivery_address = data.delivery_address ?? null;
    delivery.delivery_lat = data.delivery_lat;
    delivery.delivery_lng = data.delivery_lng;
    delivery.receiver_name = data.delivery_receiver_name;
    delivery.receiver_phone = data.delivery_receiver_phone;
  }

  if (
    delivery.delivery_lat === null ||
    delivery.delivery_lng === null ||
    !delivery.receiver_name ||
    !delivery.receiver_phone
  ) {
    return errorResponse("Vui lòng cung cấp đầy đủ thông tin giao hàng", "VALIDATION_ERROR", 400);
  }

  if (delivery.actual_distance_km === null) {
    const store = getStoreLocation();
    const matrix = await goongDistanceMatrix(
      store.lat,
      store.lng,
      delivery.delivery_lat,
      delivery.delivery_lng,
    );
    if (!matrix) {
      return errorResponse(
        "Không thể tính toán khoảng cách giao hàng. Vui lòng thử lại.",
        "DISTANCE_MATRIX_FAILED",
        400,
      );
    }
    delivery.actual_distance_km = matrix.distanceKm;
  }

  if (delivery.actual_distance_km > DELIVERY_CONFIG.MAX_RADIUS_KM) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Khoảng cách giao hàng (${delivery.actual_distance_km.toFixed(1)}km) vượt quá giới hạn cho phép (${DELIVERY_CONFIG.MAX_RADIUS_KM}km)`,
          code: "DELIVERY_OUT_OF_RANGE",
          details: { distanceKm: delivery.actual_distance_km },
        },
        { status: 400 },
      ),
    };
  }

  delivery.shipping_fee_vnd = calcShippingFee(delivery.actual_distance_km);
  if (
    data.client_shipping_fee_vnd !== undefined &&
    data.client_shipping_fee_vnd !== delivery.shipping_fee_vnd
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Phí giao hàng đã thay đổi. Vui lòng thử lại.",
          code: "SHIPPING_FEE_CHANGED",
          details: { conflicts: ["shipping_fee"] },
        },
        { status: 409 },
      ),
    };
  }

  return { ok: true, delivery };
}
