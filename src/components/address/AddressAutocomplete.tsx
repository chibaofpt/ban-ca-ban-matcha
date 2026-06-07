"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAddressAutocomplete } from "@/src/hooks/useAddressAutocomplete";
import { deliveryService } from "@/src/services/deliveryService";
import { Loader2, MapPin, Search } from "lucide-react";
import type { GoongPrediction } from "@/src/lib/types/address";

interface Props {
  value: string;
  onChange: (address: string, lat: number, lng: number) => void;
  error?: string;
}

export function AddressAutocomplete({ value, onChange, error }: Props) {
  const { input, setInput, predictions, loading } = useAddressAutocomplete();
  const [isOpen, setIsOpen] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync initial value
  useEffect(() => {
    if (value && !input && !isOpen) {
      setInput(value);
    }
  }, [value, input, isOpen, setInput]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = async (prediction: GoongPrediction) => {
    try {
      setIsGeocoding(true);
      setInput(prediction.description);
      setIsOpen(false);
      const { lat, lng } = await deliveryService.geocode(prediction.place_id);
      onChange(prediction.description, lat, lng);
    } catch (err) {
      console.error("Geocoding failed:", err);
      // Could show toast here if we had one
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    setIsOpen(true);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          className={`block w-full pl-10 pr-10 py-3 bg-white border ${
            error ? "border-red-500 focus:ring-red-500" : "border-gray-200 focus:ring-green-500 focus:border-green-500"
          } rounded-xl text-sm transition-all focus:outline-none focus:ring-2`}
          placeholder="Nhập địa chỉ nhận hàng..."
        />
        {(loading || isGeocoding) && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <Loader2 className="h-4 w-4 animate-spin text-green-600" />
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}

      {isOpen && predictions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-xl overflow-auto border border-gray-100 divide-y divide-gray-50">
          {predictions.map((p) => (
            <li
              key={p.place_id}
              onClick={() => handleSelect(p)}
              className="cursor-pointer select-none relative py-3 pl-10 pr-4 hover:bg-green-50 transition-colors"
            >
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <MapPin className="h-4 w-4" />
              </span>
              <span className="block truncate font-medium text-gray-900">
                {p.structured_formatting.main_text}
              </span>
              <span className="block truncate text-sm text-gray-500">
                {p.structured_formatting.secondary_text}
              </span>
            </li>
          ))}
        </ul>
      )}
      
      {isOpen && input.trim() && !loading && predictions.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white shadow-lg rounded-xl border border-gray-100 p-4 text-center text-sm text-gray-500">
          Không tìm thấy địa chỉ phù hợp
        </div>
      )}
    </div>
  );
}
