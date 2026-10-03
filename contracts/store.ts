/** One configured opening interval within a store day. */
export interface ScheduleSlot {
  slot: number;
  open_time: string;
  close_time: string;
}

/** Store opening intervals grouped by day of week. */
export interface DaySchedule {
  day_of_week: number;
  slots: ScheduleSlot[];
}

/** Reason reported by the public store-status endpoint. */
export type StoreOpenReason =
  | "OPEN"
  | "OUTSIDE_HOURS"
  | "TEMPORARY_CLOSURE"
  | "DAY_OFF";

/** Public store-status response data. */
export interface StoreStatusResponse {
  is_open: boolean;
  reason: StoreOpenReason;
  closure_note: string | null;
  today_schedule: ScheduleSlot[];
  weekly_schedule: DaySchedule[];
}
