import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage,
}));

import {
  captureSecurityPolicyViolation,
  sanitizeSecurityPolicyViolation,
} from "@/src/lib/observability";

describe("Theo dõi vi phạm Content Security Policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chỉ giữ origin bị chặn và không giữ URL, query, source hay sample", () => {
    const result = sanitizeSecurityPolicyViolation({
      blockedURI: "https://tiles.goong.io/path?customer=secret",
      disposition: "report",
      effectiveDirective: "connect-src",
      statusCode: 200,
      documentURI: "https://shop.example/menu?phone=0901234567",
      sourceFile: "https://shop.example/_next/app.js?token=secret",
      sample: "customer address",
    });

    expect(result).toEqual({
      blockedOrigin: "https://tiles.goong.io",
      disposition: "report",
      effectiveDirective: "connect-src",
      statusCode: 200,
    });
    expect(JSON.stringify(result)).not.toContain("customer");
    expect(JSON.stringify(result)).not.toContain("0901234567");
  });

  it("gửi vi phạm đã làm sạch qua Sentry adapter", () => {
    captureSecurityPolicyViolation({
      blockedURI: "inline",
      disposition: "enforce",
      effectiveDirective: "script-src-elem",
      statusCode: 0,
    });

    expect(captureMessage).toHaveBeenCalledWith(
      "Content Security Policy violation",
      {
        level: "warning",
        contexts: {
          csp: {
            blockedOrigin: "inline",
            disposition: "enforce",
            effectiveDirective: "script-src-elem",
            statusCode: 0,
          },
        },
      },
    );
  });
});
