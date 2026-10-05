/** Short-lived capability for the private operations order channel. */
export interface OrderRealtimeToken {
  token: string;
  expires_at: number;
  topic: "orders:operations";
  event: "orders_changed";
}
