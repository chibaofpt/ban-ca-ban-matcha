"use client";

import React, { useEffect, useState } from "react";
import { addressService } from "@/src/services/addressService";
import { deliveryService } from "@/src/services/deliveryService";
import type { Address } from "@/src/lib/types/address";
import { AddressCard } from "@/src/components/address/AddressCard";
import { AddressForm } from "@/src/components/address/AddressForm";
import { MapPin, Plus, Loader2 } from "lucide-react";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";


interface Props {
  selectedAddressId: string | null;
  onAddressSelect: (address: Address | null, distanceKm: number | null, shippingFee: number | null) => void;
  onError: (error: string | null) => void;
}

export function DeliverySection({ selectedAddressId, onAddressSelect, onError }: Props) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [estimating, setEstimating] = useState(false);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      const data = await addressService.getAddresses();
      setAddresses(data);
      
      // Auto-select default address if none selected and not form open
      if (!selectedAddressId && data.length > 0) {
        const defaultAddr = data.find(a => a.is_default) || data[0];
        handleSelectAddress(defaultAddr);
      }
    } catch (err) {
      console.error("Failed to load addresses", err);
      onError("Không thể tải danh sách địa chỉ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectAddress = async (address: Address) => {
    try {
      setEstimating(true);
      onError(null);
      
      if (address.distance_km !== null) {
        // Distance is already available from DB
        const distance = address.distance_km;
        if (distance > DELIVERY_CONFIG.MAX_RADIUS_KM) {
          throw new Error(`Ngoài vùng giao hàng (${distance.toFixed(1)}km / tối đa ${DELIVERY_CONFIG.MAX_RADIUS_KM}km)`);
        }
        import("@/src/utils/pricing").then(({ calcShippingFee }) => {
          const fee = calcShippingFee(distance);
          onAddressSelect(address, distance, fee);
          setEstimating(false);
        });
      } else {
        // Fallback for older addresses missing distance_km
        onAddressSelect(address, null, null);
        const estimate = await deliveryService.estimateFee(address.lat, address.lng);
        onAddressSelect(address, estimate.distance_km, estimate.shipping_fee_vnd);
        setEstimating(false);
      }
    } catch (err: any) {
      onAddressSelect(address, null, null);
      onError(err.message || "Không thể tính phí giao hàng");
      setEstimating(false);
    }
  };

  const handleSaveNew = async (payload: any) => {
    try {
      setEstimating(true); // Treat as estimating state to show spinner
      const newAddr = await addressService.createAddress(payload);
      await fetchAddresses();
      setIsFormOpen(false);
      handleSelectAddress(newAddr);
    } catch (err: any) {
      onError(err.message || "Có lỗi xảy ra khi thêm địa chỉ");
    } finally {
      setEstimating(false);
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

      {isFormOpen ? (
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
