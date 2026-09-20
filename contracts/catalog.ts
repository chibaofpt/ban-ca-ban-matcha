import type { Size } from "@/contracts/menu";

export interface PowderSizeConfigEntry {
  size: Size;
  grams: number;
}

export type PowderType = "RECOMMEND" | "NEW" | "SEASONAL" | "NONE";

/** Powder entry returned by public and admin catalog endpoints. */
export interface Powder {
  id: string;
  name: string;
  manufacturer: string | null;
  description: string | null;
  image_url: string | null;
  price_per_gram: number;
  type: PowderType;
  fragrance: number | null;
  body: number | null;
  bitterness: number | null;
  umami: number | null;
  color: number | null;
  is_available: boolean;
  reference_latte_item_id: string | null;
  size_config: PowderSizeConfigEntry[];
}

export interface DefaultPowderGram {
  size: Size;
  grams: number;
}

/** Shape of GET /api/powders response. */
export interface PowderApiResponse {
  data: Powder[];
  default_powder_gram: DefaultPowderGram[];
}

export interface MilkType {
  id: string;
  name: string;
  price_per_ml: number;
  is_default: boolean;
  display_order: number;
}
