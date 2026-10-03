import { apiClient } from "@/src/lib/api/client";
import type {
  DaySchedule,
  OpenStoreResponse,
  StoreClosureStatus,
  UpdateStoreScheduleRequest,
} from "@/contracts/admin/store";

export type {
  DaySchedule,
  ScheduleSlot,
  StoreClosureStatus,
} from "@/contracts/admin/store";

/** GET /api/admin/store-schedule — Fetch full weekly schedule. */
export async function getStoreSchedule(): Promise<DaySchedule[]> {
  const res = await apiClient.get<{ data: DaySchedule[] }>(
    "/api/admin/store-schedule",
  );
  return res.data.data;
}

/** PUT /api/admin/store-schedule — Replace entire schedule. */
export async function updateStoreSchedule(
  schedules: UpdateStoreScheduleRequest["schedules"],
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
export async function openStore(): Promise<OpenStoreResponse> {
  const res = await apiClient.post<{ data: OpenStoreResponse }>(
    "/api/admin/store-closure",
    { action: "open" },
  );
  return res.data.data;
}
