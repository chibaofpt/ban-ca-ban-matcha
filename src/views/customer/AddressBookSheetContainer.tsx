"use client";

import { toast } from "sonner";
import { AddressBookSheet } from "@/src/components/customer/AddressBookSheet";
import {
  useCreateAddress,
  useCustomerAddresses,
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from "@/src/hooks/useCustomerAddresses";
import type { Address, AddressPayload } from "@/src/lib/types/address";

interface AddressBookSheetContainerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Connect the profile address sheet to customer address queries and mutations. */
export function AddressBookSheetContainer({
  open,
  onOpenChange,
}: AddressBookSheetContainerProps) {
  const { data: addresses = [], isLoading } = useCustomerAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const setDefaultAddress = useSetDefaultAddress();

  const save = async (address: Address | null, payload: AddressPayload) => {
    if (address) {
      await updateAddress.mutateAsync({ id: address.id, payload });
      toast.success("Đã cập nhật địa chỉ");
      return;
    }
    await createAddress.mutateAsync(payload);
    toast.success("Đã thêm địa chỉ");
  };

  const remove = async (id: string) => {
    try {
      await deleteAddress.mutateAsync(id);
      toast.success("Đã xóa địa chỉ");
    } catch {
      toast.error("Không thể xóa địa chỉ. Vui lòng thử lại.");
    }
  };

  const makeDefault = async (id: string) => {
    try {
      await setDefaultAddress.mutateAsync(id);
      toast.success("Đã đặt làm địa chỉ mặc định");
    } catch {
      toast.error("Không thể cập nhật địa chỉ mặc định.");
    }
  };

  return (
    <AddressBookSheet
      open={open}
      addresses={addresses}
      loading={isLoading}
      submitting={createAddress.isPending || updateAddress.isPending}
      onOpenChange={onOpenChange}
      onSave={save}
      onDelete={remove}
      onSetDefault={makeDefault}
    />
  );
}
