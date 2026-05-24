import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usePolling } from "../usePolling";

describe("usePolling", () => {
  beforeEach(() => {
    // Reset document visibility
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should fetch data on mount and set isInitialLoading", async () => {
    const fetcher = vi.fn().mockResolvedValue(["item1", "item2"]);
    
    const { result } = renderHook(() => 
      usePolling({ fetcher, interval: 10000 })
    );

    // Ngay khi mount, isInitialLoading phải là true, chưa có data
    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.data).toBeNull();

    // Chờ fetcher resolve
    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
    });

    expect(result.current.data).toEqual(["item1", "item2"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should background fetch and set isRefreshing without isInitialLoading", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(["item1"]);
    
    const { result } = renderHook(() => 
      usePolling({ fetcher, interval: 10000 })
    );

    // Initial fetch (we use advanceTimersByTimeAsync to flush microtasks without looping)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.isInitialLoading).toBe(false);

    // Set mock for the next background fetch
    fetcher.mockResolvedValue(["item1", "item2"]);

    // Advance timer to trigger interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.data).toEqual(["item1", "item2"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("should reset to isInitialLoading when dependencies change (tab switch / pagination)", async () => {
    const fetcher = vi.fn().mockResolvedValue(["page1"]);
    
    const { result, rerender } = renderHook(
      ({ deps }) => usePolling({ fetcher, interval: 10000, dependencies: deps }),
      { initialProps: { deps: ["page1"] } }
    );

    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
    });

    // Đổi page
    fetcher.mockResolvedValue(["page2"]);
    rerender({ deps: ["page2"] });

    // Thay đổi dependency (giống đổi tab/page) -> phải kích hoạt isInitialLoading
    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.isRefreshing).toBe(false);

    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
    });
    expect(result.current.data).toEqual(["page2"]);
  });

  it("should pause polling when document is hidden", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(["data"]);
    
    renderHook(() => usePolling({ fetcher, interval: 10000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Mock tab bị ẩn (chuyển sang tab facebook)
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Tiến thời gian qua nhiều chu kỳ
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    // Fetcher vẫn chỉ được gọi 1 lần (đã pause)
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Tab được mở lại
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    // Mở lại tab sẽ fetch ngay lập tức 1 lần (isRefreshing = true)
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("manual refetch should update data immediately", async () => {
    const fetcher = vi.fn().mockResolvedValue(["old"]);
    
    const { result } = renderHook(() => usePolling({ fetcher, interval: 10000 }));

    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
    });

    fetcher.mockResolvedValue(["new"]);
    
    act(() => {
      result.current.refetch();
    });

    // refetch thủ công thì không kích hoạt initial load skeleton
    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(true);

    await waitFor(() => {
      expect(result.current.data).toEqual(["new"]);
    });
  });

  it("should respect enabled flag", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(["data"]);
    
    renderHook(() => usePolling({ fetcher, interval: 10000, enabled: false }));

    // Không được gọi lần nào
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(fetcher).not.toHaveBeenCalled();
  });
});
