"use client";

import React, { useState } from "react";
import { AddressAutocomplete } from "./AddressAutocomplete";
import type { AddressPayload } from "@/src/lib/types/address";
import { Loader2 } from "lucide-react";

interface Props {
  initialData?: AddressPayload;
  onSubmit: (data: AddressPayload) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function AddressForm({ initialData, onSubmit, onCancel, isLoading }: Props) {
  const [address, setAddress] = useState(initialData?.address ?? "");
  const [lat, setLat] = useState<number | null>(initialData?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initialData?.lng ?? null);
  const [receiverName, setReceiverName] = useState(initialData?.receiver_name ?? "");
  const [receiverPhone, setReceiverPhone] = useState(initialData?.receiver_phone ?? "");
  const [isDefault, setIsDefault] = useState(initialData?.is_default ?? false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!address || !lat || !lng) {
      setError("Vui lòng chọn địa chỉ từ danh sách gợi ý");
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

    // Convert local 0 to +84 for consistency if needed, but validation allows both.
    // The backend standardizes to +84, let's let backend handle it or do it here.
    const normalizedPhone = receiverPhone.startsWith("0") 
      ? `+84${receiverPhone.slice(1)}` 
      : receiverPhone;

    try {
      await onSubmit({
        address,
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Địa chỉ giao hàng <span className="text-red-500">*</span>
        </label>
        <AddressAutocomplete
          value={address}
          onChange={(newAddr, newLat, newLng) => {
            setAddress(newAddr);
            setLat(newLat);
            setLng(newLng);
            setError("");
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
          disabled={isLoading}
          className="px-5 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center min-w-[100px]"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu địa chỉ"}
        </button>
      </div>
    </form>
  );
}
