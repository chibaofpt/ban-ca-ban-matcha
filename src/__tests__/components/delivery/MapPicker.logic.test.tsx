import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateMapRenderer, mockReverseGeocode } = vi.hoisted(() => ({
  mockCreateMapRenderer: vi.fn(),
  mockReverseGeocode: vi.fn(),
}));

vi.mock("@/src/lib/map/mapRenderer", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/lib/map/mapRenderer")>();
  return { ...original, createMapRenderer: mockCreateMapRenderer };
});

vi.mock("@/src/components/delivery/MapSearchBar", () => ({
  MapSearchBar: ({
    onSelect,
  }: {
    onSelect: (lat: number, lng: number, address: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSelect(10.99, 106.66, "12 Đường gần cửa hàng")}
    >
      Chọn địa chỉ tìm kiếm
    </button>
  ),
}));

vi.mock("@/src/services/deliveryService", () => ({
  deliveryService: { reverseGeocode: mockReverseGeocode },
}));

import { MapPicker } from "@/src/components/delivery/MapPicker";
import type { MapRenderer } from "@/src/lib/map/mapRenderer";

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");

function installGeolocationMock() {
  let successCallback: ((position: GeolocationPosition) => void) | undefined;
  let errorCallback: ((error: GeolocationPositionError) => void) | undefined;
  const getCurrentPosition = vi.fn(
    (
      success: (position: GeolocationPosition) => void,
      error?: (positionError: GeolocationPositionError) => void,
    ) => {
      successCallback = success;
      errorCallback = error;
    },
  );
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  return {
    getSuccess: () => successCallback,
    getError: () => errorCallback,
  };
}

describe("MapPicker — fallback khi renderer không khả dụng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY = "tile-key";
    mockCreateMapRenderer.mockRejectedValue(new Error("style load failed"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (originalGeolocation) {
      Object.defineProperty(navigator, "geolocation", originalGeolocation);
    } else {
      Reflect.deleteProperty(navigator, "geolocation");
    }
    delete process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY;
  });

  it("giữ tìm kiếm địa chỉ hoạt động và cho xác nhận không cần bản đồ", async () => {
    const onConfirm = vi.fn();
    const view = render(<MapPicker onConfirm={onConfirm} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(view.getByText(/bản đồ hiện không khả dụng/i)).toBeTruthy();
    });

    fireEvent.click(view.getByRole("button", { name: "Chọn địa chỉ tìm kiếm" }));
    fireEvent.click(view.getByRole("button", { name: "Xác nhận địa chỉ này" }));

    expect(onConfirm).toHaveBeenCalledWith({
      address: "12 Đường gần cửa hàng",
      lat: 10.99,
      lng: 106.66,
    });
  });

  it("hiện search ngay và cho xác nhận trong lúc renderer còn pending", () => {
    mockCreateMapRenderer.mockReturnValue(new Promise(() => undefined));
    const onConfirm = vi.fn();
    const view = render(<MapPicker onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(view.getByRole("button", { name: "Chọn địa chỉ tìm kiếm" }));
    fireEvent.click(view.getByRole("button", { name: "Xác nhận địa chỉ này" }));

    expect(onConfirm).toHaveBeenCalledWith({
      address: "12 Đường gần cửa hàng",
      lat: 10.99,
      lng: 106.66,
    });
  });

  it("có nút đóng đủ nhãn truy cập khi renderer lỗi", async () => {
    const onClose = vi.fn();
    const view = render(<MapPicker onConfirm={vi.fn()} onClose={onClose} />);

    await waitFor(() => {
      expect(view.getByRole("button", { name: "Đóng bản đồ" })).toBeTruthy();
    });
    fireEvent.click(view.getByRole("button", { name: "Đóng bản đồ" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hiện cảnh báo tải chậm ở 12 giây nhưng chưa chuyển fallback", async () => {
    vi.useFakeTimers();
    mockCreateMapRenderer.mockImplementation(
      () => new Promise(() => undefined),
    );
    const view = render(<MapPicker onConfirm={vi.fn()} onClose={vi.fn()} />);

    expect(view.getByText("Đang tải bản đồ...")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(view.getByText("Bản đồ đang tải chậm, bạn vẫn có thể tìm địa chỉ.")).toBeTruthy();
    expect(view.queryByText("Bản đồ hiện không khả dụng")).toBeNull();
    expect(view.getByRole("button", { name: "Chọn địa chỉ tìm kiếm" })).toBeTruthy();
  });

  it("không destroy renderer vì resource error sau khi load", async () => {
    installGeolocationMock();
    const renderer: MapRenderer = { flyTo: vi.fn(), destroy: vi.fn() };
    let reportResourceError: (() => void) | undefined;
    mockCreateMapRenderer.mockImplementation(
      async (options: {
        onDiagnostic?: (event: {
          category: "resource_error";
          fatal: false;
          phase: "runtime";
        }) => void;
      }) => {
        reportResourceError = () => options.onDiagnostic?.({
          category: "resource_error",
          fatal: false,
          phase: "runtime",
        });
        return renderer;
      },
    );
    const view = render(<MapPicker onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(view.getByLabelText("Dùng vị trí hiện tại")).toBeTruthy());

    act(() => reportResourceError?.());

    expect(renderer.destroy).not.toHaveBeenCalled();
    expect(view.getByLabelText("Dùng vị trí hiện tại")).toBeTruthy();
  });

  it("bỏ qua GPS error đến muộn sau khi MapPicker unmount", async () => {
    const geolocation = installGeolocationMock();
    const renderer: MapRenderer = { flyTo: vi.fn(), destroy: vi.fn() };
    mockCreateMapRenderer.mockResolvedValue(renderer);
    const view = render(<MapPicker onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(view.getByLabelText("Dùng vị trí hiện tại")).toBeTruthy());

    view.unmount();
    act(() => {
      geolocation.getError()?.({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    });

    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(mockReverseGeocode).not.toHaveBeenCalled();
  });
});
