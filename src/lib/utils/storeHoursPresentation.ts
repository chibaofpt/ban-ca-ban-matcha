import type { DaySchedule, ScheduleSlot } from "@/contracts/store";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseTime(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function getVietnamClock(now: Date): { dayOfWeek: number; timeMinutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dayOfWeek: Math.max(0, WEEKDAYS.indexOf(values.weekday)),
    timeMinutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function formatDuration(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days} ngày` : "", hours ? `${hours}h` : "", minutes || (!days && !hours) ? `${minutes}p` : ""]
    .filter(Boolean).join(" ").replace(/h /, "h");
}

/** Format today's configured opening slots for compact footer display. */
export function formatTodaySchedule(slots: readonly ScheduleSlot[]): string {
  if (!slots.length) return "Hôm nay cửa hàng nghỉ";
  return [...slots].sort((a, b) => a.slot - b.slot)
    .map(({ open_time, close_time }) => `${open_time.replace(/^0/, "")} - ${close_time.replace(/^0/, "")}`)
    .join(" và ");
}

/** Calculate the duration from the current Vietnam time to the next configured opening. */
export function getNextOpeningCountdown(schedule: readonly DaySchedule[], now = new Date()): string | null {
  const current = getVietnamClock(now);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = schedule.find(({ day_of_week }) => day_of_week === (current.dayOfWeek + offset) % 7);
    if (offset === 0 && (day?.slots ?? []).some(({ open_time, close_time }) => {
      const opening = parseTime(open_time);
      const closing = parseTime(close_time);
      return opening !== null && closing !== null && current.timeMinutes >= opening && current.timeMinutes < closing;
    })) return null;
    const openings = (day?.slots ?? []).map(({ open_time }) => parseTime(open_time))
      .filter((value): value is number => value !== null).sort((a, b) => a - b);
    for (const opening of openings) {
      const difference = offset * 1440 + opening - current.timeMinutes;
      if (difference > 0) return formatDuration(difference);
    }
  }
  return null;
}
