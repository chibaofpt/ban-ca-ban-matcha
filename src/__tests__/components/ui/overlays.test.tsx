import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";

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

describe("Shared overlays", () => {
  beforeEach(() => mockDesktop(true));
  afterEach(cleanup);

  it("ConfirmModal có alertdialog được đặt tên và gọi xác nhận", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen
        title="Xoá mục?"
        message="Thao tác này không thể hoàn tác."
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("alertdialog", { name: "Xoá mục?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("ConfirmModal không dismiss khi đang xử lý", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen
        isLoading
        title="Đang lưu"
        message="Vui lòng chờ."
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ResponsiveOverlay dùng dialog desktop và explicit-only chặn Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <ResponsiveOverlay
        open
        title="Chỉnh hồ sơ"
        description="Cập nhật thông tin"
        dismissPolicy="explicit-only"
        onOpenChange={onOpenChange}
      >
        <p>Nội dung</p>
      </ResponsiveOverlay>,
    );

    const dialog = screen.getByRole("dialog", { name: "Chỉnh hồ sơ" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("ResponsiveOverlay mobile giữ footer trong sheet và chỉ cuộn phần nội dung", () => {
    mockDesktop(false);
    render(
      <ResponsiveOverlay
        open
        title="Form dài"
        footer={<button type="button">Tiếp tục</button>}
        onOpenChange={vi.fn()}
      >
        <p>Nội dung dài</p>
      </ResponsiveOverlay>,
    );

    const dialog = screen.getByRole("dialog", { name: "Form dài" });
    const body = screen.getByText("Nội dung dài").parentElement;
    const footer = screen.getByRole("button", { name: "Tiếp tục" }).closest("footer");

    expect(dialog.className).toContain("flex-col");
    expect(body?.className).toContain("flex-1");
    expect(body?.className).toContain("overflow-y-auto");
    expect(footer?.className).toContain("shrink-0");
  });
});
