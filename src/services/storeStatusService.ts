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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStoreOpenReason(value: unknown): value is StoreOpenReason {
  return value === "OPEN" || value === "OUTSIDE_HOURS" || value === "TEMPORARY_CLOSURE" || value === "DAY_OFF";
}

function parseScheduleSlot(value: unknown): ScheduleSlot | null {
  if (!isRecord(value) || typeof value.slot !== "number" || typeof value.open_time !== "string" || typeof value.close_time !== "string") {
    return null;
  }
  return { slot: value.slot, open_time: value.open_time, close_time: value.close_time };
}

function parseDaySchedule(value: unknown): DaySchedule | null {
  if (!isRecord(value) || typeof value.day_of_week !== "number" || !Array.isArray(value.slots)) return null;
  const slots = value.slots.map(parseScheduleSlot);
  return slots.every((slot): slot is ScheduleSlot => slot !== null)
    ? { day_of_week: value.day_of_week, slots }
    : null;
}

/** Validate the public store-status DTO before it becomes React Query data. */
export function parseStoreStatusResponse(value: unknown): StoreStatusResponse {
  if (!isRecord(value) || typeof value.is_open !== "boolean" || !isStoreOpenReason(value.reason)) {
    throw new Error("Phản hồi trạng thái cửa hàng không hợp lệ");
  }
  const closureNote = value.closure_note;
  if (closureNote !== null && typeof closureNote !== "string") {
    throw new Error("Phản hồi trạng thái cửa hàng không hợp lệ");
  }
  if (!Array.isArray(value.today_schedule) || !Array.isArray(value.weekly_schedule)) {
    throw new Error("Phản hồi trạng thái cửa hàng không hợp lệ");
  }
  const todaySchedule = value.today_schedule.map(parseScheduleSlot);
  const weeklySchedule = value.weekly_schedule.map(parseDaySchedule);
  if (!todaySchedule.every((slot): slot is ScheduleSlot => slot !== null) ||
      !weeklySchedule.every((day): day is DaySchedule => day !== null)) {
    throw new Error("Phản hồi trạng thái cửa hàng không hợp lệ");
  }
  return {
    is_open: value.is_open,
    reason: value.reason,
    closure_note: closureNote,
    today_schedule: todaySchedule,
    weekly_schedule: weeklySchedule,
  };
}

/** GET /api/store-status — Public. Fetch current store open/closed status. */
export async function getStoreStatus(): Promise<StoreStatusResponse> {
  const res = await apiClient.get<{ data: unknown }>(
    "/api/store-status",
  );
  return parseStoreStatusResponse(res.data.data);
}
