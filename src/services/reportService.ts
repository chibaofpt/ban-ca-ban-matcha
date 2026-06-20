import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { DailyReport, StaffMember, StaffReport, AdminReport } from "@/src/lib/types/report";

const URL = {
  report: "/api/report",
  adminReport: "/api/admin/report",
  staff: "/api/admin/staff",
} as const;

/** Fetch the daily/range report from the server (legacy — used by admin via DailyReportModal) */
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

/** Fetch staff-only report — chỉ trả tổng đơn và doanh thu */
export async function getStaffReport(params: {
  startDate: string;
  endDate: string;
}): Promise<StaffReport> {
  const res = await apiClient.get<ApiResponse<StaffReport>>(URL.report, {
    params: {
      startDate: params.startDate,
      endDate: params.endDate,
    },
  });
  return res.data.data;
}

/** Fetch full admin report — bao gồm addon_usage, revenue_by_type, top_products */
export async function getAdminReport(params: {
  startDate: string;
  endDate: string;
  staffId?: string;
}): Promise<AdminReport> {
  const res = await apiClient.get<ApiResponse<AdminReport>>(URL.adminReport, {
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
