import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentMethodSelector } from "@/src/components/staff/PaymentMethodSelector";

describe("PaymentMethodSelector — chọn phương thức thanh toán", () => {
  it("hiển thị Tiền mặt và Chuyển khoản với CASH được chọn mặc định", () => {
    render(
      <PaymentMethodSelector
        value="CASH"
        bankTransferDisabled={false}
        onChange={vi.fn()}
      />,
    );

    expect((screen.getByRole("radio", { name: "Tiền mặt" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Chuyển khoản" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText("Phương thức thanh toán")).toBeNull();
  });

  it("gọi onChange khi chọn Chuyển khoản", () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodSelector
        value="CASH"
        bankTransferDisabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Chuyển khoản" }));

    expect(onChange).toHaveBeenCalledWith("BANK_TRANSFER");
  });

  it("khóa Chuyển khoản khi tổng phải trả bằng 0đ", () => {
    render(
      <PaymentMethodSelector
        value="CASH"
        bankTransferDisabled
        onChange={vi.fn()}
      />,
    );

    expect((screen.getByRole("radio", { name: "Chuyển khoản" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByText("Đơn 0đ không cần chuyển khoản")).toBeNull();
  });
});
