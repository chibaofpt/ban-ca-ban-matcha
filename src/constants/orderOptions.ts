import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";

/** Sweetness picker options. Default is FULL. */
export const SWEETNESS_OPTIONS: { label: string; value: SweetnessLevel }[] = [
  { label: "0%", value: "NONE" },
  { label: "25%", value: "QUARTER" },
  { label: "50%", value: "HALF" },
  { label: "75%", value: "THREE_QUARTER" },
  { label: "100%", value: "FULL" },
  { label: "120%", value: "EXTRA" },
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
