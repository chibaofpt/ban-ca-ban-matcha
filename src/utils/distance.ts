import { STORE_LOCATION } from "@/src/constants/storeConfig";

/**
 * Tính khoảng cách đường chim bay giữa tọa độ truyền vào và cửa hàng (tính bằng km)
 */
export function getDistanceKm(lat: number, lng: number): number {
  const R = 6371; // Bán kính trái đất (km)
  const dLat = ((lat - STORE_LOCATION.lat) * Math.PI) / 180;
  const dLng = ((lng - STORE_LOCATION.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((STORE_LOCATION.lat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
