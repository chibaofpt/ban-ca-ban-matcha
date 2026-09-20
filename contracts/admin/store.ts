import type { DaySchedule, ScheduleSlot } from "@/contracts/store";

export type { DaySchedule, ScheduleSlot } from "@/contracts/store";

/** Schedule slot accepted by the admin replacement endpoint. */
export type StoreScheduleUpdateSlot = Omit<ScheduleSlot, "slot">;

/** Full weekly schedule replacement submitted by Admin. */
export interface UpdateStoreScheduleRequest {
  schedules: Array<Omit<DaySchedule, "slots"> & { slots: StoreScheduleUpdateSlot[] }>;
}

/** Temporary store-closure mutation submitted by Admin. */
export interface StoreClosureRequest {
  action: "close" | "open";
  note?: string;
}

/** Active closure data returned after closing the store. */
export interface StoreClosureStatus {
  is_active: boolean;
  note: string | null;
  closed_at?: string;
}

/** Store state returned after reopening the store. */
export type OpenStoreResponse = Pick<StoreClosureStatus, "is_active">;
