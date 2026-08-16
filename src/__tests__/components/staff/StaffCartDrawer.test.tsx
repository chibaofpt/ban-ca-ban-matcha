import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffCartDrawer } from "@/src/components/staff/StaffCartDrawer";

describe("StaffCartDrawer — chiều cao theo số lượng item", () => {
  it("fit-content với ít item và chỉ giới hạn ở full viewport", () => {
    render(
      <StaffCartDrawer
        isOpen
        cart={[]}
        discountVoucher={null}
        customerInfo={null}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onChangeQuantity={vi.fn()}
        onCheckout={vi.fn()}
        onOpenCustomerSelect={vi.fn()}
        onClearCustomer={vi.fn()}
      />,
    );

    const sheet = screen.getByTestId("staff-cart-sheet");
    const items = screen.getByTestId("staff-cart-items");
    expect(sheet.className).toContain("h-auto");
    expect(sheet.className).toContain("max-h-[100dvh]");
    expect(items.className).toContain("flex-[0_1_auto]");
  });
});
