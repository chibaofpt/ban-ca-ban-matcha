import { apiClient as api } from "@/src/lib/api/client";
import { Address, AddressPayload } from "@/src/lib/types/address";

export const addressService = {
  getAddresses: async (): Promise<Address[]> => {
    const { data } = await api.get<{ data: Address[] }>("/api/profile/addresses");
    return data.data;
  },

  createAddress: async (payload: AddressPayload): Promise<Address> => {
    const { data } = await api.post<{ data: Address }>("/api/profile/addresses", payload);
    return data.data;
  },

  updateAddress: async (id: string, payload: AddressPayload): Promise<Address> => {
    const { data } = await api.put<{ data: Address }>(`/api/profile/addresses/${id}`, payload);
    return data.data;
  },

  deleteAddress: async (id: string): Promise<void> => {
    await api.delete(`/api/profile/addresses/${id}`);
  },
};
