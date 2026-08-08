import { describe, expect, it } from "vitest";
import {
  buildPageSecurityHeaders,
  buildContentSecurityPolicy,
  getPermissionsPolicy,
  getStaticSecurityHeaders,
} from "@/lib/securityHeaders";

describe("HTTP security headers", () => {
  it("trả về các header nền tảng và chỉ bật HSTS ở Production", () => {
    const preview = getStaticSecurityHeaders(false);
    const production = getStaticSecurityHeaders(true);

    expect(preview).toEqual(expect.arrayContaining([
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]));
    expect(preview.some(({ key }) => key === "Strict-Transport-Security")).toBe(false);
    expect(production).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  });

  it("giới hạn camera và geolocation theo đúng nhóm đường dẫn", () => {
    expect(getPermissionsPolicy("/staff/scan")).toBe(
      "camera=(self), microphone=(), geolocation=()",
    );
    expect(getPermissionsPolicy("/staff/orders/active")).toBe(
      "camera=(self), microphone=(), geolocation=()",
    );
    expect(getPermissionsPolicy("/menu")).toBe(
      "camera=(), microphone=(), geolocation=(self)",
    );
    expect(getPermissionsPolicy("/profile/addresses")).toBe(
      "camera=(), microphone=(), geolocation=(self)",
    );
    expect(getPermissionsPolicy("/faq")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });
});

describe("Content Security Policy dùng nonce", () => {
  it("cho phép Sentry, MapLibre, Goong và Supabase mà không nới script policy", () => {
    const policy = buildContentSecurityPolicy("fixed-nonce");
    const scriptDirective = policy.split(";").find((part) => part.trim().startsWith("script-src"));

    expect(scriptDirective).toContain("'nonce-fixed-nonce'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("https://*.supabase.co");
    expect(policy).toContain("https://*.goong.io");
    expect(policy).toContain("https://*.ingest.sentry.io");
    expect(policy).toContain("worker-src 'self' blob:");
  });

  it("mặc định report-only và truyền cùng nonce vào request lẫn response", () => {
    const headers = buildPageSecurityHeaders("/menu", "fixed-nonce", {});

    expect(headers.request.get("x-nonce")).toBe("fixed-nonce");
    expect(headers.request.get("content-security-policy-report-only")).toBe(
      headers.response.get("Content-Security-Policy-Report-Only"),
    );
    expect(headers.response.get("Permissions-Policy")).toContain("geolocation=(self)");
  });

  it("chỉ enforce hoặc tắt CSP khi CSP_MODE được cấu hình rõ ràng", () => {
    const enforced = buildPageSecurityHeaders("/", "nonce", { CSP_MODE: "enforce" });
    const disabled = buildPageSecurityHeaders("/", "nonce", { CSP_MODE: "off" });

    expect(enforced.response.has("Content-Security-Policy")).toBe(true);
    expect(enforced.response.has("Content-Security-Policy-Report-Only")).toBe(false);
    expect(disabled.response.has("Content-Security-Policy")).toBe(false);
    expect(disabled.request.has("x-nonce")).toBe(false);
  });
});
