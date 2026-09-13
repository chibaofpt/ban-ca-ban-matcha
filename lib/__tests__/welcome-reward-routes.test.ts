import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockGetReward = vi.fn();
const mockOpenReward = vi.fn();
const mockToDto = vi.fn((db: unknown, reward: unknown, now?: Date) => {
  void db;
  void now;
  return reward;
});

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: vi.fn(), welcomeReward: {} } }));
vi.mock("@/lib/welcomeReward", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/welcomeReward")>(),
  getWelcomeReward: (...args: unknown[]) => mockGetReward(...args),
  openWelcomeReward: (...args: unknown[]) => mockOpenReward(...args),
}));
vi.mock("@/lib/welcomeRewardDto", () => ({
  toWelcomeRewardDto: (db: unknown, reward: unknown, now?: Date) => mockToDto(db, reward, now),
}));

import { GET } from "@/app/api/customer/rewards/welcome/route";
import { POST } from "@/app/api/customer/rewards/welcome/open/route";
import { WelcomeRewardError } from "@/lib/welcomeReward";

const ids = {
  reward_id: "11111111-1111-4111-8111-111111111111",
  box_id: "22222222-2222-4222-8222-222222222222",
  request_id: "33333333-3333-4333-8333-333333333333",
};

const request = (body: unknown) => new Request("http://localhost/api/customer/rewards/welcome/open", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("Customer welcome reward routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "customer", role: "CUSTOMER" });
  });

  it("GET trả reward null cho customer chưa có entitlement", async () => {
    mockGetReward.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { reward: null } });
  });

  it("GET từ chối session không phải CUSTOMER", async () => {
    mockGetSession.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
  });

  it("GET và POST trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);
    const getResponse = await GET();
    const postResponse = await POST(request(ids));
    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    expect(mockGetReward).not.toHaveBeenCalled();
    expect(mockOpenReward).not.toHaveBeenCalled();
  });

  it("POST validate UUID trước workflow", async () => {
    const response = await POST(request({ ...ids, box_id: "bad" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
    expect(mockOpenReward).not.toHaveBeenCalled();
  });

  it("POST bind workflow vào customer session và trả reward hoàn tất", async () => {
    const reward = { id: ids.reward_id, status: "COMPLETED" };
    mockOpenReward.mockResolvedValue(reward);
    const response = await POST(request(ids));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { reward } });
    expect(mockToDto).toHaveBeenCalledWith(expect.anything(), reward, undefined);
    expect(mockOpenReward).toHaveBeenCalledWith(expect.anything(), {
      userId: "customer", rewardId: ids.reward_id, boxId: ids.box_id, requestId: ids.request_id,
    });
  });

  it("GET await canonical reward projection trước khi đóng envelope", async () => {
    const reward = { id: ids.reward_id, status: "COMPLETED" };
    let resolveDto!: (value: unknown) => void;
    mockGetReward.mockResolvedValue(reward);
    mockToDto.mockReturnValue(new Promise((resolve) => { resolveDto = resolve; }));
    const pending = GET();
    await Promise.resolve();
    resolveDto({ projected: true });
    expect(await (await pending).json()).toEqual({ data: { reward: { projected: true } } });
  });

  it("POST await canonical reward projection trước khi đóng envelope", async () => {
    const reward = { id: ids.reward_id, status: "COMPLETED" };
    let resolveDto!: (value: unknown) => void;
    const projected = new Promise((resolve) => { resolveDto = resolve; });
    mockOpenReward.mockResolvedValue(reward);
    mockToDto.mockReturnValue(projected);
    const pending = POST(request(ids));
    resolveDto({ projected: true });
    expect(await (await pending).json()).toEqual({ data: { reward: { projected: true } } });
  });

  it.each([
    { reason: "NOT_FOUND", status: 404, code: "NOT_FOUND" },
    { reason: "CONFLICT", status: 409, code: "CONFLICT" },
    { reason: "REWARD_PAUSED", status: 422, code: "BUSINESS_RULE_VIOLATION" },
    { reason: "REWARD_TEMPORARILY_UNAVAILABLE", status: 422, code: "BUSINESS_RULE_VIOLATION" },
  ] as const)("POST map $reason đúng error contract", async ({ reason, status, code }) => {
    mockOpenReward.mockRejectedValue(new WelcomeRewardError(reason));
    const response = await POST(request(ids));
    const body = await response.json();
    expect(response.status).toBe(status);
    expect(body.code).toBe(code);
    if (status === 422) expect(body.details.reason).toBe(reason);
  });
});
