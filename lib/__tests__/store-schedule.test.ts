import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockClosureFindFirst = vi.fn();
const mockScheduleFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storeTemporaryClosure: {
      findFirst: (...args: unknown[]) => mockClosureFindFirst(...args),
    },
    storeSchedule: {
      findMany: (...args: unknown[]) => mockScheduleFindMany(...args),
    },
  },
}));

import { checkStoreOpen, validatePickupTime } from "@/lib/storeSchedule";

const mondayAt = (hour: number, minute = 0) => new Date(Date.UTC(2026, 8, 7, hour - 7, minute));

describe("storeSchedule — giờ mở cửa và nhận hàng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockClosureFindFirst.mockResolvedValue(null);
    mockScheduleFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("đóng tạm thời luôn ưu tiên hơn slot đang mở", async () => {
    vi.setSystemTime(mondayAt(10));
    mockClosureFindFirst.mockResolvedValue({ note: "Bảo trì máy" });
    mockScheduleFindMany.mockResolvedValue([{ open_time: "08:00", close_time: "18:00", slot: 1 }]);

    await expect(checkStoreOpen()).resolves.toEqual({
      is_open: false,
      reason: "TEMPORARY_CLOSURE",
      closure_note: "Bảo trì máy",
    });
    expect(mockScheduleFindMany).not.toHaveBeenCalled();
  });

  it("ngày không có row lịch là ngày nghỉ", async () => {
    vi.setSystemTime(mondayAt(10));

    await expect(checkStoreOpen()).resolves.toEqual({
      is_open: false,
      reason: "DAY_OFF",
      closure_note: null,
    });
  });

  it("mở đúng lúc mở cửa nhưng đóng đúng lúc đóng cửa", async () => {
    mockScheduleFindMany.mockResolvedValue([{ open_time: "08:00", close_time: "18:00", slot: 1 }]);
    vi.setSystemTime(mondayAt(8));
    await expect(checkStoreOpen()).resolves.toMatchObject({ is_open: true, reason: "OPEN" });

    vi.setSystemTime(mondayAt(18));
    await expect(checkStoreOpen()).resolves.toMatchObject({ is_open: false, reason: "OUTSIDE_HOURS" });
  });

  it("khe giữa hai slot là ngoài giờ", async () => {
    vi.setSystemTime(mondayAt(12, 30));
    mockScheduleFindMany.mockResolvedValue([
      { open_time: "08:00", close_time: "12:00", slot: 1 },
      { open_time: "13:00", close_time: "18:00", slot: 2 },
    ]);

    await expect(checkStoreOpen()).resolves.toMatchObject({ is_open: false, reason: "OUTSIDE_HOURS" });
  });

  it("dùng ngày Việt Nam khi UTC vẫn thuộc ngày trước", async () => {
    vi.setSystemTime(new Date("2026-09-06T18:30:00.000Z")); // Monday 01:30 in UTC+7
    mockScheduleFindMany.mockResolvedValue([{ open_time: "01:00", close_time: "02:00", slot: 1 }]);

    await expect(checkStoreOpen()).resolves.toMatchObject({ is_open: true, reason: "OPEN" });
    expect(mockScheduleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { day_of_week: 1 } }));
  });

  it("giữ buffer mười giây: trước ngưỡng bị từ chối, đúng ngưỡng được nhận", async () => {
    const now = mondayAt(10);
    mockScheduleFindMany.mockResolvedValue([{ open_time: "08:00", close_time: "18:00", slot: 1 }]);

    await expect(validatePickupTime(new Date(now.getTime() + 9 * 60_000 + 49_000), now)).resolves.toEqual({
      isValid: false,
      error: "Thời gian nhận tối thiểu phải cách hiện tại 10 phút",
    });
    await expect(validatePickupTime(new Date(now.getTime() + 9 * 60_000 + 50_000), now)).resolves.toEqual({ isValid: true });
  });

  it("không nhận pickup sang ngày Việt Nam kế tiếp", async () => {
    const now = new Date("2026-09-07T16:55:00.000Z"); // 23:55 Monday UTC+7
    const tomorrow = new Date("2026-09-07T17:05:00.000Z");

    await expect(validatePickupTime(tomorrow, now)).resolves.toEqual({
      isValid: false,
      error: "Chỉ có thể đặt nhận hàng trong ngày hôm nay",
    });
    expect(mockScheduleFindMany).not.toHaveBeenCalled();
  });

  it("từ chối pickup trong ngày nhưng ngoài slot", async () => {
    const now = mondayAt(10);
    mockScheduleFindMany.mockResolvedValue([{ open_time: "08:00", close_time: "18:00", slot: 1 }]);

    await expect(validatePickupTime(mondayAt(18, 10), now)).resolves.toEqual({
      isValid: false,
      error: "Thời gian nhận nằm ngoài khung giờ hoạt động của cửa hàng",
    });
  });
});
