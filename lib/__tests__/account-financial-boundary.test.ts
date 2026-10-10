import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ userUpdate: vi.fn(), rewardRead: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ id: "retired", role: "CUSTOMER" }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({
      user: { updateMany: state.userUpdate },
      rewardOutcome: { findUnique: state.rewardRead },
    }),
  },
}));
import { POST } from "@/app/api/customer/rewards/welcome/open/route";

describe("Retired account financial API boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); state.userUpdate.mockResolvedValue({ count: 0 }); });
  it("returns a controlled conflict without opening a reward for a stale session", async () => {
    const response = await POST(new Request("http://localhost/api/customer/rewards/welcome/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reward_id: "11111111-1111-4111-8111-111111111111",
        box_id: "22222222-2222-4222-8222-222222222222",
        request_id: "33333333-3333-4333-8333-333333333333",
      }),
    }));
    expect(response.status).toBe(409);
    expect((await response.json()).details.reason).toBe("ACCOUNT_NOT_ACTIVE");
    expect(state.rewardRead).not.toHaveBeenCalled();
  });
});
