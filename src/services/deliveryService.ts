import { apiClient as api } from "@/src/lib/api/client";
import { GoongPrediction, DeliveryEstimate } from "@/src/lib/types/address";

export const deliveryService = {
  autocomplete: async (input: string): Promise<GoongPrediction[]> => {
    if (!input.trim()) return [];
    const { data } = await api.get<{ data: GoongPrediction[] }>("/api/delivery/autocomplete", {
      params: { q: input },
    });
    return data.data;
  },

  geocode: async (address: string): Promise<{ lat: number; lng: number }> => {
    const { data } = await api.get<{ data: { lat: number; lng: number } }>("/api/delivery/geocode", {
      params: { address },
    });
    return data.data;
  },

  estimateFee: async (lat: number, lng: number): Promise<DeliveryEstimate> => {
    const { data } = await api.get<{ data: DeliveryEstimate }>("/api/delivery/estimate", {
      params: { lat, lng },
    });
    return data.data;
  },

  /** Reverse geocode — convert GPS lat/lng to a human-readable address. */
  reverseGeocode: async (lat: number, lng: number): Promise<{ address: string; lat: number; lng: number }> => {
    const { data } = await api.get<{ data: { address: string; lat: number; lng: number } }>("/api/delivery/reverse-geocode", {
      params: { lat, lng },
    });
    return data.data;
  },
};
