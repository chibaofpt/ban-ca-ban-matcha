import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockMapMount, mockMapUnmount } = vi.hoisted(() => ({
  mockMapMount: vi.fn(),
  mockMapUnmount: vi.fn(),
}));

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: () =>
      function MockMapPicker({ onClose }: { onClose: () => void }) {
        React.useEffect(() => {
          mockMapMount();
          return () => mockMapUnmount();
        }, []);
        return React.createElement(
          "button",
          { "data-testid": "mock-map-picker", onClick: onClose, type: "button" },
          "Đóng bản đồ giả lập",
        );
      },
  };
});

import { AddressForm } from "@/src/components/address/AddressForm";
import { MAP_PICKER_WARM_TTL_MS } from "@/src/hooks/useWarmMapPicker";

describe("AddressForm — giữ ấm bản đồ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("dùng lại cùng MapPicker khi mở lại trước TTL và unmount sau TTL", () => {
    const view = render(
      <AddressForm onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(view.getByRole("button", { name: /chọn trên bản đồ/i }));
    expect(mockMapMount).toHaveBeenCalledOnce();

    fireEvent.click(view.getByTestId("mock-map-picker"));
    expect(view.getByTestId("mock-map-picker").parentElement?.className).toContain(
      "invisible",
    );
    expect(mockMapUnmount).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: /chọn trên bản đồ/i }));
    expect(mockMapMount).toHaveBeenCalledOnce();

    fireEvent.click(view.getByTestId("mock-map-picker"));
    act(() => vi.advanceTimersByTime(MAP_PICKER_WARM_TTL_MS));

    expect(view.queryByTestId("mock-map-picker")).toBeNull();
    expect(mockMapUnmount).toHaveBeenCalledOnce();
  });
});
