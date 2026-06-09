import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addressService } from "@/src/services/addressService";
import type { Address } from "@/src/lib/types/address";

/**
 * Hook fetch danh sách địa chỉ của khách hàng.
 */
export function useCustomerAddresses() {
  return useQuery({
    queryKey: ["customer", "addresses"],
    queryFn: addressService.getAddresses,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook tạo địa chỉ mới
 */
export function useCreateAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: any) => addressService.createAddress(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", "addresses"] });
    },
  });
}

/**
 * Hook cập nhật địa chỉ
 */
export function useUpdateAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => addressService.updateAddress(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", "addresses"] });
    },
  });
}

/**
 * Hook xoá địa chỉ
 */
export function useDeleteAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => addressService.deleteAddress(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", "addresses"] });
    },
  });
}

/**
 * Hook set địa chỉ mặc định
 */
export function useSetDefaultAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => addressService.setDefaultAddress(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", "addresses"] });
    },
  });
}
