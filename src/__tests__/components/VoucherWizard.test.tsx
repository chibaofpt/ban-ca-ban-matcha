import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoucherWizard } from "@/src/components/admin/VoucherWizard";

function mockDesktop() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: true,
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

const commonProps = {
  open: true,
  onOpenChange: vi.fn(),
  menuOptions: [],
  bundleMenuItems: [],
  addonOptions: [],
  powderOptions: [],
  milkOptions: [],
  menuPriceById: new Map<string, number>(),
  addonPriceById: new Map<string, number>(),
  submitting: false,
  onSubmit: vi.fn(),
};

describe("VoucherWizard — tiêu đề theo loại voucher", () => {
  beforeEach(mockDesktop);
  afterEach(cleanup);

  it.each([
    ["Giảm hóa đơn: Giảm phần trăm hoặc số tiền", "Tạo voucher giảm hóa đơn"],
    ["Giảm theo món: Giảm cố định hoặc trả giá size khác", "Tạo voucher giảm giá món"],
    ["Freeship: Hỗ trợ phí giao hàng", "Tạo voucher miễn phí giao hàng"],
    ["Tặng ly: Miễn giá một cấu hình sản phẩm", "Tạo voucher tặng ly"],
    ["Tặng món lẻ: Miễn giá một món bán lẻ cố định", "Tạo voucher tặng món lẻ"],
    ["Tặng topping: Miễn giá một addon", "Tạo voucher tặng topping"],
    ["Mua X tặng Y: Tặng món hoặc addon theo nhóm điều kiện", "Tạo voucher mua món tặng món"],
  ])("chọn %s thì bước 2 hiển thị %s", (buttonName, expectedTitle) => {
    render(<VoucherWizard {...commonProps} />);

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(screen.getByRole("dialog", { name: expectedTitle })).toBeTruthy();
  });
});
