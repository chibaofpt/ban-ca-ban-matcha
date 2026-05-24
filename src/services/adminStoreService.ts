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

export interface StoreClosureStatus {
  is_active: boolean;
  note: string | null;
  closed_at?: string;
}

/** GET /api/admin/store-schedule — Fetch full weekly schedule. */
export async function getStoreSchedule(): Promise<DaySchedule[]> {
  const res = await apiClient.get<{ data: DaySchedule[] }>(
    "/api/admin/store-schedule",
  );
  return res.data.data;
}

/** PUT /api/admin/store-schedule — Replace entire schedule. */
export async function updateStoreSchedule(
  schedules: { day_of_week: number; slots: { open_time: string; close_time: string }[] }[],
): Promise<DaySchedule[]> {
  const res = await apiClient.put<{ data: DaySchedule[] }>(
    "/api/admin/store-schedule",
    { schedules },
  );
  return res.data.data;
}

/** POST /api/admin/store-closure — Close the store temporarily. */
export async function closeStore(note?: string): Promise<StoreClosureStatus> {
  const res = await apiClient.post<{ data: StoreClosureStatus }>(
    "/api/admin/store-closure",
    { action: "close", note },
  );
  return res.data.data;
}

/** POST /api/admin/store-closure — Reopen the store. */
export async function openStore(): Promise<{ is_active: boolean }> {
  const res = await apiClient.post<{ data: { is_active: boolean } }>(
    "/api/admin/store-closure",
    { action: "open" },
  );
  return res.data.data;
}
