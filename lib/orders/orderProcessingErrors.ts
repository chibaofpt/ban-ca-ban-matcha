import type { PriceConflict } from "@/lib/orders/orderProcessingTypes";

export class OrderValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export class PriceChangedError extends Error {
  constructor(public readonly conflicts: PriceConflict[]) {
    super("One or more item prices have changed.");
    this.name = "PriceChangedError";
  }
}
