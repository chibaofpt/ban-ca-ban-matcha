"use client";

import React, { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useCustomerAddresses, useCreateAddress } from "@/src/hooks/useCustomerAddresses";
import { deliveryService } from "@/src/services/deliveryService";
import type { Address, AddressPayload } from "@/src/lib/types/address";
import { AddressCard } from "@/src/components/address/AddressCard";
import { AddressForm } from "@/src/components/address/AddressForm";
import { MapPin, Plus, Loader2, RefreshCcw } from "lucide-react";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";

interface Props {
  selectedAddressId: string | null;
  onAddressSelect: (address: Address | null, distanceKm: number | null, shippingFee: number | null) => void;
  onError: (error: string | null) => void;
}

export function DeliverySection({ selectedAddressId, onAddressSelect, onError }: Props) {
  const { data: addresses = [], isLoading: loading, isError, refetch } = useCustomerAddresses();
  const createAddressMutation = useCreateAddress();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const estimateMutation = useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) =>
      deliveryService.estimateFee(lat, lng),
  });

  const estimating = estimateMutation.isPending || createAddressMutation.isPending;

  useEffect(() => {
    if (!loading && !selectedAddressId && addresses.length > 0) {
      const defaultAddr = addresses.find(a => a.is_default) || addresses[0];
      handleSelectAddress(defaultAddr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, addresses.length]);

  const handleSelectAddress = async (address: Address) => {
    try {
      onError(null);

      if (address.distance_km !== null) {
        // Distance is already available from DB
        const distance = address.distance_km;
        if (distance > DELIVERY_CONFIG.MAX_RADIUS_KM) {
          throw new Error(`Ngoài vùng giao hàng (${distance.toFixed(1)}km / tối đa ${DELIVERY_CONFIG.MAX_RADIUS_KM}km)`);
        }
        const { calcShippingFee } = await import("@/src/utils/pricing");
        onAddressSelect(address, distance, calcShippingFee(distance));
      } else {
        // Fallback for older addresses missing distance_km
        onAddressSelect(address, null, null);
        const estimate = await estimateMutation.mutateAsync({ lat: address.lat, lng: address.lng });
        onAddressSelect(address, estimate.distance_km, estimate.shipping_fee_vnd);
      }
    } catch (unknownError: unknown) {
      const err = unknownError instanceof Error ? unknownError : new Error();
      onAddressSelect(address, null, null);
      onError(err.message || "Không thể tính phí giao hàng");
    }
  };

  const handleSaveNew = async (payload: AddressPayload) => {
    try {
      const newAddr = await createAddressMutation.mutateAsync(payload);
      setIsFormOpen(false);
      await handleSelectAddress(newAddr);
    } catch (unknownError: unknown) {
      const err = unknownError instanceof Error ? unknownError : new Error();
      onError(err.message || "Có lỗi xảy ra khi thêm địa chỉ");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-green-600" /> Địa chỉ nhận hàng
        </h3>
        {!isFormOpen && (
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1"
          >
            <Plus className="h-4 w-4" /> Thêm mới
          </button>
        )}
      </div>

      {isError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center">
          <p className="text-sm font-bold text-red-900">Không thể tải địa chỉ giao hàng</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mx-auto mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-bold text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
          >
            <RefreshCcw className="size-4" aria-hidden="true" />
            Thử lại
          </button>
        </div>
      ) : isFormOpen ? (
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
          <AddressForm
            onSubmit={handleSaveNew}
            onCancel={() => setIsFormOpen(false)}
            isLoading={estimating}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <p className="text-sm text-gray-500 mb-3">Bạn chưa có địa chỉ giao hàng nào</p>
              <button
                type="button"
                onClick={() => setIsFormOpen(true)}
                className="px-4 py-2 bg-white border border-gray-200 shadow-sm text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Thêm địa chỉ ngay
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {addresses.map((addr) => (
                <AddressCard
                  key={addr.id}
                  address={addr}
                  isSelectable
                  isSelected={selectedAddressId === addr.id}
                  onSelect={() => handleSelectAddress(addr)}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onSetDefault={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {estimating && (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tính phí giao hàng...
        </p>
      )}
    </div>
  );
}
