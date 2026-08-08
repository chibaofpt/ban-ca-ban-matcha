import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSessionFindMany = vi.fn();
const mockSessionDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findMany: (...args: unknown[]) => mockSessionFindMany(...args),
      deleteMany: (...args: unknown[]) => mockSessionDeleteMany(...args),
    },
  },
}));

import { runCleanExpiredSessions } from "@/lib/cleanExpiredSessions";

const now = new Date("2026-08-04T00:00:00.000Z");

function makeSessions(count: number, offset = 0): { id: string }[] {
  return Array.from({ length: count }, (_, index) => ({ id: `session-${offset + index}` }));
}

describe("Job dọn session hết hạn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionFindMany.mockResolvedValue([]);
    mockSessionDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("đọc và xoá tối đa 500 session mỗi batch", async () => {
    mockSessionFindMany.mockResolvedValueOnce(makeSessions(2));
    mockSessionDeleteMany.mockResolvedValueOnce({ count: 2 });

    const result = await runCleanExpiredSessions(now);

    expect(mockSessionFindMany).toHaveBeenCalledWith({
      where: { expires_at: { lt: now } },
      select: { id: true },
      orderBy: { expires_at: "asc" },
      take: 500,
    });
    expect(mockSessionDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["session-0", "session-1"] },
        expires_at: { lt: now },
      },
    });
    expect(result).toEqual({
      batches: 1,
      selected: 2,
      deleted: 2,
      reached_batch_limit: false,
    });
  });

  it("dừng sau tối đa 5 batch để giữ thời gian chạy hữu hạn", async () => {
    for (let batch = 0; batch < 5; batch += 1) {
      mockSessionFindMany.mockResolvedValueOnce(makeSessions(500, batch * 500));
      mockSessionDeleteMany.mockResolvedValueOnce({ count: 500 });
    }

    const result = await runCleanExpiredSessions(now);

    expect(mockSessionFindMany).toHaveBeenCalledTimes(5);
    expect(mockSessionDeleteMany).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      batches: 5,
      selected: 2500,
      deleted: 2500,
      reached_batch_limit: true,
    });
  });

  it("an toàn khi session đã được request khác xoá trước", async () => {
    mockSessionFindMany.mockResolvedValueOnce(makeSessions(1));
    mockSessionDeleteMany.mockResolvedValueOnce({ count: 0 });

    const result = await runCleanExpiredSessions(now);

    expect(result).toMatchObject({ selected: 1, deleted: 0 });
  });
});
