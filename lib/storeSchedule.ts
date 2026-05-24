import { prisma } from "@/lib/prisma";

/** Asia/Ho_Chi_Minh UTC offset in minutes */
const VN_OFFSET_MINUTES = 7 * 60;

/** Get current Vietnam time as { dayOfWeek: 0-6, timeMinutes: 0-1439 } */
function getVietnamNow(): { dayOfWeek: number; timeMinutes: number } {
  const now = new Date();
  // Shift to Vietnam time
  const vnMs = now.getTime() + VN_OFFSET_MINUTES * 60 * 1000;
  const vnDate = new Date(vnMs);

  const dayOfWeek = vnDate.getUTCDay(); // 0 = Sunday
  const timeMinutes = vnDate.getUTCHours() * 60 + vnDate.getUTCMinutes();
  return { dayOfWeek, timeMinutes };
}

/** Parse "HH:mm" string to total minutes from midnight */
function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type StoreOpenReason =
  | "OPEN"
  | "OUTSIDE_HOURS"
  | "TEMPORARY_CLOSURE"
  | "DAY_OFF";

export interface StoreOpenResult {
  is_open: boolean;
  reason: StoreOpenReason;
  closure_note: string | null;
}

/**
 * Check if the store is currently open based on schedule + temporary closure.
 * Temporary closure takes precedence over schedule.
 * Uses Asia/Ho_Chi_Minh (UTC+7) timezone.
 */
export async function checkStoreOpen(): Promise<StoreOpenResult> {
  // 1. Check temporary closure first (takes precedence)
  const tempClosure = await prisma.storeTemporaryClosure.findFirst({
    where: { is_active: true },
  });

  if (tempClosure) {
    return {
      is_open: false,
      reason: "TEMPORARY_CLOSURE",
      closure_note: tempClosure.note ?? null,
    };
  }

  // 2. Check weekly schedule
  const { dayOfWeek, timeMinutes } = getVietnamNow();

  const todaySlots = await prisma.storeSchedule.findMany({
    where: { day_of_week: dayOfWeek },
    orderBy: { slot: "asc" },
  });

  // No rows for today = day off
  if (todaySlots.length === 0) {
    return { is_open: false, reason: "DAY_OFF", closure_note: null };
  }

  // Check if current time falls within any slot
  const isOpen = todaySlots.some((s) => {
    const openMin = parseTime(s.open_time);
    const closeMin = parseTime(s.close_time);
    return timeMinutes >= openMin && timeMinutes < closeMin;
  });

  if (isOpen) {
    return { is_open: true, reason: "OPEN", closure_note: null };
  }

  return { is_open: false, reason: "OUTSIDE_HOURS", closure_note: null };
}

export interface StoreScheduleSlot {
  slot: number;
  open_time: string;
  close_time: string;
}

export interface StoreDaySchedule {
  day_of_week: number;
  slots: StoreScheduleSlot[];
}

/**
 * Fetch the full weekly schedule grouped by day_of_week.
 * Days with no rows are represented as { day_of_week, slots: [] }.
 */
export async function getWeeklySchedule(): Promise<StoreDaySchedule[]> {
  const rows = await prisma.storeSchedule.findMany({
    orderBy: [{ day_of_week: "asc" }, { slot: "asc" }],
  });

  const grouped: StoreDaySchedule[] = Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    slots: [],
  }));

  for (const row of rows) {
    grouped[row.day_of_week].slots.push({
      slot: row.slot,
      open_time: row.open_time,
      close_time: row.close_time,
    });
  }

  return grouped;
}

/**
 * Fetch the schedule for today (Vietnam timezone).
 * Returns empty array if today is a day off.
 */
export async function getTodaySchedule(): Promise<StoreScheduleSlot[]> {
  const { dayOfWeek } = getVietnamNow();
  const rows = await prisma.storeSchedule.findMany({
    where: { day_of_week: dayOfWeek },
    orderBy: { slot: "asc" },
  });
  return rows.map((r) => ({
    slot: r.slot,
    open_time: r.open_time,
    close_time: r.close_time,
  }));
}

/**
 * Validate that a pickup time is:
 * 1. At least 10 minutes in the future from now.
 * 2. On the same calendar day in Vietnam (UTC+7) timezone as now.
 * 3. Within the store's scheduled slots for today.
 */
export async function validatePickupTime(
  pickupTime: Date,
  now: Date = new Date()
): Promise<{ isValid: boolean; error?: string }> {
  const getVnDateStr = (d: Date) => {
    const vn = new Date(d.getTime() + VN_OFFSET_MINUTES * 60 * 1000);
    return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}-${String(
      vn.getUTCDate()
    ).padStart(2, "0")}`;
  };

  const getVnTimeMinutes = (d: Date) => {
    const vn = new Date(d.getTime() + VN_OFFSET_MINUTES * 60 * 1000);
    return vn.getUTCHours() * 60 + vn.getUTCMinutes();
  };

  const getVnDayOfWeek = (d: Date) => {
    const vn = new Date(d.getTime() + VN_OFFSET_MINUTES * 60 * 1000);
    return vn.getUTCDay();
  };

  // 1. Must be at least 10 minutes in the future (minus 10s buffer for network lag/skew)
  const minTime = now.getTime() + 10 * 60 * 1000 - 10000;
  if (pickupTime.getTime() < minTime) {
    return { isValid: false, error: "Thời gian nhận tối thiểu phải cách hiện tại 10 phút" };
  }

  // 2. Must be on the same calendar day in Vietnam
  if (getVnDateStr(pickupTime) !== getVnDateStr(now)) {
    return { isValid: false, error: "Chỉ có thể đặt nhận hàng trong ngày hôm nay" };
  }

  // 3. Must be within weekly schedule slots for today
  const dayOfWeek = getVnDayOfWeek(pickupTime);
  const timeMinutes = getVnTimeMinutes(pickupTime);

  const slots = await prisma.storeSchedule.findMany({
    where: { day_of_week: dayOfWeek },
  });

  if (slots.length === 0) {
    return { isValid: false, error: "Cửa hàng không hoạt động vào ngày này" };
  }

  const inSlot = slots.some((s) => {
    const openMin = parseTime(s.open_time);
    const closeMin = parseTime(s.close_time);
    return timeMinutes >= openMin && timeMinutes < closeMin;
  });

  if (!inSlot) {
    return { isValid: false, error: "Thời gian nhận nằm ngoài khung giờ hoạt động của cửa hàng" };
  }

  return { isValid: true };
}

