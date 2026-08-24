import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductModal from "@/src/components/shared/ProductModal";
import type { MenuItem } from "@/src/lib/types/menu";

const item: MenuItem = {
  id: "extra-1", name: "Bánh matcha", description: "Bánh mềm", category: "extras",
  unit_price_vnd: 12_000, is_seasonal: false, image_url: "/cake.jpg", sort_order: 1,
  base_liquid_note: null, custom_powder_grams: null, powder: null,
  resolved_default_powder_id: null, allowed_powder_ids: [], sizes: [],
};

function mockViewport(desktop: boolean) {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({
    matches: desktop, media: "(min-width: 768px)", onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) });
}

function renderExtras(onClose = vi.fn(), freeVoucherId?: string) {
  return { onClose, ...render(createElement(ProductModal, {
    item, latteItems: [], milkTypes: [], addonGroups: [], onClose, freeVoucherId,
  })) };
}

describe("ExtrasModal — responsive behavior", () => {
  beforeEach(() => {
    window.history.replaceState({}, "");
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("mobile render dialog có tên, ảnh, Back và CTA cập nhật theo quantity", () => {
    mockViewport(false);
    const { onClose } = renderExtras();
    expect(screen.getByRole("dialog", { name: item.name })).toBeTruthy();
    expect(screen.getByRole("img", { name: item.name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Đóng" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tăng số lượng" }));
    expect(screen.getByRole("button", { name: "Bỏ vào giỏ cá - 24 ká" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("desktop chỉ dùng nút X và giữ accessible dialog", () => {
    mockViewport(true);
    renderExtras();
    expect(screen.getByRole("dialog", { name: item.name })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Quay lại" })).toBeNull();
  });

  it("ITEM voucher khóa quantity và đưa total CTA về 0", () => {
    mockViewport(false);
    renderExtras(vi.fn(), "voucher-1");
    expect((screen.getByRole("button", { name: "Tăng số lượng" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Bỏ vào giỏ cá - 0 ká" })).toBeTruthy();
  });
});
