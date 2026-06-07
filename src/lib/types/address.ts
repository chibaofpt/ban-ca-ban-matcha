export interface Address {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  address: string;
  receiver_name: string;
  receiver_phone: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AddressPayload {
  lat: number;
  lng: number;
  address: string;
  receiver_name: string;
  receiver_phone: string;
  is_default?: boolean;
}

export interface GoongPrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface DeliveryEstimate {
  distance_km: number;
  duration_minutes: number;
  shipping_fee_vnd: number;
}
