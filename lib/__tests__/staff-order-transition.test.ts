import { describe, expect, it } from "vitest";
import { validateStaffOrderTransition } from "@/lib/staffOrderTransition";

describe("quy tắc chuyển trạng thái đơn staff", () => {
  it("giữ nguyên luồng online: chỉ Admin xác nhận PENDING", () => {
    expect(
      validateStaffOrderTransition(
        "PENDING",
        "ADMIN_CONFIRMED",
        "ADMIN",
        "PICKUP",
        "BANK_TRANSFER",
      ),
    ).toBeNull();
    expect(
      validateStaffOrderTransition(
        "PENDING",
        "ADMIN_CONFIRMED",
        "STAFF",
        "PICKUP",
        "BANK_TRANSFER",
      ),
    ).toBe("Only ADMIN can confirm payment");
  });

  it("giữ nguyên luồng online từ ADMIN_CONFIRMED đến COMPLETED", () => {
    expect(
      validateStaffOrderTransition(
        "ADMIN_CONFIRMED",
        "STAFF_DONE",
        "STAFF",
        "PICKUP",
        "BANK_TRANSFER",
      ),
    ).toBeNull();
    expect(
      validateStaffOrderTransition(
        "STAFF_DONE",
        "COMPLETED",
        "STAFF",
        "PICKUP",
        "BANK_TRANSFER",
      ),
    ).toBeNull();
  });

  it("cho phép hoàn tất trực tiếp chuyển khoản tại quầy đang PENDING", () => {
    expect(
      validateStaffOrderTransition(
        "PENDING",
        "COMPLETED",
        "STAFF",
        "COUNTER",
        "BANK_TRANSFER",
      ),
    ).toBeNull();
  });

  it("không mở transition trực tiếp cho tiền mặt tại quầy", () => {
    expect(
      validateStaffOrderTransition(
        "PENDING",
        "COMPLETED",
        "STAFF",
        "COUNTER",
        "CASH",
      ),
    ).toBe("Order must be STAFF_DONE before completing — cannot skip steps");
  });

  it("Staff chỉ được đi vào nhánh huỷ dành cho chuyển khoản tại quầy", () => {
    expect(
      validateStaffOrderTransition(
        "PENDING",
        "CANCELLED",
        "STAFF",
        "COUNTER",
        "BANK_TRANSFER",
      ),
    ).toBeNull();
    expect(
      validateStaffOrderTransition(
        "PENDING",
        "CANCELLED",
        "STAFF",
        "PICKUP",
        "BANK_TRANSFER",
      ),
    ).toBe("Only ADMIN can cancel orders");
  });

  it("không cho Admin huỷ đơn online đã COMPLETED", () => {
    expect(
      validateStaffOrderTransition(
        "COMPLETED",
        "CANCELLED",
        "ADMIN",
        "DELIVERY",
        "BANK_TRANSFER",
      ),
    ).toBe("Completed online orders cannot be cancelled");
  });
});
