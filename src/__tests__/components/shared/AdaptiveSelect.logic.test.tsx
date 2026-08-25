import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdaptiveSelect } from "@/src/components/shared/AdaptiveSelect";

function mockDesktop(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: "(min-width: 768px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderSelect() {
  render(
    <AdaptiveSelect
      label="Món qualifier"
      options={[
        { value: "matcha-latte", label: "Matcha Latte" },
        { value: "strawberry-matcha", label: "Strawberry Matcha" },
      ]}
      value={[]}
      multiple
      onChange={vi.fn()}
      searchPlaceholder="Tìm món"
    />,
  );
}

describe("AdaptiveSelect — bàn phím khi chọn món", () => {
  afterEach(cleanup);

  it("mobile mở danh sách nhưng chưa tự focus ô tìm kiếm", () => {
    mockDesktop(false);
    renderSelect();

    fireEvent.click(screen.getByRole("button", { name: "Món qualifier" }));

    const searchInput = screen.getByRole("textbox", { name: "Tìm món" });
    expect(document.activeElement).not.toBe(searchInput);

    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);
  });

  it("desktop vẫn tự focus ô tìm kiếm khi mở", () => {
    mockDesktop(true);
    renderSelect();

    fireEvent.click(screen.getByRole("button", { name: "Món qualifier" }));

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Tìm món" }));
  });
});
