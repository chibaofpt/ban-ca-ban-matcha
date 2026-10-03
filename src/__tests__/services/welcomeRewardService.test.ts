import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import { ApiServiceError } from "@/src/services/orderService";
import { register } from "@/src/services/authService";
import {
  getWelcomeReward,
  openWelcomeReward,
  type WelcomeReward,
} from "@/src/services/welcomeRewardService";

const PENDING_REWARD: WelcomeReward = {
  id: "reward-1",
  mode: "GACHA",
  status: "PENDING",
  can_open: true,
  unavailable_reason: null,
  campaign: {
    id: "campaign-1",
    name: "Quà chào bạn mới",
    status: "ACTIVE",
    boxes: [{
      id: "box-1",
      name: "Hộp matcha 1",
      closed_image_url: "/closed.webp",
      open_image_url: "/open.webp",
      mouth_anchor_x: 50,
      mouth_anchor_y: 60,
      sort_order: 1,
    }],
  },
  outcome: null,
};

describe("welcomeRewardService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET phần thưởng chào mừng và unwrap data đúng một lần", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { reward: PENDING_REWARD } } });

    await expect(getWelcomeReward()).resolves.toEqual(PENDING_REWARD);
    expect(apiClient.get).toHaveBeenCalledWith("/api/customer/rewards/welcome");
  });

  it("POST lựa chọn hộp với đúng payload và unwrap kết quả", async () => {
    const payload = { reward_id: "reward-1", box_id: "box-1", request_id: "request-1" };
    const completed = {
      ...PENDING_REWARD,
      status: "COMPLETED" as const,
      can_open: false,
      outcome: { kind: "POINTS" as const, points: 5 },
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { reward: completed } } });

    await expect(openWelcomeReward(payload)).resolves.toEqual(completed);
    expect(apiClient.post).toHaveBeenCalledWith("/api/customer/rewards/welcome/open", payload);
  });

  it("giữ status, code, message và details từ lỗi server", async () => {
    vi.mocked(apiClient.post).mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: "Phần thưởng đang tạm dừng",
          code: "BUSINESS_RULE_VIOLATION",
          details: { reason: "REWARD_PAUSED" },
        },
      },
    });

    const request = { reward_id: "reward-1", box_id: "box-1", request_id: "request-1" };
    await expect(openWelcomeReward(request)).rejects.toMatchObject({
      message: "Phần thưởng đang tạm dừng",
      status: 422,
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "REWARD_PAUSED" },
    });
  });

  it("giữ lỗi kết nối tách biệt với ApiServiceError", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("Network unavailable"));

    let caught: unknown;
    try {
      await getWelcomeReward();
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ApiServiceError);
  });

  it("giữ welcome_reward trong kết quả đăng ký", async () => {
    const payload = { name: "Bạn Cá", phone_number: "0912345678", password: "secret12" };
    const result = {
      name: "Bạn Cá",
      phone_number: "+84912345678",
      insta_name: null,
      role: "CUSTOMER" as const,
      welcome_reward: { id: "reward-1", mode: "GACHA" as const, status: "PENDING" as const, outcome_kind: null },
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: result } });

    await expect(register(payload)).resolves.toEqual(result);
    expect(apiClient.post).toHaveBeenCalledWith("/api/auth/register", payload);
  });
});
