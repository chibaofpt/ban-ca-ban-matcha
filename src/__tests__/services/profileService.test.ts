import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import {
  getProfile,
  updateProfile,
} from "@/src/services/profileService";

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
});
