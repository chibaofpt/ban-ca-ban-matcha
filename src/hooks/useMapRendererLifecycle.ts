"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  createMapRenderer,
  isMapRendererAbortError,
  MapRendererLoadError,
  type MapCenter,
  type MapRenderer,
  type MapRendererDiagnostic,
} from "@/src/lib/map/mapRenderer";
import {
  getMapLoadDurationBucket,
  recordMapRendererDiagnostic,
} from "@/src/lib/observability";

export type MapRendererStatus = "loading" | "degraded" | "ready" | "unavailable";

interface UseMapRendererLifecycleOptions {
  containerRef: RefObject<HTMLElement | null>;
  deliveryRadiusKm: number;
  initialCenter: MapCenter;
  onMoveEnd: (center: MapCenter) => void;
  softTimeoutMs?: number;
  tileKey?: string;
}

interface MapRendererLifecycle {
  flyTo: (center: MapCenter, queueIfLoading?: boolean) => boolean;
  hadQueuedCenter: boolean;
  status: MapRendererStatus;
}

const DEFAULT_SOFT_TIMEOUT_MS = 12_000;

function reportDiagnostic(
  diagnostic: MapRendererDiagnostic,
  startedAt: number,
): void {
  recordMapRendererDiagnostic({
    ...diagnostic,
    durationBucket: getMapLoadDurationBucket(Date.now() - startedAt),
    fallback: "search",
    renderer: "maplibre",
  });
}

/** Own one abortable MapLibre generation and queue the latest pre-ready center. */
export function useMapRendererLifecycle({
  containerRef,
  deliveryRadiusKm,
  initialCenter,
  onMoveEnd,
  softTimeoutMs = DEFAULT_SOFT_TIMEOUT_MS,
  tileKey,
}: UseMapRendererLifecycleOptions): MapRendererLifecycle {
  const generationRef = useRef(0);
  const onMoveEndRef = useRef(onMoveEnd);
  const ownerRef = useRef<{ generation: number; renderer: MapRenderer } | null>(null);
  const pendingCenterRef = useRef<MapCenter | null>(null);
  const [hadQueuedCenter, setHadQueuedCenter] = useState(false);
  const [status, setStatus] = useState<MapRendererStatus>("loading");
  const initialLat = initialCenter.lat;
  const initialLng = initialCenter.lng;

  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
  }, [onMoveEnd]);

  const flyTo = useCallback((center: MapCenter, queueIfLoading = true): boolean => {
    const owner = ownerRef.current;
    if (owner) {
      owner.renderer.flyTo(center);
      return true;
    }
    if (queueIfLoading) pendingCenterRef.current = center;
    return false;
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    const startedAt = Date.now();
    const container = containerRef.current;
    queueMicrotask(() => {
      if (generationRef.current === generation && !controller.signal.aborted) {
        setStatus("loading");
        setHadQueuedCenter(false);
      }
    });

    if (!container || !tileKey) {
      queueMicrotask(() => {
        if (generationRef.current === generation && !controller.signal.aborted) {
          setStatus("unavailable");
        }
      });
      reportDiagnostic(
        { category: "missing_key", fatal: true, phase: "config" },
        startedAt,
      );
      return () => controller.abort();
    }

    const softTimer = setTimeout(() => {
      if (generationRef.current !== generation || controller.signal.aborted) return;
      setStatus("degraded");
      reportDiagnostic(
        { category: "soft_timeout", fatal: false, phase: "initial_load" },
        startedAt,
      );
    }, softTimeoutMs);

    void createMapRenderer(
      {
        container,
        deliveryRadiusKm,
        initialCenter: { lat: initialLat, lng: initialLng },
        onDiagnostic: (diagnostic) => {
          if (generationRef.current === generation && !controller.signal.aborted) {
            reportDiagnostic(diagnostic, startedAt);
          }
        },
        onMoveEnd: (center) => onMoveEndRef.current(center),
        tileKey,
      },
      controller.signal,
    )
      .then((renderer) => {
        clearTimeout(softTimer);
        if (generationRef.current !== generation || controller.signal.aborted) {
          renderer.destroy();
          return;
        }
        ownerRef.current = { generation, renderer };
        const pendingCenter = pendingCenterRef.current;
        setHadQueuedCenter(pendingCenter !== null);
        if (pendingCenter) {
          pendingCenterRef.current = null;
          renderer.flyTo(pendingCenter);
        }
        setStatus("ready");
      })
      .catch((error: unknown) => {
        clearTimeout(softTimer);
        if (
          generationRef.current !== generation ||
          controller.signal.aborted ||
          isMapRendererAbortError(error)
        ) {
          return;
        }
        const category =
          error instanceof MapRendererLoadError ? error.category : "unknown";
        setStatus("unavailable");
        reportDiagnostic(
          { category, fatal: true, phase: "initial_load" },
          startedAt,
        );
      });

    return () => {
      clearTimeout(softTimer);
      controller.abort();
      const owner = ownerRef.current;
      if (owner?.generation === generation) {
        ownerRef.current = null;
        owner.renderer.destroy();
      }
    };
  }, [
    containerRef,
    deliveryRadiusKm,
    initialLat,
    initialLng,
    softTimeoutMs,
    tileKey,
  ]);

  return { flyTo, hadQueuedCenter, status };
}
