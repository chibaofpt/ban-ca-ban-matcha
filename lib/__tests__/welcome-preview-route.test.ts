import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ settings: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { welcomeRewardSettings: { findUnique: mocks.settings } } }));
import { GET } from "@/app/api/auth/register/welcome-reward/route";

describe("Public welcome offer — APPLICATION_LOGIC", () => {
  beforeEach(() => vi.clearAllMocks());
  it("trả mức 12 điểm chỉ đọc và không lộ reference cấu hình", async () => {
    mocks.settings.mockResolvedValue({ id: 1, mode: "POINTS", points_amount: 12, fixed_package_id: "internal-package", active_campaign_id: "internal-campaign" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { mode: "POINTS", points_amount: 12 } });
  });
  it("lỗi database trả 503 sanitized thay vì lời hứa thưởng", async () => {
    mocks.settings.mockRejectedValue(new Error("private diagnostic"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("private diagnostic");
    expect(body).not.toHaveProperty("data");
  });
});
