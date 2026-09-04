import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("static source contract — quyền riêng tư của log bảo mật", () => {
  it("Redis không ghi cache keys hoặc raw exception có thể chứa refresh token", () => {
    const source = readProjectFile("lib/redis.ts");
    expect(source).not.toContain("failed:', key");
    expect(source).not.toContain("failed:', keys");
    expect(source).not.toMatch(/console\.error\([^\n]*\berr\b/);
  });
  it("không ghi raw form hay log từng bước trong API tạo và cập nhật menu", () => {
    const createRoute = readProjectFile("app/api/admin/menu/route.ts");
    const updateRoute = readProjectFile("app/api/admin/menu/[id]/route.ts");

    expect(createRoute).not.toContain("RAW DATA");
    expect(createRoute).not.toContain("console.log");
    expect(updateRoute).not.toContain("[PUT] STEP");
    expect(updateRoute).not.toContain("console.log");
  });

  it("không ghi nguyên response body từ Goong", () => {
    const goongAdapter = readProjectFile("lib/goong.ts");

    expect(goongAdapter).not.toContain("await res.text()");
    expect(goongAdapter).not.toContain("Error response:");
  });

  it("delivery và push routes không ghi raw exception có thể chứa URL hoặc endpoint", () => {
    const routes = [
      "app/api/delivery/autocomplete/route.ts",
      "app/api/delivery/geocode/route.ts",
      "app/api/delivery/estimate/route.ts",
      "app/api/delivery/reverse-geocode/route.ts",
      "app/api/push/subscribe/route.ts",
      "app/api/push/unsubscribe/route.ts",
    ].map(readProjectFile);

    for (const route of routes) {
      expect(route).not.toContain("console.error");
      expect(route).toContain("captureServerException");
    }
  });

  it("background push không ghi raw exception từ adapter", () => {
    const orderRoute = readProjectFile("app/api/orders/route.ts");
    const confirmPaymentRoute = readProjectFile(
      "app/api/admin/orders/[id]/confirm-payment/route.ts",
    );

    expect(orderRoute).not.toContain('Failed to send push:", err');
    expect(confirmPaymentRoute).not.toContain('Failed to send push:", err');
  });
});
