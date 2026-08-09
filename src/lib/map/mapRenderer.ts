import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { STORE_LOCATION } from "@/src/constants/storeConfig";

const GOONG_TILE_HOST = "tiles.goong.io";
const GOONG_STYLE_URL = "https://tiles.goong.io/assets/goong_map_web.json";
const HARD_LOAD_TIMEOUT_MS = 30_000;

export type MapRendererFailureCategory =
  | "missing_key"
  | "module_load"
  | "webgl_unavailable"
  | "resource_error"
  | "soft_timeout"
  | "hard_timeout"
  | "unknown";

export type MapRendererPhase = "config" | "initial_load" | "runtime";

export interface MapRendererDiagnostic {
  category: MapRendererFailureCategory;
  fatal: boolean;
  phase: MapRendererPhase;
}

export interface MapCenter {
  lat: number;
  lng: number;
}

export interface MapRenderer {
  flyTo(center: MapCenter, zoom?: number): void;
  destroy(): void;
}

export interface MapRendererOptions {
  container: HTMLElement;
  initialCenter: MapCenter;
  tileKey: string;
  deliveryRadiusKm: number;
  onMoveEnd: (center: MapCenter) => void;
  onDiagnostic?: (diagnostic: MapRendererDiagnostic) => void;
}

interface WaitForMapOptions {
  onDiagnostic?: (diagnostic: MapRendererDiagnostic) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface TransformedRequest {
  url: string;
}

interface ResizableMap {
  resize(): void;
}

/** Represent a privacy-safe, typed MapLibre initialization failure. */
export class MapRendererLoadError extends Error {
  readonly category: MapRendererFailureCategory;

  constructor(category: MapRendererFailureCategory) {
    super(`Map renderer failed: ${category}`);
    this.name = "MapRendererLoadError";
    this.category = category;
  }
}

function createAbortError(): Error {
  const error = new Error("Map renderer initialization aborted");
  error.name = "AbortError";
  return error;
}

/** Return whether an unknown failure is the expected lifecycle abort. */
export function isMapRendererAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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

/** Wait for the first style load while treating resource errors as nonfatal diagnostics. */
export function waitForMapInitialLoad(
  map: MapLibreMap,
  options: WaitForMapOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? HARD_LOAD_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeoutId);
      map.off("load", handleLoad);
      map.off("error", handleError);
      options.signal?.removeEventListener("abort", handleAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleLoad = () => finish(resolve);
    const handleError = () => {
      options.onDiagnostic?.({
        category: "resource_error",
        fatal: false,
        phase: "initial_load",
      });
    };
    const handleAbort = () => finish(() => reject(createAbortError()));
    const timeoutId = setTimeout(
      () => finish(() => reject(new MapRendererLoadError("hard_timeout"))),
      timeoutMs,
    );

    map.on("load", handleLoad);
    map.on("error", handleError);
    options.signal?.addEventListener("abort", handleAbort, { once: true });
    if (options.signal?.aborted) handleAbort();
  });
}

/** Schedule a delayed resize and return a cancellation handle for renderer teardown. */
export function scheduleMapResize(map: ResizableMap, delayMs = 300): () => void {
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
    paint: { "line-color": "#22c55e", "line-dasharray": [3, 2], "line-width": 2 },
  });
}

function classifyConstructorError(error: unknown): MapRendererFailureCategory {
  if (!(error instanceof Error)) return "unknown";
  return /webgl|canvas.*context|gpu/i.test(error.message)
    ? "webgl_unavailable"
    : "unknown";
}

/** Lazily initialize the primary MapLibre renderer against Goong's style and tiles. */
export async function createMapRenderer(
  options: MapRendererOptions,
  signal?: AbortSignal,
): Promise<MapRenderer> {
  if (signal?.aborted) throw createAbortError();

  let modules: [typeof import("maplibre-gl"), typeof import("@turf/circle")];
  try {
    modules = await Promise.all([import("maplibre-gl"), import("@turf/circle")]);
  } catch {
    throw new MapRendererLoadError("module_load");
  }
  if (signal?.aborted) throw createAbortError();

  const [{ Map, Marker, NavigationControl }, { default: turfCircle }] = modules;
  let map: MapLibreMap;
  try {
    map = new Map({
      attributionControl: false,
      center: [options.initialCenter.lng, options.initialCenter.lat],
      container: options.container,
      style: GOONG_STYLE_URL,
      transformRequest: createGoongTileTransform(options.tileKey),
      zoom: 14,
    });
  } catch (error: unknown) {
    throw new MapRendererLoadError(classifyConstructorError(error));
  }

  let removed = false;
  const removeOnce = () => {
    if (removed) return;
    removed = true;
    map.remove();
  };

  try {
    await waitForMapInitialLoad(map, { onDiagnostic: options.onDiagnostic, signal });
    if (signal?.aborted) throw createAbortError();
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
  } catch (error: unknown) {
    removeOnce();
    throw error;
  }

  const handleMoveEnd = () => {
    const center = map.getCenter();
    options.onMoveEnd({ lat: center.lat, lng: center.lng });
  };
  const handleRuntimeError = () => {
    options.onDiagnostic?.({ category: "resource_error", fatal: false, phase: "runtime" });
  };
  map.on("moveend", handleMoveEnd);
  map.on("error", handleRuntimeError);
  const cancelResize = scheduleMapResize(map);
  let destroyed = false;

  return {
    flyTo: (center, zoom = 16) => {
      map.flyTo({ center: [center.lng, center.lat], essential: true, speed: 1.2, zoom });
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      cancelResize();
      map.off("moveend", handleMoveEnd);
      map.off("error", handleRuntimeError);
      removeOnce();
    },
  };
}
