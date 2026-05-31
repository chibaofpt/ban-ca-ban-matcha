import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { DailyReport, StaffMember } from "@/src/lib/types/report";

const URL = {
  report: "/api/report",
  staff: "/api/admin/staff",
} as const;

/** Fetch the daily/range report from the server */
export async function getReport(params: {
  startDate: string;
  endDate: string;
  staffId?: string;
}): Promise<DailyReport> {
  const res = await apiClient.get<ApiResponse<DailyReport>>(URL.report, {
    params: {
      startDate: params.startDate,
      endDate: params.endDate,
      ...(params.staffId ? { staffId: params.staffId } : {}),
    },
  });
  return res.data.data;
}

/** Fetch the list of STAFF and ADMIN users (admin only) */
export async function getStaffList(): Promise<StaffMember[]> {
  const res = await apiClient.get<ApiResponse<StaffMember[]>>(URL.staff);
  return res.data.data;
}
