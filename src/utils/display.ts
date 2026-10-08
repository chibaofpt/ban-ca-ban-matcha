import { toLocalPhone } from "@/src/utils/phone";
export { normalizeCustomerSearch } from "@/src/utils/phone";
import type { Size } from "@/src/lib/types/menu";

export type KaRoundingMode = "exact" | "ceil" | "floor";

const SIZE_DISPLAY: Record<Size, { label: string; volume: string }> = {
  SMALL: { label: "Cá con", volume: "360ml" },
  MEDIUM: { label: "Cá vừa", volume: "500ml" },
  LARGE: { label: "Cá Lớn", volume: "700ml" },
};

function formatCompactMoney(vnd: number, mode: KaRoundingMode, unit: string): string {
  const thousands = vnd / 1000;
  const displayed =
    mode === "ceil"
      ? Math.ceil(thousands)
      : mode === "floor"
        ? Math.floor(thousands)
        : thousands;

  return `${displayed.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${unit}`;
}

/** Formats integer VND as compact thousands with the ká suffix. */
export function formatKa(vnd: number, mode: KaRoundingMode = "exact"): string {
  return formatCompactMoney(vnd, mode, "ká");
}

/** Format cart money as ceiling thousands with the ka suffix without changing VND. */
export function formatCartMoney(vnd: number): string {
  return formatCompactMoney(vnd, "ceil", "ká");
}

/** Returns the customer-facing size label used in order views. */
export function formatOrderSize(size: Size | string): string {
  if (size !== "SMALL" && size !== "MEDIUM" && size !== "LARGE") return size;
  const display = SIZE_DISPLAY[size];
  return `${display.label} (${display.volume})`;
}

/** Returns the customer-facing fish label for a size enum. */
export function formatSizeLabel(size: Size | string): string {
  if (size !== "SMALL" && size !== "MEDIUM" && size !== "LARGE") return size;
  return SIZE_DISPLAY[size].label;
}

/** Returns the separate label and volume used by the product size selector. */
export function getSizeDisplay(size: Size): { label: string; volume: string } {
  return SIZE_DISPLAY[size];
}

/** Formats a Vietnamese phone number in the staff-friendly local form. */
export function formatVietnamPhone(phone: string): string {
  const local = toLocalPhone(phone);
  if (local.length !== 10) return phone;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
