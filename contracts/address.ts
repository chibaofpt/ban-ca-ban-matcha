export interface Address {
  id: string;
  /** Legacy wire field preserved for compatibility; do not use as a public identifier for new APIs. */
  user_id: string;
  lat: number;
  lng: number;
  label: string;
  full_address: string;
  receiver_name: string;
  receiver_phone: string;
  is_default: boolean;
  distance_km: number | null;
  created_at: string;
  updated_at: string;
}

export interface AddressPayload {
  lat: number;
  lng: number;
  label: string;
  full_address: string;
  receiver_name: string;
  receiver_phone: string;
  is_default?: boolean;
}
