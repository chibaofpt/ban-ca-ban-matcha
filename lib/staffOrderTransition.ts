import type { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

/** Validate a staff/admin order transition without performing side effects. */
export function validateStaffOrderTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  role: "STAFF" | "ADMIN",
  orderType: OrderType,
  paymentMethod: PaymentMethod,
): string | null {
  switch (newStatus) {
    case "ADMIN_CONFIRMED":
      if (role !== "ADMIN") return "Only ADMIN can confirm payment";
      if (currentStatus !== "PENDING") {
        return "Can only confirm payment for PENDING orders";
      }
      return null;

    case "STAFF_DONE":
      if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
        return `Order is already ${currentStatus} — no further transitions allowed`;
      }
      if (currentStatus !== "ADMIN_CONFIRMED") {
        return "Order must be ADMIN_CONFIRMED before marking as STAFF_DONE";
      }
      return null;

    case "COMPLETED":
      if (
        currentStatus === "PENDING" &&
        orderType === "COUNTER" &&
        paymentMethod === "BANK_TRANSFER"
      ) {
        return null;
      }
      if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
        return `Order is already ${currentStatus} — no further transitions allowed`;
      }
      if (currentStatus !== "STAFF_DONE") {
        return "Order must be STAFF_DONE before completing — cannot skip steps";
      }
      return null;

    case "CANCELLED":
      if (
        role !== "ADMIN" &&
        !(
          currentStatus === "PENDING" &&
          orderType === "COUNTER" &&
          paymentMethod === "BANK_TRANSFER"
        )
      ) {
        return "Only ADMIN can cancel orders";
      }
      if (currentStatus === "CANCELLED") return "Order is already CANCELLED";
      if (currentStatus === "COMPLETED" && orderType !== "COUNTER") {
        return "Completed online orders cannot be cancelled";
      }
      return null;

    default:
      return `Invalid target status: ${newStatus}`;
  }
}
