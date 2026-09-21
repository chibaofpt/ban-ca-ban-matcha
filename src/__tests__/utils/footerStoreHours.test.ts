import { describe, expect, it } from "vitest";

import type { DaySchedule, ScheduleSlot } from "@/contracts/store";
import {
  formatTodaySchedule,
  getNextOpeningCountdown,
} from "@/src/lib/utils/storeHoursPresentation";

const slot = (slotNumber: number, openTime: string, closeTime: string): ScheduleSlot => ({
  slot: slotNumber,
  open_time: openTime,
  close_time: closeTime,
});

const weeklySchedule = (days: Partial<Record<number, ScheduleSlot[]>>): DaySchedule[] =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    slots: days[dayOfWeek] ?? [],
  }));

describe("trình bày giờ mở cửa ở footer", () => {
  it("hiển thị đúng một hoặc hai khung giờ trong ngày", () => {
    expect(formatTodaySchedule([slot(1, "08:00", "22:00")])).toBe("8:00 - 22:00");
    expect(formatTodaySchedule([
      slot(1, "08:00", "11:00"),
      slot(2, "13:00", "22:00"),
    ])).toBe("8:00 - 11:00 và 13:00 - 22:00");
  });

  it("đếm ngược đến ca mở tiếp theo trong cùng ngày", () => {
    const schedule = weeklySchedule({
      1: [slot(1, "08:00", "11:00"), slot(2, "13:00", "22:00")],
    });

    expect(getNextOpeningCountdown(schedule, new Date("2026-09-21T00:31:00.000Z"))).toBe("29p");
    expect(getNextOpeningCountdown(schedule, new Date("2026-09-21T04:30:00.000Z"))).toBe("1h30p");
  });

  it("không đếm ngược đến ca sau khi cửa hàng đang trong ca mở", () => {
    const schedule = weeklySchedule({
      1: [slot(1, "08:00", "11:00"), slot(2, "13:00", "22:00")],
    });

    expect(getNextOpeningCountdown(schedule, new Date("2026-09-21T01:31:00.000Z"))).toBeNull();
  });

  it("đếm ngược qua ngày và bỏ qua ngày nghỉ", () => {
    const nextDay = weeklySchedule({ 2: [slot(1, "07:00", "22:00")] });
    const afterDayOff = weeklySchedule({ 3: [slot(1, "08:00", "22:00")] });
    const mondayAt2231 = new Date("2026-09-21T15:31:00.000Z");

    expect(getNextOpeningCountdown(nextDay, mondayAt2231)).toBe("8h29p");
    expect(getNextOpeningCountdown(afterDayOff, mondayAt2231)).toBe("1 ngày 9h29p");
  });

  it("không đưa ra thời gian khi cả tuần không có ca mở cửa", () => {
    expect(getNextOpeningCountdown(weeklySchedule({}), new Date("2026-09-21T15:31:00.000Z"))).toBeNull();
  });
});
