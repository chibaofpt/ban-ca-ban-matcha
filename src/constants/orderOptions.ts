import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";

/** Sweetness picker options. Default is HALF. */
export const SWEETNESS_OPTIONS: { label: string; value: SweetnessLevel }[] = [
  { label: "Lạt", value: "NONE" },
  { label: "Ít ngọt", value: "QUARTER" },
  { label: "Vừa", value: "HALF" },
  { label: "Ngọt", value: "THREE_QUARTER" },
  { label: "Rất ngọt", value: "FULL" },
];

/**
 * Ice option picker — 3 visible options.
 * NORMAL is the default and hidden in UI (sent automatically).
 */
export const ICE_OPTIONS: { label: string; value: IceOption }[] = [
  { label: "Ít đá", value: "LESS_ICE" },
  { label: "Không đá", value: "NO_ICE" },
  { label: "Đá riêng", value: "SEPARATE_ICE" },
];

/** Display labels for size picker. */
export const SIZE_LABELS: Record<"M" | "L" | "XL", string> = {
  M: "Cá Con",
  L: "Cá Vừa",
  XL: "Cá Lớn",
};
