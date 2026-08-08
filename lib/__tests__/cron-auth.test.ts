import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyCronRequest } from "@/lib/cronAuth";

function makeRequest(authorization?: string): Request {
  const headers = authorization ? { authorization } : undefined;
  return new Request("http://localhost/api/cron/example", { headers });
}

describe("Xác thực cron dùng chung", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fail closed với 500 khi server thiếu CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = verifyCronRequest(makeRequest());

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });

  it.each([undefined, "Bearer wrong-secret"])(
    "trả 401 khi bearer token thiếu hoặc sai: %s",
    async (authorization) => {
      vi.stubEnv("CRON_SECRET", "expected-secret");

      const response = verifyCronRequest(makeRequest(authorization));

      expect(response?.status).toBe(401);
      await expect(response?.json()).resolves.toEqual({
        error: "Unauthorized",
        code: "UNAUTHORIZED",
      });
    },
  );

  it("cho phép request có bearer token đúng", () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");

    expect(verifyCronRequest(makeRequest("Bearer expected-secret"))).toBeNull();
  });
});
