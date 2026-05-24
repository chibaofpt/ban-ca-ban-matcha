import { apiClient } from "@/src/lib/api/client";

export interface ScheduleSlot {
  slot: number;
  open_time: string;
  close_time: string;
}

export interface DaySchedule {
  day_of_week: number;
  slots: ScheduleSlot[];
}

export type StoreOpenReason =
  | "OPEN"
  | "OUTSIDE_HOURS"
  | "TEMPORARY_CLOSURE"
  | "DAY_OFF";

export interface StoreStatusResponse {
  is_open: boolean;
  reason: StoreOpenReason;
  closure_note: string | null;
  today_schedule: ScheduleSlot[];
  weekly_schedule: DaySchedule[];
}

/** GET /api/store-status — Public. Fetch current store open/closed status. */
export async function getStoreStatus(): Promise<StoreStatusResponse> {
  const res = await apiClient.get<{ data: StoreStatusResponse }>(
    "/api/store-status",
  );
  return res.data.data;
}
