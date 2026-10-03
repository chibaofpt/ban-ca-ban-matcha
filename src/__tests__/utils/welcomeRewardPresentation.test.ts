import { describe, expect, it } from "vitest";
import { toWelcomeRewardAnchorPercent } from "@/src/utils/welcomeRewardPresentation";

describe("tọa độ hiển thị quà chào mừng", () => {
  it("đổi anchor chuẩn hóa 0..1 thành phần trăm CSS", () => {
    expect(toWelcomeRewardAnchorPercent(0)).toBe("0%");
    expect(toWelcomeRewardAnchorPercent(0.42)).toBe("42%");
    expect(toWelcomeRewardAnchorPercent(1)).toBe("100%");
  });
});
