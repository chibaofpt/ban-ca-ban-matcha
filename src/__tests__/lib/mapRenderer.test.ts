import type { ErrorEvent, Map as MapLibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureMapLibreWorker,
  createGoongTileTransform,
  scheduleMapResize,
  waitForMapInitialLoad,
} from "@/src/lib/map/mapRenderer";

afterEach(() => {
  vi.useRealTimers();
});

describe("Map renderer — giới hạn phạm vi maptiles key", () => {
  it("gắn key vào HTTPS request đến đúng Goong tile host", () => {
    const transform = createGoongTileTransform("tile-secret");

    expect(
      transform("https://tiles.goong.io/assets/goong_map_web.json?language=vi").url,
    ).toBe(
      "https://tiles.goong.io/assets/goong_map_web.json?language=vi&api_key=tile-secret",
    );
  });

  it("không làm rò key sang REST API hoặc host giả mạo", () => {
    const transform = createGoongTileTransform("tile-secret");

    expect(transform("https://rsapi.goong.io/Geocode").url).toBe(
      "https://rsapi.goong.io/Geocode",
    );
    expect(transform("https://tiles.goong.io.evil.test/style.json").url).toBe(
      "https://tiles.goong.io.evil.test/style.json",
    );
    expect(transform("http://tiles.goong.io/style.json").url).toBe(
      "http://tiles.goong.io/style.json",
    );
  });

  it("thay key cũ thay vì tạo query parameter trùng lặp", () => {
    const transform = createGoongTileTransform("new-key");

    expect(
      transform("https://tiles.goong.io/style.json?api_key=old-key").url,
    ).toBe("https://tiles.goong.io/style.json?api_key=new-key");
  });
});

describe("Map renderer — timeout tải ban đầu", () => {
  function createMapEventHarness() {
    const listeners = new Map<string, (event?: unknown) => void>();
    const on = vi.fn((event: string, listener: (payload?: unknown) => void) => {
      listeners.set(event, listener);
    });
    const off = vi.fn((event: string) => {
      listeners.delete(event);
    });
    const map = { on, off } as unknown as MapLibreMap;
    return { listeners, map, off };
  }

  it("chỉ hard-fail sau timeout và gỡ toàn bộ listener", async () => {
    vi.useFakeTimers();
    const { map, off } = createMapEventHarness();

    const loading = waitForMapInitialLoad(map, { timeoutMs: 1_000 });
    const rejection = expect(loading).rejects.toMatchObject({ category: "hard_timeout" });
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(off).toHaveBeenCalledWith("load", expect.any(Function));
    expect(off).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("coi resource error trước load là diagnostic và vẫn cho load thành công", async () => {
    const { listeners, map } = createMapEventHarness();
    const onDiagnostic = vi.fn();
    const loading = waitForMapInitialLoad(map, { timeoutMs: 1_000, onDiagnostic });

    listeners.get("error")?.({
      error: new Error("https://tiles.goong.io/tile.pbf?api_key=secret failed"),
    } satisfies Partial<ErrorEvent>);
    listeners.get("load")?.();

    await expect(loading).resolves.toBeUndefined();
    expect(onDiagnostic).toHaveBeenCalledWith({
      phase: "initial_load",
      category: "resource_error",
      fatal: false,
    });
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain("secret");
  });

  it("abort lifecycle không bị ghi nhận là renderer failure", async () => {
    const { map, off } = createMapEventHarness();
    const controller = new AbortController();
    const onDiagnostic = vi.fn();
    const loading = waitForMapInitialLoad(map, {
      timeoutMs: 1_000,
      signal: controller.signal,
      onDiagnostic,
    });

    controller.abort();

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(onDiagnostic).not.toHaveBeenCalled();
    expect(off).toHaveBeenCalledWith("load", expect.any(Function));
    expect(off).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("không resize sau khi lifecycle đã bị huỷ", async () => {
    vi.useFakeTimers();
    const resize = vi.fn();
    const cancelResize = scheduleMapResize({ resize }, 300);

    cancelResize();
    await vi.advanceTimersByTimeAsync(300);

    expect(resize).not.toHaveBeenCalled();
  });
});

describe("Map renderer — worker module", () => {
  it("cấu hình worker URL trước khi MapLibre khởi tạo renderer", () => {
    const setWorkerUrl = vi.fn();

    configureMapLibreWorker(setWorkerUrl);

    expect(setWorkerUrl).toHaveBeenCalledTimes(1);
    expect(setWorkerUrl).toHaveBeenCalledWith(
      expect.stringMatching(/maplibre-gl-worker\.mjs$/),
    );
  });
});
