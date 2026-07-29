import type { Size } from "@/src/lib/types/menu";

export type KaRoundingMode = "exact" | "ceil" | "floor";

const SIZE_DISPLAY: Record<Size, { label: string; volume: string }> = {
  SMALL: { label: "Cá con", volume: "360ml" },
  MEDIUM: { label: "Cá vừa", volume: "500ml" },
  LARGE: { label: "Cá lớn", volume: "700ml" },
};

/** Formats integer VND as compact thousands with the ká suffix. */
export function formatKa(vnd: number, mode: KaRoundingMode = "exact"): string {
  const thousands = vnd / 1000;
  const displayed =
    mode === "ceil"
      ? Math.ceil(thousands)
      : mode === "floor"
        ? Math.floor(thousands)
        : thousands;

  return `${displayed.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ká`;
}

/** Returns the customer-facing size label used in order views. */
export function formatOrderSize(size: Size | string): string {
  if (size !== "SMALL" && size !== "MEDIUM" && size !== "LARGE") return size;
  const display = SIZE_DISPLAY[size];
  return `${display.label} (${display.volume})`;
}

/** Returns the separate label and volume used by the product size selector. */
export function getSizeDisplay(size: Size): { label: string; volume: string } {
  return SIZE_DISPLAY[size];
}

/** Normalizes phone-like staff search input to the stored phone suffix. */
export function normalizeCustomerSearch(query: string): string {
  const trimmed = query.trim();
  if (/\p{L}/u.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) return digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 10) return digits.slice(1);
  return digits;
}

/** Formats a Vietnamese phone number in the staff-friendly local form. */
export function formatVietnamPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local =
    digits.startsWith("84") && digits.length === 11
      ? `0${digits.slice(2)}`
      : digits;

  if (local.length !== 10) return phone;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
