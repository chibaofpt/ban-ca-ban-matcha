import { describe, expect, it } from "vitest";
import { mergeVisibleMenuOrder, moveVisibleMenuItem } from "@/src/utils/menuReorder";

const a = { id: "a", is_available: true };
const hidden = { id: "hidden", is_available: false };
const b = { id: "b", is_available: true };

describe("menuReorder", () => {
  it("giữ nguyên slot món tạm ẩn khi kéo trong bộ lọc đang bán", () => {
    expect(mergeVisibleMenuOrder([a, hidden, b], [b, a], (item) => item.is_available))
      .toEqual([b, hidden, a]);
  });

  it("chuyển món đến vị trí được chọn trong các món đang nhìn thấy", () => {
    expect(moveVisibleMenuItem([a, hidden, b], "b", "a", (item) => item.is_available))
      .toEqual([b, hidden, a]);
  });
});
