import { NextResponse } from "next/server";
import {
  checkStoreOpen,
  getWeeklySchedule,
  getTodaySchedule,
} from "@/lib/storeSchedule";

/** GET /api/store-status — Public. Returns current store open/closed status. */
export async function GET() {
  try {
    const [storeStatus, todaySlots, weeklySchedule] = await Promise.all([
      checkStoreOpen(),
      getTodaySchedule(),
      getWeeklySchedule(),
    ]);

    return NextResponse.json({
      data: {
        is_open: storeStatus.is_open,
        reason: storeStatus.reason,
        closure_note: storeStatus.closure_note,
        today_schedule: todaySlots,
        weekly_schedule: weeklySchedule,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Lỗi server", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
