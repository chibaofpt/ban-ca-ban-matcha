import { describe, expect, it } from "vitest";

import { selectWeightedReward } from "@/lib/welcomeRewardSelection";

describe("Chọn phần thưởng theo tồn kho", () => {
  it.each([
    { roll: 0, expected: "rare" },
    { roll: 1, expected: "normal" },
    { roll: 3, expected: "normal" },
  ])("ánh xạ roll $roll vào interval nguyên", ({ roll, expected }) => {
    expect(selectWeightedReward([
      { id: "rare", remaining: 1 },
      { id: "normal", remaining: 3 },
    ], roll).id).toBe(expected);
  });

  it("bỏ item hết hàng và từ chối roll ngoài tổng remaining", () => {
    expect(selectWeightedReward([
      { id: "empty", remaining: 0 },
      { id: "available", remaining: 2 },
    ], 1).id).toBe("available");
    expect(() => selectWeightedReward([{ id: "only", remaining: 1 }], 1)).toThrow(RangeError);
  });
});
