/** Staff role exposed as a safe display-only points-history actor. */
export type PointsActorRole = "CUSTOMER" | "STAFF" | "ADMIN";

/** One customer-facing point transaction after server-side grouping. */
export interface PointsHistoryEvent {
  id: string;
  kind: "order_reward" | "order_reversal" | "other";
  reason: string;
  total_delta: number;
  order_points: number;
  surplus_points: number;
  created_at: string;
  order: { order_code: string | null; points_base_vnd: number } | null;
  voucher: { package_name: string } | null;
  actor: { name: string; role: PointsActorRole } | null;
}

/** Paginated points payload returned by the customer profile API. */
export interface CustomerPointsData {
  points_balance: number;
  events: PointsHistoryEvent[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    has_more?: boolean;
    next_cursor?: string | null;
  };
}
