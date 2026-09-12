import type { Size } from "@/src/lib/types/menu";
import { formatSizeLabel } from "@/src/utils/display";

interface SizeLabelProps {
  size: Size | string | null | undefined;
}

/** Renders a canonical customer-facing label for a drink size. */
export function SizeLabel({ size }: SizeLabelProps) {
  if (!size) return null;
  return <>{formatSizeLabel(size)}</>;
}
