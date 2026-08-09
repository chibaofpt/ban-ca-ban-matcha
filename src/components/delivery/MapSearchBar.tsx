"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { deliveryService } from "@/src/services/deliveryService";
import { Search, MapPin, Loader2, X } from "lucide-react";
import type { GoongPrediction } from "@/src/lib/types/address";

interface Props {
  /** Called when user selects a search result — provides lat/lng for the map to fly to */
  onSelect: (lat: number, lng: number, address: string) => void;
}

/** Search bar overlay for the map — uses Goong Autocomplete + Geocode APIs */
export function MapSearchBar({ onSelect }: Props) {
  const [input, setInput] = useState("");
  const [predictions, setPredictions] = useState<GoongPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setPredictions([]);
      return;
    }
    try {
      setLoading(true);
      const results = await deliveryService.autocomplete(query);
      setPredictions(results);
    } catch {
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    setIsOpen(true);

    // Debounce 1s
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 1000);
  };

  const handleSelect = async (prediction: GoongPrediction) => {
    try {
      setGeocoding(true);
      setInput(prediction.description);
      setIsOpen(false);
      const { lat, lng } = await deliveryService.geocode(prediction.description);
      onSelect(lat, lng, prediction.description);
    } catch {
      // The server adapter records Goong REST failures without exposing customer input.
    } finally {
      setGeocoding(false);
    }
  };

  const handleClear = () => {
    setInput("");
    setPredictions([]);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="absolute top-16 left-3 right-3 z-10">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onBlur={() => window.scrollTo(0, 0)}
          onFocus={() => input.trim() && setIsOpen(true)}
          className="block min-h-11 w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-11 text-sm shadow-lg transition-all focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Tìm đường, địa điểm..."
        />
        {(loading || geocoding) && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <Loader2 className="h-4 w-4 animate-spin text-green-600" />
          </div>
        )}
        {!loading && !geocoding && input && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Xóa nội dung tìm kiếm"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600"
          >
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {isOpen && predictions.length > 0 && (
        <ul className="mt-1 bg-white shadow-lg max-h-48 rounded-xl overflow-auto border border-gray-100 divide-y divide-gray-50">
          {predictions.map((p) => (
            <li
              key={p.place_id}
              onClick={() => handleSelect(p)}
              className="relative min-h-11 cursor-pointer select-none py-2.5 pl-9 pr-3 transition-colors hover:bg-green-50"
            >
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400">
                <MapPin className="h-3.5 w-3.5" />
              </span>
              <span className="block truncate text-sm font-medium text-gray-900">
                {p.structured_formatting.main_text}
              </span>
              <span className="block truncate text-xs text-gray-500">
                {p.structured_formatting.secondary_text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {isOpen && input.trim().length >= 2 && !loading && predictions.length === 0 && (
        <div className="mt-1 bg-white shadow-lg rounded-xl border border-gray-100 p-3 text-center text-xs text-gray-500">
          Không tìm thấy địa chỉ phù hợp
        </div>
      )}
    </div>
  );
}
