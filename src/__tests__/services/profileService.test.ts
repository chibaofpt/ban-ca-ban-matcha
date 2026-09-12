import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import {
  changePassword,
  getProfile,
  updateProfile,
} from "@/src/services/profileService";
import { ApiServiceError } from "@/src/services/orderService";

const PROFILE = {
  name: "Bạn Cá",
  phone_number: "+84912345678",
  insta_name: "ban.ca",
  points_balance: 25,
  qr_token: "qr-token",
};

describe("profileService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /api/profile và unwrap data", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: PROFILE } });

    await expect(getProfile()).resolves.toEqual(PROFILE);
    expect(apiClient.get).toHaveBeenCalledWith("/api/profile");
  });

  it("PATCH /api/profile với đúng payload", async () => {
    const payload = {
      name: "Tên mới",
      insta_name: "ten.moi",
      current_password: "secret12",
    };
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...PROFILE, ...payload } },
    });

    await updateProfile(payload);

    expect(apiClient.patch).toHaveBeenCalledWith("/api/profile", payload);
  });

  it("PATCH /api/profile/password and unwraps the success envelope", async () => {
    const payload = {
      current_password: "current1",
      new_password: "newpass1",
    };
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: { success: true } } });

    await expect(changePassword(payload)).resolves.toBeUndefined();
    expect(apiClient.patch).toHaveBeenCalledWith("/api/profile/password", payload);
  });

  it("preserves server status, code, message and details on password errors", async () => {
    const payload = {
      current_password: "current1",
      new_password: "newpass1",
    };
    const error = {
      response: {
        status: 429,
        data: {
          error: "Too many requests",
          code: "TOO_MANY_REQUESTS",
          details: { retry_after: 123 },
        },
      },
    };
    vi.mocked(apiClient.patch).mockRejectedValue(error);

    await expect(changePassword(payload)).rejects.toMatchObject({
      message: "Too many requests",
      status: 429,
      code: "TOO_MANY_REQUESTS",
      details: { retry_after: 123 },
    });
  });

  it("keeps transport failures as non-API service errors", async () => {
    const payload = {
      current_password: "current1",
      new_password: "newpass1",
    };
    vi.mocked(apiClient.patch).mockRejectedValue(new Error("Network unavailable"));

    let caught: unknown;
    try {
      await changePassword(payload);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).not.toBeInstanceOf(ApiServiceError);
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toHaveProperty("message", "Network unavailable");
  });
});
