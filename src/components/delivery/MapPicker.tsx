"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, LocateFixed, MapPin } from "lucide-react";
import { MapSearchBar } from "./MapSearchBar";
import { STORE_LOCATION } from "@/src/constants/storeConfig";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";
import { useMapRendererLifecycle } from "@/src/hooks/useMapRendererLifecycle";
import { deliveryService } from "@/src/services/deliveryService";
import { getDistanceKm } from "@/src/utils/distance";

interface MapPickerProps {
  onConfirm: (data: { address: string; lat: number; lng: number }) => void;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
}

/** Let customers choose a delivery location while the map loads independently. */
export function MapPicker({ onConfirm, onClose, initialLat, initialLng }: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const readyHandledRef = useRef(false);
  const userSelectedRef = useRef(false);
  const [address, setAddress] = useState("");
  const [centerLat, setCenterLat] = useState(initialLat ?? STORE_LOCATION.lat);
  const [centerLng, setCenterLng] = useState(initialLng ?? STORE_LOCATION.lng);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isOutOfRange, setIsOutOfRange] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const setSelectedLocation = useCallback(
    (lat: number, lng: number, selectedAddress?: string) => {
      setCenterLat(lat);
      setCenterLng(lng);
      setIsOutOfRange(getDistanceKm(lat, lng) > DELIVERY_CONFIG.MAX_RADIUS_KM);
      if (selectedAddress !== undefined) setAddress(selectedAddress);
    },
    [],
  );

  const reverseGeocodeCenter = useCallback(
    async (lat: number, lng: number) => {
      setSelectedLocation(lat, lng);
      setIsGeocoding(true);
      try {
        const result = await deliveryService.reverseGeocode(lat, lng);
        if (aliveRef.current) setAddress(result.address);
      } catch {
        if (aliveRef.current) {
          setAddress("");
          setMapError("Không thể xác định địa chỉ tại vị trí này.");
        }
      } finally {
        if (aliveRef.current) setIsGeocoding(false);
      }
    },
    [setSelectedLocation],
  );

  const handleMapMoveEnd = useCallback(
    ({ lat, lng }: { lat: number; lng: number }) => {
      if (!aliveRef.current) return;
      setSelectedLocation(lat, lng);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (aliveRef.current) void reverseGeocodeCenter(lat, lng);
      }, 1_000);
    },
    [reverseGeocodeCenter, setSelectedLocation],
  );

  const { flyTo, hadQueuedCenter, status: rendererStatus } = useMapRendererLifecycle({
    containerRef: mapContainerRef,
    deliveryRadiusKm: DELIVERY_CONFIG.MAX_RADIUS_KM,
    initialCenter: {
      lat: initialLat ?? STORE_LOCATION.lat,
      lng: initialLng ?? STORE_LOCATION.lng,
    },
    onMoveEnd: handleMapMoveEnd,
    tileKey: process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY,
  });

  const requestGps = useCallback(
    (fallBackToStore: boolean) => {
      if (!navigator.geolocation) return;
      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (!aliveRef.current || (fallBackToStore && userSelectedRef.current)) return;
          if (flyTo({ lat: coords.latitude, lng: coords.longitude }, false)) {
            setGpsLoading(false);
          }
        },
        () => {
          if (!aliveRef.current || (fallBackToStore && userSelectedRef.current)) return;
          setGpsLoading(false);
          if (fallBackToStore) {
            void reverseGeocodeCenter(STORE_LOCATION.lat, STORE_LOCATION.lng);
          } else {
            setMapError("Không thể truy cập vị trí. Hãy kiểm tra quyền GPS của trình duyệt.");
          }
        },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
      );
    },
    [flyTo, reverseGeocodeCenter],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (rendererStatus !== "ready" || readyHandledRef.current) return;
    readyHandledRef.current = true;
    setMapError(null);
    if (hadQueuedCenter || userSelectedRef.current) return;
    if (initialLat !== undefined && initialLng !== undefined) {
      void reverseGeocodeCenter(initialLat, initialLng);
    } else {
      requestGps(true);
    }
  }, [
    hadQueuedCenter,
    initialLat,
    initialLng,
    rendererStatus,
    requestGps,
    reverseGeocodeCenter,
  ]);

  const handleSearchSelect = (lat: number, lng: number, selectedAddress: string) => {
    userSelectedRef.current = true;
    setGpsLoading(false);
    setSelectedLocation(lat, lng, selectedAddress);
    flyTo({ lat, lng });
  };

  const handleConfirm = () => {
    if (!isOutOfRange && address && !isGeocoding) {
      onConfirm({ address, lat: centerLat, lng: centerLng });
    }
  };

  const isLoading = rendererStatus === "loading";
  const isRendererReady = rendererStatus === "ready";
  const distKm = getDistanceKm(centerLat, centerLng);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <header className="z-20 flex shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bản đồ"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        >
          <ArrowLeft className="h-4 w-4 text-gray-700" />
        </button>
        <h3 className="text-[15px] font-bold text-gray-900">Chọn vị trí giao hàng</h3>
      </header>

      <main className="relative min-h-0 flex-1">
        <div ref={mapContainerRef} className="h-full w-full" />
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center bg-gray-100">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              <span className="text-sm font-medium text-gray-600">Đang tải bản đồ...</span>
            </div>
          </div>
        )}

        {rendererStatus === "degraded" && (
          <div className="pointer-events-none absolute left-3 right-3 top-32 z-20 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-sm">
            Bản đồ đang tải chậm, bạn vẫn có thể tìm địa chỉ.
          </div>
        )}

        {rendererStatus === "unavailable" && (
          <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center bg-gray-50 px-6 pt-16 text-center">
            <div className="max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-600" />
              <p className="text-sm font-semibold text-amber-900">Bản đồ hiện không khả dụng</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                Nhập và chọn địa chỉ ở ô tìm kiếm để tiếp tục mà không cần bản đồ.
              </p>
            </div>
          </div>
        )}

        <MapSearchBar onSelect={handleSearchSelect} />

        {isRendererReady && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
              <MapPin className="h-9 w-9 fill-green-600 text-white drop-shadow-lg" />
            </div>
            <button
              type="button"
              onClick={() => requestGps(false)}
              disabled={gpsLoading}
              aria-label="Dùng vị trí hiện tại"
              className="absolute bottom-4 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 disabled:opacity-50"
            >
              {gpsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-green-600" />
              ) : (
                <LocateFixed className="h-4 w-4 text-green-600" />
              )}
            </button>
          </>
        )}

        {mapError && isRendererReady && (
          <div className="absolute left-3 right-16 top-16 z-20 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{mapError}</span>
          </div>
        )}
      </main>

      <footer className="shrink-0 space-y-3 border-t border-gray-100 bg-white px-4 pb-4 pt-3 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.08)]">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50">
            <MapPin className="h-4 w-4 text-green-700" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">Địa chỉ giao hàng</p>
            {isGeocoding ? (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xác định...
              </p>
            ) : (
              <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">
                {address || "Tìm kiếm địa chỉ để chọn vị trí"}
              </p>
            )}
            {isOutOfRange && (
              <p className="mt-1 text-xs font-medium text-amber-700">
                Ngoài vùng giao hàng ({distKm.toFixed(1)}km / tối đa {DELIVERY_CONFIG.MAX_RADIUS_KM}km)
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isOutOfRange || !address || isGeocoding}
          className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-green-600 px-4 text-sm font-bold text-white transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          {isOutOfRange ? "Ngoài vùng giao hàng" : "Xác nhận địa chỉ này"}
        </button>
      </footer>
    </div>
  );
}
