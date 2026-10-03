import type { ComponentPropsWithoutRef } from "react";
import { formatCartMoney } from "@/src/utils/display";

interface CartMoneyProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  amountVnd: number;
  discount?: boolean;
}

/** Render cart money through the canonical display formatter without changing VND values. */
export function CartMoney({ amountVnd, discount = false, ...props }: CartMoneyProps) {
  return <span {...props}>{discount ? "−" : ""}{formatCartMoney(amountVnd)}</span>;
}
