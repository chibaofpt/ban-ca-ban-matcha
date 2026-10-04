import { beforeEach, describe, expect, it, vi } from "vitest";
const get = vi.fn();
vi.mock("@/src/lib/api/client", () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));
import { fetchOrderRealtimeToken } from "@/src/services/orderRealtimeService";

describe("Service token Realtime", () => {
  beforeEach(() => { get.mockReset(); });
  it("giữ status, code và details khi server từ chối", async () => {
    get.mockRejectedValue({
      isAxiosError: true, response: { status: 403, data: {
        error: "Forbidden", code: "FORBIDDEN", details: { reason: "ROLE_CHANGED" },
      } },
    });
    await expect(fetchOrderRealtimeToken()).rejects.toMatchObject({
      message: "Forbidden", status: 403, code: "FORBIDDEN", details: { reason: "ROLE_CHANGED" },
    });
  });
  it("lấy capability qua API và unwrap data", async () => {
    const capability = { token: "short-token", expires_at: 1900000300, topic: "orders:operations", event: "orders_changed" };
    get.mockResolvedValue({ data: { data: capability } });
    await expect(fetchOrderRealtimeToken()).resolves.toEqual(capability);
    expect(get).toHaveBeenCalledWith("/api/realtime/orders/token");
  });
});

