import "maplibre-gl/dist/maplibre-gl.css";
import type { ErrorEvent, Map as MapLibreMap } from "maplibre-gl";
import { STORE_LOCATION } from "@/src/constants/storeConfig";

const GOONG_TILE_HOST = "tiles.goong.io";
const GOONG_STYLE_URL = "https://tiles.goong.io/assets/goong_map_web.json";
const INITIAL_LOAD_TIMEOUT_MS = 12_000;

export interface MapCenter {
  lat: number;
  lng: number;
}

export interface MapRenderer {
  flyTo(center: MapCenter, zoom?: number): void;
  destroy(): void;
}

interface MapRendererOptions {
  container: HTMLElement;
  initialCenter: MapCenter;
  tileKey: string;
  deliveryRadiusKm: number;
  onMoveEnd: (center: MapCenter) => void;
  onError: (error: Error) => void;
}

interface TransformedRequest {
  url: string;
}

interface ResizableMap {
  resize(): void;
}

/** Create a request transformer that exposes the maptiles key only to Goong's HTTPS tile host. */
export function createGoongTileTransform(
  tileKey: string,
): (url: string) => TransformedRequest {
  return (url: string) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== GOONG_TILE_HOST) {
        return { url };
      }

      parsedUrl.searchParams.set("api_key", tileKey);
      return { url: parsedUrl.toString() };
    } catch {
      return { url };
    }
  };
}

/** Wait for the first map style load, rejecting after a bounded timeout. */
export function waitForMapInitialLoad(
  map: MapLibreMap,
  timeoutMs = INITIAL_LOAD_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      map.off("load", handleLoad);
      map.off("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.error?.message ?? "Map style failed to load"));
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Map style load timed out"));
    }, timeoutMs);

    map.once("load", handleLoad);
    map.once("error", handleError);
  });
}

/** Schedule a delayed resize and return a cancellation handle for renderer teardown. */
export function scheduleMapResize(
  map: ResizableMap,
  delayMs = 300,
): () => void {
  let active = true;
  const timerId = setTimeout(() => {
    if (active) map.resize();
  }, delayMs);

  return () => {
    active = false;
    clearTimeout(timerId);
  };
}

function addDeliveryOverlay(
  map: MapLibreMap,
  circleData: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): void {
  map.addSource("delivery-radius", { type: "geojson", data: circleData });
  map.addLayer({
    id: "delivery-radius-fill",
    type: "fill",
    source: "delivery-radius",
    paint: { "fill-color": "#22c55e", "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "delivery-radius-border",
    type: "line",
    source: "delivery-radius",
    paint: {
      "line-color": "#22c55e",
      "line-width": 2,
      "line-dasharray": [3, 2],
    },
  });
}

/** Lazily initialize the primary MapLibre renderer against Goong's existing style and tiles. */
export async function createMapRenderer(
  options: MapRendererOptions,
): Promise<MapRenderer> {
  const [{ Map, Marker, NavigationControl }, { default: turfCircle }] =
    await Promise.all([import("maplibre-gl"), import("@turf/circle")]);
  const map = new Map({
    container: options.container,
    style: GOONG_STYLE_URL,
    center: [options.initialCenter.lng, options.initialCenter.lat],
    zoom: 14,
    attributionControl: false,
    transformRequest: createGoongTileTransform(options.tileKey),
  });

  try {
    await waitForMapInitialLoad(map);
    const circleData = turfCircle(
      [STORE_LOCATION.lng, STORE_LOCATION.lat],
      options.deliveryRadiusKm,
      { steps: 64, units: "kilometers" },
    );
    addDeliveryOverlay(map, circleData);

    const storeMarker = document.createElement("div");
    storeMarker.className =
      "h-4 w-4 rounded-full border-2 border-white bg-green-600 shadow-md";
    storeMarker.setAttribute("aria-hidden", "true");
    new Marker({ element: storeMarker })
      .setLngLat([STORE_LOCATION.lng, STORE_LOCATION.lat])
      .addTo(map);

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.on("moveend", () => {
      const center = map.getCenter();
      options.onMoveEnd({ lat: center.lat, lng: center.lng });
    });
    map.on("error", (event: ErrorEvent) => {
      options.onError(new Error(event.error?.message ?? "Map renderer failed"));
    });
  } catch (error: unknown) {
    map.remove();
    throw error;
  }

  const cancelResize = scheduleMapResize(map);
  let destroyed = false;

  return {
    flyTo: (center, zoom = 16) => {
      map.flyTo({ center: [center.lng, center.lat], zoom, speed: 1.2, essential: true });
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      cancelResize();
      map.remove();
    },
  };
}
