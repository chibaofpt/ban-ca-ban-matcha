/** Full powder entry — used by GET /api/powders and powderStore. */
export interface PowderSizeConfigEntry {
  size: "SMALL" | "MEDIUM" | "LARGE";
  grams: number;
}

export type PowderType = "RECOMMEND" | "NEW" | "SEASONAL" | "NONE";

export interface Powder {
  id: string;
  name: string;
  manufacturer: string | null;
  description: string | null;
  price_per_gram: number;
  type: PowderType;
  /** Flavour profile scores 1–5; null if not set. */
  fragrance: number | null;
  body: number | null;
  bitterness: number | null;
  umami: number | null;
  color: number | null;
  is_available: boolean;
  reference_latte_item_id: string | null;
  /** Per-powder gram overrides (COALESCE level 2). Empty = use default_powder_gram. */
  size_config: PowderSizeConfigEntry[];
}

/** System-wide size fallback (COALESCE level 3). Always 3 entries: SMALL, MEDIUM, LARGE. */
export interface DefaultPowderGram {
  size: "SMALL" | "MEDIUM" | "LARGE";
  grams: number;
}

/** Shape of GET /api/powders response. */
export interface PowderApiResponse {
  data: Powder[];
  default_powder_gram: DefaultPowderGram[];
}

/** Milk type — used by GET /api/menu (latte items) and powderStore. */
export interface MilkType {
  id: string;
  name: string;
  price_per_ml: number;
  is_default: boolean;
  display_order: number;
}
