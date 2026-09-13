import { describe, expect, it } from "vitest";
import { resolveAuthReturnTarget } from "@/src/utils/authReturnTarget";

describe("đích quay lại sau xác thực", () => {
  it("giữ đường dẫn local cùng query và hash", () => {
    expect(resolveAuthReturnTarget("/menu?tab=latte#top")).toBe("/menu?tab=latte#top");
  });

  it.each([
    null,
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%5Cevil.example",
    "/menu\u0000next",
    "javascript:alert(1)",
  ])("đưa đích không an toàn %s về menu", (target) => {
    expect(resolveAuthReturnTarget(target)).toBe("/menu");
  });
});
