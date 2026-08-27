import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalHistory } from "@/src/components/shared/product-modal/useModalHistory";

describe("ProductModal — lịch sử trình duyệt", () => {
  beforeEach(() => {
    window.history.replaceState({}, "");
    vi.spyOn(window.history, "pushState");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("không push thêm entry khi callback đổi identity", () => {
    const firstClose = vi.fn();
    const { rerender } = renderHook(({ onClose }) => useModalHistory(onClose), {
      initialProps: { onClose: firstClose },
    });
    rerender({ onClose: vi.fn() });
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
  });

  it("hardware Back đóng một modal đúng một lần", async () => {
    const onClose = vi.fn();
    renderHook(() => useModalHistory(onClose));
    act(() => window.history.back());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("programmatic close gọi callback đúng một lần", async () => {
    const onClose = vi.fn();
    const modal = renderHook(() => useModalHistory(onClose));
    act(() => modal.result.current());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.history.state?.productModal).toBeUndefined());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hardware Back chỉ đóng modal trên cùng đúng một lần", async () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    renderHook(() => useModalHistory(parentClose));
    renderHook(() => useModalHistory(childClose));

    act(() => window.history.back());
    await waitFor(() => expect(childClose).toHaveBeenCalledTimes(1));
    expect(parentClose).not.toHaveBeenCalled();
    act(() => window.history.back());
    await waitFor(() => expect(parentClose).toHaveBeenCalledTimes(1));
    expect(childClose).toHaveBeenCalledTimes(1);
  });

  it("destination không có marker chỉ đóng modal trên cùng", () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    renderHook(() => useModalHistory(parentClose));
    renderHook(() => useModalHistory(childClose));
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { unrelated: true } })));
    expect(childClose).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
  });

  it("UI close child không đóng parent khi history.back phát popstate", async () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    renderHook(() => useModalHistory(parentClose));
    const child = renderHook(() => useModalHistory(childClose));

    act(() => child.result.current());
    await waitFor(() => expect(window.history.state?.productModal).not.toBeUndefined());

    expect(childClose).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
  });

  it("StrictMode replay push một entry và Back đóng callback một lần", async () => {
    const onClose = vi.fn();
    renderHook(() => useModalHistory(onClose), { reactStrictMode: true });
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    act(() => window.history.back());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
