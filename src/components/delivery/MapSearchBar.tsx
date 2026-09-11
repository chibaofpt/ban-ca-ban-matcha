"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { deliveryService } from "@/src/services/deliveryService";
import { useDebounce } from "@/src/hooks/useDebounce";
import { Search, MapPin, Loader2, X } from "lucide-react";
import type { GoongPrediction } from "@/src/lib/types/address";

interface Props {
  /** Called when user selects a search result — provides lat/lng for the map to fly to */
  onSelect: (lat: number, lng: number, address: string, token: ForwardGeocodeRequestToken) => void;
  /** Reports the latest forward-geocode request so the parent can lock confirmation. */
  onSelectionStateChange?: (state: ForwardGeocodeState) => void;
  /** Parent-owned generation used to invalidate a search when the map changes independently. */
  parentGeneration?: number;
}

/** Identifies one forward-geocode request across the search bar and map picker. */
export interface ForwardGeocodeRequestToken {
  generation: number;
  requestId: number;
}

export type ForwardGeocodeState =
  | { status: "idle" }
  | { status: "pending"; token: ForwardGeocodeRequestToken }
  | { status: "success"; token: ForwardGeocodeRequestToken }
  | { status: "error"; message: string; token: ForwardGeocodeRequestToken };

/** Search bar overlay for the map — uses Goong Autocomplete + Geocode APIs */
export function MapSearchBar({ onSelect, onSelectionStateChange, parentGeneration = 0 }: Props) {
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const forwardRequestIdRef = useRef(0);
  const lastGeocodeAddressRef = useRef<string | null>(null);
  const parentGenerationRef = useRef(parentGeneration);
  const [activeForwardGeneration, setActiveForwardGeneration] = useState<number | null>(null);
  const [geocodeErrorGeneration, setGeocodeErrorGeneration] = useState<number | null>(null);
  const debouncedInput = useDebounce(input.trim(), 1000);

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

  useEffect(() => {
    parentGenerationRef.current = parentGeneration;
  }, [parentGeneration]);

  const { data: predictions = [], isFetching: queryFetching, isError: queryError, refetch } = useQuery({
    queryKey: ["delivery", "autocomplete", debouncedInput],
    queryFn: () => deliveryService.autocomplete(debouncedInput),
    enabled: debouncedInput.length >= 2,
    staleTime: 60_000,
    retry: false,
  });

  const geocodeMutation = useMutation({
    mutationFn: (address: string) => deliveryService.geocode(address),
  });

  const startForwardGeocode = (address: string) => {
    const token: ForwardGeocodeRequestToken = {
      generation: parentGeneration,
      requestId: ++forwardRequestIdRef.current,
    };
    setActiveForwardGeneration(token.generation);
    setGeocodeError(null);
    setGeocodeErrorGeneration(null);
    geocodeMutation.reset();
    onSelectionStateChange?.({ status: "pending", token });
    geocodeMutation.mutate(address, {
      onSuccess: ({ lat, lng }) => {
        if (token.requestId !== forwardRequestIdRef.current || parentGenerationRef.current !== token.generation) return;
        onSelectionStateChange?.({ status: "success", token });
        onSelect(lat, lng, address, token);
      },
      onError: () => {
        if (token.requestId !== forwardRequestIdRef.current || parentGenerationRef.current !== token.generation) return;
        const message = "Không thể xác định tọa độ địa chỉ này. Hãy thử lại.";
        setGeocodeErrorGeneration(token.generation);
        setGeocodeError(message);
        onSelectionStateChange?.({ status: "error", message, token });
      },
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    forwardRequestIdRef.current += 1;
    geocodeMutation.reset();
    lastGeocodeAddressRef.current = null;
    setActiveForwardGeneration(null);
    setGeocodeErrorGeneration(null);
    setInput(e.target.value);
    setGeocodeError(null);
    onSelectionStateChange?.({ status: "idle" });
    setIsOpen(true);
  };

  const handleSelect = (prediction: GoongPrediction) => {
    lastGeocodeAddressRef.current = prediction.description;
    setInput(prediction.description);
    setIsOpen(false);
    startForwardGeocode(prediction.description);
  };

  const handleRetryGeocode = () => {
    const address = lastGeocodeAddressRef.current;
    if (address) startForwardGeocode(address);
  };

  const handleClear = () => {
    forwardRequestIdRef.current += 1;
    geocodeMutation.reset();
    lastGeocodeAddressRef.current = null;
    setActiveForwardGeneration(null);
    setGeocodeErrorGeneration(null);
    setInput("");
    setGeocodeError(null);
    onSelectionStateChange?.({ status: "idle" });
    setIsOpen(false);
  };

  const geocoding = geocodeMutation.isPending && activeForwardGeneration === parentGeneration;
  const visibleGeocodeError = geocodeErrorGeneration === parentGeneration ? geocodeError : null;
  const rawQuery = input.trim();
  const isDebouncing = rawQuery !== debouncedInput;
  const loading = isDebouncing || queryFetching;
  const hasCurrentResults = rawQuery === debouncedInput && debouncedInput.length >= 2;

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

      {isOpen && hasCurrentResults && !queryError && predictions.length > 0 && (
        <ul className="mt-1 bg-white shadow-lg max-h-48 rounded-xl overflow-auto border border-gray-100 divide-y divide-gray-50">
          {predictions.map((p) => (
            <li key={p.place_id}>
              <button
                type="button"
                onClick={() => handleSelect(p)}
                className="relative min-h-11 w-full cursor-pointer select-none py-2.5 pl-9 pr-3 text-left transition-colors hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600"
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
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && hasCurrentResults && queryError && !loading && (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          <span>Không thể tìm địa chỉ lúc này.</span>
          <button type="button" onClick={() => void refetch()} className="min-h-9 rounded-lg border border-red-200 bg-white px-2.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
            Thử lại
          </button>
        </div>
      )}

      {isOpen && hasCurrentResults && !queryError && !loading && predictions.length === 0 && (
        <div className="mt-1 bg-white shadow-lg rounded-xl border border-gray-100 p-3 text-center text-xs text-gray-500">
          Không tìm thấy địa chỉ phù hợp
        </div>
      )}
      {visibleGeocodeError && (
        <div role="alert" className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium text-red-700">
          <span>{visibleGeocodeError}</span>
          <button type="button" onClick={handleRetryGeocode} className="min-h-9 shrink-0 rounded-lg border border-red-200 bg-white px-2.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
}
