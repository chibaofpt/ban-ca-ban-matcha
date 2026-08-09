import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateMapRenderer, mockRecordDiagnostic } = vi.hoisted(() => ({
  mockCreateMapRenderer: vi.fn(),
  mockRecordDiagnostic: vi.fn(),
}));

vi.mock("@/src/lib/map/mapRenderer", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/lib/map/mapRenderer")>();
  return { ...original, createMapRenderer: mockCreateMapRenderer };
});

vi.mock("@/src/lib/observability", () => ({
  getMapLoadDurationBucket: () => "8-15s",
  recordMapRendererDiagnostic: mockRecordDiagnostic,
}));

import { useMapRendererLifecycle } from "@/src/hooks/useMapRendererLifecycle";
import { MapRendererLoadError, type MapRenderer } from "@/src/lib/map/mapRenderer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createRenderer(): MapRenderer {
  return { destroy: vi.fn(), flyTo: vi.fn() };
}

function createOptions(tileKey = "tile-key") {
  const container = document.createElement("div");
  return {
    containerRef: { current: container },
    deliveryRadiusKm: 10,
    initialCenter: { lat: 10.77, lng: 106.7 },
    onMoveEnd: vi.fn(),
    softTimeoutMs: 12_000,
    tileKey,
  };
}

describe("useMapRendererLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("chuyển degraded sau 12 giây nhưng vẫn nhận renderer load muộn", async () => {
    vi.useFakeTimers();
    const pending = deferred<MapRenderer>();
    const renderer = createRenderer();
    mockCreateMapRenderer.mockReturnValue(pending.promise);
    const options = createOptions();
    const { result } = renderHook(() => useMapRendererLifecycle(options));

    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(result.current.status).toBe("degraded");
    expect(renderer.destroy).not.toHaveBeenCalled();

    await act(async () => pending.resolve(renderer));
    expect(result.current.status).toBe("ready");
    expect(mockRecordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ category: "soft_timeout", fatal: false }),
    );
  });

  it("queue vị trí tìm kiếm mới nhất và áp dụng khi renderer ready", async () => {
    const pending = deferred<MapRenderer>();
    const renderer = createRenderer();
    mockCreateMapRenderer.mockReturnValue(pending.promise);
    const options = createOptions();
    const { result } = renderHook(() => useMapRendererLifecycle(options));

    act(() => {
      result.current.flyTo({ lat: 10.8, lng: 106.6 });
      result.current.flyTo({ lat: 10.9, lng: 106.8 });
    });
    await act(async () => pending.resolve(renderer));

    expect(renderer.flyTo).toHaveBeenCalledOnce();
    expect(renderer.flyTo).toHaveBeenCalledWith({ lat: 10.9, lng: 106.8 });
    expect(result.current.hadQueuedCenter).toBe(true);
  });

  it("abort khi unmount và không phát telemetry", () => {
    mockCreateMapRenderer.mockReturnValue(new Promise(() => undefined));
    const options = createOptions();
    const view = renderHook(() => useMapRendererLifecycle(options));
    const signal = mockCreateMapRenderer.mock.calls[0]?.[1] as AbortSignal;

    view.unmount();

    expect(signal.aborted).toBe(true);
    expect(mockRecordDiagnostic).not.toHaveBeenCalled();
  });

  it("chuyển unavailable khi renderer hard timeout", async () => {
    mockCreateMapRenderer.mockRejectedValue(new MapRendererLoadError("hard_timeout"));
    const options = createOptions();
    const { result } = renderHook(() => useMapRendererLifecycle(options));

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(mockRecordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ category: "hard_timeout", fatal: true }),
    );
  });

  it("destroy renderer của generation cũ resolve muộn và không đổi state", async () => {
    const first = deferred<MapRenderer>();
    const second = deferred<MapRenderer>();
    const staleRenderer = createRenderer();
    const currentRenderer = createRenderer();
    mockCreateMapRenderer
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const options = createOptions("first-key");
    const view = renderHook(({ tileKey }) => useMapRendererLifecycle({ ...options, tileKey }), {
      initialProps: { tileKey: "first-key" },
    });

    view.rerender({ tileKey: "second-key" });
    await act(async () => first.resolve(staleRenderer));
    expect(staleRenderer.destroy).toHaveBeenCalledOnce();
    expect(view.result.current.status).toBe("loading");

    await act(async () => second.resolve(currentRenderer));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(currentRenderer.destroy).not.toHaveBeenCalled();
  });
});
