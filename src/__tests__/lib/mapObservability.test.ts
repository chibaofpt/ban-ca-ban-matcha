import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

describe("Map telemetry an toàn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("chỉ gửi allowlist và dedupe cùng category trong một session", async () => {
    const { recordMapRendererDiagnostic } = await import("@/src/lib/observability");
    const resource = {
      category: "resource_error" as const,
      durationBucket: "8-15s" as const,
      fallback: "search" as const,
      fatal: false,
      phase: "initial_load" as const,
      renderer: "maplibre" as const,
    };

    recordMapRendererDiagnostic(resource);
    recordMapRendererDiagnostic(resource);
    recordMapRendererDiagnostic({
      ...resource,
      category: "hard_timeout",
      durationBucket: ">15s",
      fatal: true,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledOnce();
    expect(Sentry.captureMessage).toHaveBeenCalledOnce();
    const serialized = JSON.stringify([
      vi.mocked(Sentry.addBreadcrumb).mock.calls,
      vi.mocked(Sentry.captureMessage).mock.calls,
    ]);
    expect(serialized).toContain("resource_error");
    expect(serialized).toContain("hard_timeout");
    expect(serialized).not.toMatch(/api_key|https?:|latitude|longitude|tile-key/i);
  });
});
