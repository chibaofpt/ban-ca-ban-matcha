"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, LocateFixed, Loader2, AlertTriangle } from "lucide-react";
import { MapSearchBar } from "./MapSearchBar";
import { deliveryService } from "@/src/services/deliveryService";
import { STORE_LOCATION } from "@/src/constants/storeConfig";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";

import { getDistanceKm } from "@/src/utils/distance";
import type { GoongErrorEvent, Map as GoongMap } from "@goongmaps/goong-js";

interface MapPickerProps {
  /** Called when user confirms a location */
  onConfirm: (data: { address: string; lat: number; lng: number }) => void;
  /** Called to close the picker without selecting */
  onClose: () => void;
  /** Initial coordinates (e.g. from a previously saved address) */
  initialLat?: number;
  initialLng?: number;
}

/** Full-screen Grab-style map picker with fixed center pin */
export function MapPicker({ onConfirm, onClose, initialLat, initialLng }: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoongMap | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [address, setAddress] = useState<string>("");
  const [centerLat, setCenterLat] = useState<number>(initialLat ?? STORE_LOCATION.lat);
  const [centerLng, setCenterLng] = useState<number>(initialLng ?? STORE_LOCATION.lng);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isOutOfRange, setIsOutOfRange] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Reverse geocode center position
  const reverseGeocodeCenter = useCallback(async (lat: number, lng: number) => {
    try {
      setIsGeocoding(true);
      const dist = getDistanceKm(lat, lng);
      setIsOutOfRange(dist > DELIVERY_CONFIG.MAX_RADIUS_KM);
      setCenterLat(lat);
      setCenterLng(lng);

      const result = await deliveryService.reverseGeocode(lat, lng);
      setAddress(result.address);
    } catch {
      setAddress("Không thể xác định địa chỉ");
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    let map: GoongMap | undefined;
    let isMounted = true;

    // Intercept console.error and console.warn to silence Goong's missing source layer warnings 
    // which cause Next.js Dev Error Overlay to pop up constantly
    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('poi-tree')) return;
      if (typeof args[0] === 'string' && args[0].includes('composite')) return;
      origError(...args);
    };
    console.warn = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('poi-tree')) return;
      if (typeof args[0] === 'string' && args[0].includes('composite')) return;
      origWarn(...args);
    };

    async function initMap() {
      try {
        const goongjs = await import("@goongmaps/goong-js");
        await import("@goongmaps/goong-js/dist/goong-js.css");

        const turfCircle = (await import("@turf/circle")).default;

        if (!isMounted || !mapContainerRef.current) return;

        const maptileKey = process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY;
        if (!maptileKey) {
          setMapError("Map API key chưa được cấu hình");
          setIsLoading(false);
          return;
        }

        goongjs.default.accessToken = maptileKey;

        const initialCenter: [number, number] = [
          initialLng ?? STORE_LOCATION.lng,
          initialLat ?? STORE_LOCATION.lat,
        ];

        const mapInstance = new goongjs.default.Map({
          container: mapContainerRef.current,
          style: "https://tiles.goong.io/assets/goong_map_web.json",
          center: initialCenter,
          zoom: 14,
          attributionControl: false,
        });

        // Intercept Mapbox internal error events
        mapInstance.on('error', (e: GoongErrorEvent) => {
          if (e && e.error && typeof e.error.message === 'string') {
            if (e.error.message.includes('poi-tree') || e.error.message.includes('composite')) {
              e.preventDefault?.();
              return;
            }
          }
          console.warn("Map error event:", e);
        });

        map = mapInstance;
        mapRef.current = mapInstance;

        mapInstance.on("load", () => {
          if (!isMounted) return;

          // Force resize to fix half-height canvas issue on mobile
          setTimeout(() => {
            if (isMounted) mapInstance.resize();
          }, 300);

          // Draw delivery radius circle
          const circleGeoJSON = turfCircle(
            [STORE_LOCATION.lng, STORE_LOCATION.lat],
            DELIVERY_CONFIG.MAX_RADIUS_KM,
            { steps: 64, units: "kilometers" }
          );

          mapInstance.addSource("delivery-radius", {
            type: "geojson",
            data: circleGeoJSON,
          });

          mapInstance.addLayer({
            id: "delivery-radius-fill",
            type: "fill",
            source: "delivery-radius",
            paint: {
              "fill-color": "#22c55e",
              "fill-opacity": 0.08,
            },
          });

          mapInstance.addLayer({
            id: "delivery-radius-border",
            type: "line",
            source: "delivery-radius",
            paint: {
              "line-color": "#22c55e",
              "line-width": 2,
              "line-dasharray": [3, 2],
            },
          });

          // Add store marker
          const storeEl = document.createElement("div");
          storeEl.innerHTML = "🏪";
          storeEl.style.fontSize = "24px";
          storeEl.style.lineHeight = "1";
          new goongjs.default.Marker({ element: storeEl })
            .setLngLat([STORE_LOCATION.lng, STORE_LOCATION.lat])
            .addTo(mapInstance);

          setIsLoading(false);

          // If no initial position, try GPS
          if (!initialLat && !initialLng) {
            requestGPS(mapInstance);
          } else {
            // Reverse geocode initial position
            reverseGeocodeCenter(initialLat!, initialLng!);
          }
        });

        // On map move end — reverse geocode center
        mapInstance.on("moveend", () => {
          if (!isMounted) return;
          const center = mapInstance.getCenter();
          const lat = center.lat;
          const lng = center.lng;

          // Check out of range immediately (no debounce)
          const dist = getDistanceKm(lat, lng);
          setIsOutOfRange(dist > DELIVERY_CONFIG.MAX_RADIUS_KM);
          setCenterLat(lat);
          setCenterLng(lng);

          // Debounce reverse geocode
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            if (isMounted) reverseGeocodeCenter(lat, lng);
          }, 1000);
        });

        mapInstance.addControl(
          new goongjs.default.NavigationControl({ showCompass: false }),
          "bottom-right"
        );
      } catch (err) {
        console.error("Map init error:", err);
        if (isMounted) {
          setMapError("Không thể tải bản đồ. Vui lòng thử lại.");
          setIsLoading(false);
        }
      }
    }

    function requestGPS(mapInstance: GoongMap) {
      if (!navigator.geolocation) return;

      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isMounted) return;
          const { latitude, longitude } = position.coords;
          mapInstance.flyTo({
            center: [longitude, latitude],
            zoom: 16,
            speed: 1.2,
            essential: true,
          });
          setGpsLoading(false);
          // moveend will trigger reverse geocode
        },
        () => {
          // GPS denied/failed — stay at store location
          if (isMounted) {
            setGpsLoading(false);
            reverseGeocodeCenter(STORE_LOCATION.lat, STORE_LOCATION.lng);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }

    initMap();

    return () => {
      isMounted = false;
      console.error = origError; // restore original console.error
      console.warn = origWarn; // restore original console.warn
      if (debounceRef.current) clearTimeout(debounceRef.current);
      map?.remove();
    };
  }, [initialLat, initialLng, reverseGeocodeCenter]);

  // Handle GPS button press
  const handleGPS = () => {
    if (!navigator.geolocation || !mapRef.current) return;

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        mapRef.current?.flyTo({
          center: [longitude, latitude],
          zoom: 16,
          speed: 1.2,
          essential: true,
        });
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
        setMapError("Không thể truy cập vị trí. Hãy cho phép quyền GPS trong trình duyệt.");
        setTimeout(() => setMapError(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Handle search result
  const handleSearchSelect = (lat: number, lng: number) => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 16,
      speed: 1.2,
      essential: true,
    });
    // moveend will trigger reverse geocode
  };

  const handleConfirm = () => {
    if (isOutOfRange || !address || isGeocoding) return;
    onConfirm({ address, lat: centerLat, lng: centerLng });
  };

  const distKm = getDistanceKm(centerLat, centerLng);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0 bg-white z-20">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <h3 className="font-bold text-gray-900 text-[15px]">Chọn vị trí giao hàng</h3>
      </div>

      {/* Map area */}
      <div className="flex-1 relative min-h-0">
        {/* Map container */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              <span className="text-sm text-gray-500 font-medium">Đang tải bản đồ...</span>
            </div>
          </div>
        )}

        {/* Map error */}
        {mapError && (
          <div className="absolute top-16 left-3 right-3 z-20 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span className="text-xs text-red-700 font-medium">{mapError}</span>
          </div>
        )}

        {/* Search bar */}
        {!isLoading && <MapSearchBar onSelect={handleSearchSelect} />}

        {/* Fixed center pin */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none">
          <div className="flex flex-col items-center">
            <div className="text-3xl drop-shadow-lg" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>
              📍
            </div>
            {/* Pin shadow dot */}
            <div className="w-2 h-2 rounded-full bg-black/20 -mt-1" />
          </div>
        </div>

        {/* GPS button */}
        {!isLoading && (
          <button
            onClick={handleGPS}
            disabled={gpsLoading}
            className="absolute bottom-4 right-3 z-10 w-10 h-10 bg-white border border-gray-200 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Vị trí hiện tại"
          >
            {gpsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-green-600" />
            ) : (
              <LocateFixed className="h-4 w-4 text-green-600" />
            )}
          </button>
        )}

        {/* Out of range warning overlay on map */}
        {isOutOfRange && (
          <div className="absolute bottom-4 left-3 right-16 z-10 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-[11px] text-amber-700 font-medium">
              Ngoài vùng giao hàng ({distKm.toFixed(1)}km / tối đa {DELIVERY_CONFIG.MAX_RADIUS_KM}km)
            </span>
          </div>
        )}
      </div>

      {/* Bottom info panel */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-4 pt-3 pb-4 space-y-3 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.08)]">
        {/* Address display */}
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-base">📍</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Địa chỉ giao hàng</p>
            {isGeocoding ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-green-600" />
                <span className="text-sm text-gray-400">Đang xác định...</span>
              </div>
            ) : (
              <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
                {address || "Kéo bản đồ để chọn vị trí"}
              </p>
            )}
            {!isOutOfRange && address && !isGeocoding && (
              <p className="text-xs text-gray-400 mt-0.5">
                Cách cửa hàng {distKm.toFixed(1)}km
              </p>
            )}
          </div>
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={isOutOfRange || !address || isGeocoding || isLoading}
          className={`w-full py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            isOutOfRange || !address || isGeocoding || isLoading
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-700 shadow-lg active:scale-[0.98]"
          }`}
        >
          {isOutOfRange ? "Ngoài vùng giao hàng" : "Xác nhận vị trí này"}
        </button>
      </div>
    </div>
  );
}
