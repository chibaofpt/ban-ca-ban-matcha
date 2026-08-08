import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
  it("từ chối và gỡ listener khi MapLibre không phát load hoặc error", async () => {
    vi.useFakeTimers();
    const once = vi.fn();
    const off = vi.fn();
    const map = { once, off } as unknown as MapLibreMap;

    const loading = waitForMapInitialLoad(map, 1_000);
    const rejection = expect(loading).rejects.toThrow("Map style load timed out");
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
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
