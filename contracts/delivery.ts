export interface GoongPrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DeliveryEstimate {
  distance_km: number;
  duration_minutes: number;
  shipping_fee_vnd: number;
}

export interface ReverseGeocodeResult extends GeoPoint {
  address: string;
}
