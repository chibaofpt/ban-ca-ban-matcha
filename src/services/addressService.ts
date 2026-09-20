import { apiClient as api } from "@/src/lib/api/client";
import type { ApiResponse } from "@/contracts/api";
import type { Address, AddressPayload } from "@/contracts/address";

export const addressService = {
  getAddresses: async (): Promise<Address[]> => {
    const { data } = await api.get<ApiResponse<Address[]>>("/api/profile/addresses");
    return data.data;
  },

  createAddress: async (payload: AddressPayload): Promise<Address> => {
    const { data } = await api.post<ApiResponse<Address>>("/api/profile/addresses", payload);
    return data.data;
  },

  updateAddress: async (id: string, payload: AddressPayload): Promise<Address> => {
    const { data } = await api.put<ApiResponse<Address>>(`/api/profile/addresses/${id}`, payload);
    return data.data;
  },

  deleteAddress: async (id: string): Promise<void> => {
    await api.delete(`/api/profile/addresses/${id}`);
  },

  setDefaultAddress: async (id: string): Promise<Address> => {
    const { data } = await api.put<ApiResponse<Address>>(`/api/profile/addresses/${id}`, { is_default: true });
    return data.data;
  },
};
