import { NextResponse } from "next/server";
import {
  checkStoreOpen,
  getWeeklySchedule,
  getTodaySchedule,
} from "@/lib/storeSchedule";
import { withCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";

/** GET /api/store-status — Public. Returns current store open/closed status. */
export async function GET() {
  try {
    const data = await withCache(CACHE_KEYS.STORE_STATUS, CACHE_TTL.STORE_STATUS, fetchStoreStatusData);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Lỗi server", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

/** Fetches store status from DB. Called by withCache on cache miss. */
async function fetchStoreStatusData() {
  const [storeStatus, todaySlots, weeklySchedule] = await Promise.all([
    checkStoreOpen(),
    getTodaySchedule(),
    getWeeklySchedule(),
  ]);

  return {
    is_open: storeStatus.is_open,
    reason: storeStatus.reason,
    closure_note: storeStatus.closure_note,
    today_schedule: todaySlots,
    weekly_schedule: weeklySchedule,
  };
}
