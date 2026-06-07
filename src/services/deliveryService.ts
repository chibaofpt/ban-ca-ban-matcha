import { apiClient as api } from "@/src/lib/api/client";
import { GoongPrediction, DeliveryEstimate } from "@/src/lib/types/address";

export const deliveryService = {
  autocomplete: async (input: string): Promise<GoongPrediction[]> => {
    if (!input.trim()) return [];
    const { data } = await api.get<{ data: GoongPrediction[] }>("/api/delivery/autocomplete", {
      params: { input },
    });
    return data.data;
  },

  geocode: async (place_id: string): Promise<{ lat: number; lng: number }> => {
    const { data } = await api.get<{ data: { lat: number; lng: number } }>("/api/delivery/geocode", {
      params: { place_id },
    });
    return data.data;
  },

  estimateFee: async (lat: number, lng: number): Promise<DeliveryEstimate> => {
    const { data } = await api.get<{ data: DeliveryEstimate }>("/api/delivery/estimate", {
      params: { lat, lng },
    });
    return data.data;
  },
};
