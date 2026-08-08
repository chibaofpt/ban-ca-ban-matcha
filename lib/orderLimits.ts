/** Maximum server-calculated payable value accepted for one order. */
export const MAX_ORDER_VALUE_VND = 20_000_000;

/** Standard API payload returned when an order exceeds the value ceiling. */
export interface OrderValueViolation {
  error: string;
  code: "BUSINESS_RULE_VIOLATION";
  details: { reason: "ORDER_VALUE_EXCEEDED" };
}

/** Return the order-value business violation, or null when the total is allowed. */
export function getOrderValueViolation(grandTotalVnd: number): OrderValueViolation | null {
  if (grandTotalVnd <= MAX_ORDER_VALUE_VND) return null;
  return {
    error: "Order value exceeds the allowed maximum",
    code: "BUSINESS_RULE_VIOLATION",
    details: { reason: "ORDER_VALUE_EXCEEDED" },
  };
}
