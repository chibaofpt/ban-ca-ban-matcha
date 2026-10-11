import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
import { settingsSchema } from "@/lib/rewards/adminRewardHttp";
import { updateAdminWelcomeRewardSettings } from "@/lib/rewards/adminWelcomeRewardSettings";
import type { AdminRewardDatabase } from "@/lib/rewards/adminRewardCampaign";

describe("Cấu hình điểm chào mừng — APPLICATION_LOGIC", () => {
  it.each([1, 100])("chấp nhận %i điểm", (points_amount) => {
    expect(settingsSchema.safeParse({ mode: "POINTS", revision: 0, points_amount }).success).toBe(true);
  });
  it.each([0, 101, 1.5])("từ chối %s điểm", (points_amount) => {
    expect(settingsSchema.safeParse({ mode: "POINTS", revision: 0, points_amount }).success).toBe(false);
  });
  it.each([20, undefined])("lưu mức mới hoặc giữ 12 điểm khi consumer cũ bỏ qua trường: %s", async (points_amount) => {
    let row = { mode: "POINTS", points_amount: 12, fixed_package_id: null, active_campaign_id: null, revision: 2 };
    const tx = { welcomeRewardSettings: {
      findUnique: vi.fn(async () => row),
      updateMany: vi.fn(async ({ data }: { data: { points_amount?: number; revision: { increment: number } } }) => {
        row = { ...row, ...(data.points_amount === undefined ? {} : { points_amount: data.points_amount }), revision: row.revision + data.revision.increment };
        return { count: 1 };
      }),
    }};
    const db = { $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx) } as unknown as AdminRewardDatabase;
    const result = await updateAdminWelcomeRewardSettings(db, { mode: "POINTS", fixed_package_id: null, active_campaign_id: null, revision: 2, ...(points_amount === undefined ? {} : { points_amount }) });
    expect(result).toMatchObject({ points_amount: points_amount === undefined ? 12 : 20, revision: 3 });
  });
});
