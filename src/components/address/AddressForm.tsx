"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import type { AddressPayload } from "@/src/lib/types/address";
import { Loader2, MapPin } from "lucide-react";

const MapPicker = dynamic(
  () => import("@/src/components/delivery/MapPicker").then((m) => ({ default: m.MapPicker })),
  { ssr: false, loading: () => null }
);

interface Props {
  initialData?: AddressPayload;
  onSubmit: (data: AddressPayload) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

/** Address form — uses MapPicker for location selection, then collects receiver info */
export function AddressForm({ initialData, onSubmit, onCancel, isLoading }: Props) {
  const [fullAddress, setFullAddress] = useState(initialData?.full_address ?? "");
  const [label, setLabel] = useState(initialData?.label ?? "");
  const [lat, setLat] = useState<number | null>(initialData?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initialData?.lng ?? null);
  const [receiverName, setReceiverName] = useState(initialData?.receiver_name ?? "");
  const [receiverPhone, setReceiverPhone] = useState(initialData?.receiver_phone ?? "");
  const [isDefault, setIsDefault] = useState(initialData?.is_default ?? false);
  const [error, setError] = useState("");
  const [isMapOpen, setIsMapOpen] = useState(false);

  const handleMapConfirm = (data: { address: string; lat: number; lng: number }) => {
    setFullAddress(data.address);
    setLat(data.lat);
    setLng(data.lng);
    setIsMapOpen(false);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullAddress || !lat || !lng) {
      setError("Vui lòng chọn vị trí giao hàng trên bản đồ");
      return;
    }
    if (!label.trim()) {
      setError("Vui lòng nhập tên gợi nhớ (VD: Nhà, Công ty)");
      return;
    }
    if (!receiverName.trim()) {
      setError("Vui lòng nhập tên người nhận");
      return;
    }
    const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
    if (!phoneRegex.test(receiverPhone)) {
      setError("Số điện thoại không hợp lệ (vd: 0912345678)");
      return;
    }

    const normalizedPhone = receiverPhone.startsWith("0")
      ? `+84${receiverPhone.slice(1)}`
      : receiverPhone;

    try {
      await onSubmit({
        full_address: fullAddress,
        label: label.trim(),
        lat,
        lng,
        receiver_name: receiverName.trim(),
        receiver_phone: normalizedPhone,
        is_default: isDefault,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi lưu địa chỉ");
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Location section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Vị trí giao hàng <span className="text-red-500">*</span>
          </label>

          {fullAddress && lat && lng ? (
            /* Location selected — show preview */
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">{fullAddress}</p>
                <button
                  type="button"
                  onClick={() => setIsMapOpen(true)}
                  className="mt-1 text-xs font-bold text-green-600 hover:text-green-700 transition-colors"
                >
                  Chọn lại vị trí
                </button>
              </div>
            </div>
          ) : (
            /* No location — show CTA button */
            <button
              type="button"
              onClick={() => setIsMapOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-green-700 bg-green-50 border-2 border-dashed border-green-300 rounded-xl hover:bg-green-100 transition-colors"
            >
              <MapPin className="h-4 w-4" />
              Chọn trên bản đồ
            </button>
          )}
        </div>

        {/* Label info */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tên gợi nhớ <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="Ví dụ: Nhà, Công ty..."
          />
        </div>

        {/* Receiver info */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên người nhận <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Ví dụ: Nguyễn Văn A"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Số điện thoại <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
              className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Ví dụ: 0912345678"
            />
          </div>
        </div>

        <div className="flex items-center">
          <input
            id="is_default"
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
          />
          <label htmlFor="is_default" className="ml-2 block text-sm text-gray-900">
            Đặt làm địa chỉ mặc định
          </label>
        </div>

        {error && <div className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-lg">{error}</div>}

        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isLoading || !fullAddress}
            className="px-5 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center min-w-[100px]"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu địa chỉ"}
          </button>
        </div>
      </form>

      {/* Map Picker overlay */}
      {isMapOpen && (
        <MapPicker
          onConfirm={handleMapConfirm}
          onClose={() => setIsMapOpen(false)}
          initialLat={lat ?? undefined}
          initialLng={lng ?? undefined}
        />
      )}
    </>
  );
}

