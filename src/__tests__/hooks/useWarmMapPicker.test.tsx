import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAP_PICKER_WARM_TTL_MS,
  useWarmMapPicker,
} from "@/src/hooks/useWarmMapPicker";

afterEach(() => {
  vi.useRealTimers();
});

describe("useWarmMapPicker — giữ renderer có thời hạn", () => {
  it("giữ mounted khi đóng và mở lại trước 45 giây mà không tạo phiên mới", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWarmMapPicker());

    act(() => result.current.open());
    expect(result.current).toMatchObject({ isMounted: true, isVisible: true });

    act(() => result.current.close());
    expect(result.current).toMatchObject({ isMounted: true, isVisible: false });

    act(() => {
      vi.advanceTimersByTime(MAP_PICKER_WARM_TTL_MS - 1);
      result.current.open();
      vi.advanceTimersByTime(MAP_PICKER_WARM_TTL_MS);
    });

    expect(result.current).toMatchObject({ isMounted: true, isVisible: true });
  });

  it("unmount renderer khi hết TTL sau lúc đóng", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWarmMapPicker());

    act(() => result.current.open());
    act(() => result.current.close());
    act(() => vi.advanceTimersByTime(MAP_PICKER_WARM_TTL_MS));

    expect(result.current).toMatchObject({ isMounted: false, isVisible: false });
  });

  it("destroy ngay sau khi xác nhận thay vì tiếp tục giữ GPU context", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWarmMapPicker());

    act(() => result.current.open());
    act(() => result.current.destroy());

    expect(result.current).toMatchObject({ isMounted: false, isVisible: false });
  });
});
