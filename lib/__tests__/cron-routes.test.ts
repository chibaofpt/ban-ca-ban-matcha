import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRunCancelExpiredOrders = vi.fn();
const mockRunMenuImageCleanup = vi.fn();
const mockRunCleanExpiredSessions = vi.fn();

vi.mock("@/lib/cancelExpiredOrders", () => ({
  runCancelExpiredOrders: (...args: unknown[]) => mockRunCancelExpiredOrders(...args),
}));

vi.mock("@/lib/menuImageCleanup", () => ({
  runMenuImageCleanup: (...args: unknown[]) => mockRunMenuImageCleanup(...args),
}));

vi.mock("@/lib/cleanExpiredSessions", () => ({
  runCleanExpiredSessions: (...args: unknown[]) => mockRunCleanExpiredSessions(...args),
}));

vi.mock("@/lib/observability", () => ({
  captureServerException: vi.fn(),
  withAutoCancelMonitor: (callback: () => Promise<unknown>) => callback(),
}));

import { GET as cancelExpiredOrders } from "@/app/api/cron/cancel-expired-orders/route";
import { GET as cleanupMenuImages } from "@/app/api/cron/cleanup-menu-images/route";
import { GET as cleanSessions } from "@/app/api/cron/clean-sessions/route";

type CronHandler = (request: NextRequest) => Promise<Response>;

const routes: { name: string; handler: CronHandler; worker: ReturnType<typeof vi.fn> }[] = [
  { name: "cancel-expired-orders", handler: cancelExpiredOrders, worker: mockRunCancelExpiredOrders },
  { name: "cleanup-menu-images", handler: cleanupMenuImages, worker: mockRunMenuImageCleanup },
  { name: "clean-sessions", handler: cleanSessions, worker: mockRunCleanExpiredSessions },
];

function request(authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/job", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe.each(routes)("Route cron $name", ({ handler, worker }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    worker.mockResolvedValue({ failed: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("không chạy worker và trả 500 khi thiếu CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await handler(request());

    expect(response.status).toBe(500);
    expect(worker).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("không chạy worker và trả 401 khi bearer token sai", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");

    const response = await handler(request("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(worker).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("chạy worker khi bearer token hợp lệ", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");

    const response = await handler(request("Bearer expected-secret"));

    expect(response.status).toBe(200);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(await response.json()).toHaveProperty("data");
  });
});
