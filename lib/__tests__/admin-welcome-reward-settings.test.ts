import { describe, expect, it, vi } from "vitest";
import { AdminRewardError, type AdminRewardDatabase } from "@/lib/adminRewardCampaign";
import { getAdminWelcomeRewardSettings, updateAdminWelcomeRewardSettings } from "@/lib/adminWelcomeRewardSettings";

describe("Workflow settings welcome reward", () => {
  it("project POINTS revision 0 khi singleton chưa tồn tại", async () => {
    const db = { welcomeRewardSettings: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as AdminRewardDatabase;
    await expect(getAdminWelcomeRewardSettings(db)).resolves.toEqual({ mode: "POINTS", fixed_package_id: null, active_campaign_id: null, revision: 0 });
  });

  it("từ chối package fixed đã hết hạn", async () => {
    const tx = {
      voucherPackage: { findUnique: vi.fn().mockResolvedValue({ id: "package", is_active: true, ends_at: new Date("2026-01-01") }) },
    };
    const db = { $transaction: vi.fn((callback) => callback(tx)) } as unknown as AdminRewardDatabase;
    await expect(updateAdminWelcomeRewardSettings(db, {
      mode: "FIXED_VOUCHER", fixed_package_id: "package", active_campaign_id: null, revision: 0,
    }, new Date("2026-01-02"))).rejects.toSatisfy((error: unknown) =>
      error instanceof AdminRewardError && error.reason === "PACKAGE_UNAVAILABLE");
  });

  it("trả conflict khi revision singleton không còn khớp", async () => {
    const tx = {
      welcomeRewardSettings: {
        findUnique: vi.fn().mockResolvedValue({ mode: "POINTS", fixed_package_id: null, active_campaign_id: null, revision: 2 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const db = { $transaction: vi.fn((callback) => callback(tx)) } as unknown as AdminRewardDatabase;
    await expect(updateAdminWelcomeRewardSettings(db, {
      mode: "POINTS", fixed_package_id: null, active_campaign_id: null, revision: 1,
    })).rejects.toSatisfy((error: unknown) => error instanceof AdminRewardError && error.reason === "CONFLICT");
  });
});
