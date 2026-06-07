export const DELIVERY_CONFIG = {
  /** Base fee for first N km (VND) */
  BASE_FEE_VND: 15_000,
  /** Distance covered by base fee (km) */
  BASE_DISTANCE_KM: 2,
  /** Fee per additional km after base (VND) */
  PER_KM_FEE_VND: 5_700,
  /** Maximum delivery radius (km) */
  MAX_RADIUS_KM: 15,
  /** Max addresses per user */
  MAX_ADDRESSES_PER_USER: 4,
  /** Debounce delay for autocomplete (ms) */
  AUTOCOMPLETE_DEBOUNCE_MS: 1_000,
} as const;
