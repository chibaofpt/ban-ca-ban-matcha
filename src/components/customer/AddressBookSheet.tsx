"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { ChevronLeft, Loader2, MapPin, Plus, X } from "lucide-react";
import { AddressCard } from "@/src/components/address/AddressCard";
import { AddressForm } from "@/src/components/address/AddressForm";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";
import type { Address, AddressPayload } from "@/src/lib/types/address";
import {
  createAddressBookState,
  openAddressEditor,
  openNewAddressForm,
  returnToAddressList,
} from "@/src/lib/utils/addressBookSheet";

interface AddressBookSheetProps {
  open: boolean;
  addresses: Address[];
  loading: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (address: Address | null, payload: AddressPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
}

/** Render address list and add/edit layers inside one mobile bottom sheet. */
export function AddressBookSheet({
  open,
  addresses,
  loading,
  submitting,
  onOpenChange,
  onSave,
  onDelete,
  onSetDefault,
}: AddressBookSheetProps) {
  const [state, setState] = useState(createAddressBookState);
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setState(createAddressBookState());
      setDeleteTarget(null);
    }
    onOpenChange(nextOpen);
  };

  const saveAddress = async (payload: AddressPayload) => {
    await onSave(state.editingAddress, payload);
    setState((current) => returnToAddressList(current));
  };

  const canAddNew = addresses.length < DELIVERY_CONFIG.MAX_ADDRESSES_PER_USER;
  const editing = state.editingAddress;

  return (
    <>
      <Drawer.Root open={open} onOpenChange={handleOpenChange} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[90] bg-black/45" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[91] mx-auto flex h-[90dvh] max-w-lg flex-col rounded-t-[2rem] bg-card shadow-2xl outline-none">
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-primary/20" />
            <header className="flex items-start gap-2 border-b border-border/60 px-3 pb-4 pt-3">
              {state.view === "form" && (
                <button
                  type="button"
                  onClick={() => setState((current) => returnToAddressList(current))}
                  aria-label="Quay lại sổ địa chỉ"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div className="min-w-0 flex-1 pt-1">
                <Drawer.Title className="font-serif text-xl font-bold text-primary">
                  {state.view === "list"
                    ? "Sổ địa chỉ giao hàng"
                    : editing
                      ? "Chỉnh sửa địa chỉ"
                      : "Thêm địa chỉ mới"}
                </Drawer.Title>
                <Drawer.Description className="mt-1 text-sm text-muted-foreground">
                  {state.view === "list"
                    ? `${addresses.length}/${DELIVERY_CONFIG.MAX_ADDRESSES_PER_USER} địa chỉ đã lưu`
                    : "Chọn vị trí và cập nhật thông tin người nhận."}
                </Drawer.Description>
              </div>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                aria-label="Đóng sổ địa chỉ"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
              {state.view === "form" ? (
                <AddressForm
                  key={editing?.id ?? "new-address"}
                  initialData={editing ?? undefined}
                  onSubmit={saveAddress}
                  onCancel={() => setState((current) => returnToAddressList(current))}
                  isLoading={submitting}
                />
              ) : loading ? (
                <div className="flex min-h-64 items-center justify-center" aria-label="Đang tải địa chỉ">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {canAddNew && (
                    <button
                      type="button"
                      onClick={() => setState((current) => openNewAddressForm(current))}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="h-5 w-5" />
                      Thêm địa chỉ mới
                    </button>
                  )}

                  {addresses.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-4 py-12 text-center">
                      <MapPin className="mx-auto h-10 w-10 text-primary/35" />
                      <p className="mt-3 font-semibold text-primary">Chưa có địa chỉ nào</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Thêm địa chỉ để đặt giao hàng nhanh hơn.
                      </p>
                    </div>
                  ) : (
                    addresses.map((address) => (
                      <AddressCard
                        key={address.id}
                        address={address}
                        onEdit={() => setState((current) => openAddressEditor(current, address))}
                        onDelete={() => setDeleteTarget(address)}
                        onSetDefault={() => void onSetDefault(address.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Xóa địa chỉ?"
        message={deleteTarget ? `Địa chỉ “${deleteTarget.label}” sẽ bị xóa khỏi sổ địa chỉ.` : ""}
        confirmLabel="Xóa địa chỉ"
        isDestructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const targetId = deleteTarget.id;
          setDeleteTarget(null);
          void onDelete(targetId);
        }}
      />
    </>
  );
}
