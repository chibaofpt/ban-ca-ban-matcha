import { apiClient as api } from "@/src/lib/api/client";
import type { ApiResponse } from "@/contracts/api";
import type {
  DeliveryEstimate,
  GeoPoint,
  GoongPrediction,
  ReverseGeocodeResult,
} from "@/contracts/delivery";

export const deliveryService = {
  autocomplete: async (input: string): Promise<GoongPrediction[]> => {
    if (!input.trim()) return [];
    const { data } = await api.get<ApiResponse<GoongPrediction[]>>("/api/delivery/autocomplete", {
      params: { q: input },
    });
    return data.data;
  },

  geocode: async (address: string): Promise<GeoPoint> => {
    const { data } = await api.get<ApiResponse<GeoPoint>>("/api/delivery/geocode", {
      params: { address },
    });
    return data.data;
  },

  estimateFee: async (lat: number, lng: number): Promise<DeliveryEstimate> => {
    const { data } = await api.get<ApiResponse<DeliveryEstimate>>("/api/delivery/estimate", {
      params: { lat, lng },
    });
    return data.data;
  },

  /** Reverse geocode — convert GPS lat/lng to a human-readable address. */
  reverseGeocode: async (lat: number, lng: number): Promise<ReverseGeocodeResult> => {
    const { data } = await api.get<ApiResponse<ReverseGeocodeResult>>("/api/delivery/reverse-geocode", {
      params: { lat, lng },
    });
    return data.data;
  },
};
