import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalBottomCTA } from "@/src/components/shared/product-modal/ModalBottomCTA";

afterEach(cleanup);

const renderCta = (isEditing = false, ctaLabel?: string) => render(
  <ModalBottomCTA
    totalCost={45000}
    quantity={1}
    setQuantity={vi.fn()}
    hideQuantityPicker={false}
    handleAddToCart={vi.fn()}
    isEditing={isEditing}
    ctaLabel={ctaLabel}
  />,
);

describe("ProductModal — CTA", () => {
  it("hiển thị nhãn thêm mới với hyphen và tổng giá", () => {
    renderCta();
    expect(screen.getByRole("button", { name: "Bỏ vào giỏ cá - 45 ká" })).toBeTruthy();
  });

  it("hiển thị nhãn edit chính xác", () => {
    renderCta(true);
    expect(screen.getByRole("button", { name: "Cập nhật - 45 ká" })).toBeTruthy();
  });

  it("giữ nhãn bundle và ghép tổng giá", () => {
    renderCta(false, "Chọn món này");
    expect(screen.getByRole("button", { name: "Chọn món này - 45 ká" })).toBeTruthy();
  });
});
