import { describe, expect, it } from "vitest";
import { getHistoryTabHref, resolveHistoryTab } from "@/src/lib/utils/historyTab";

describe("historyTab — đồng bộ tab với URL", () => {
  it("chỉ nhận points, các giá trị khác fallback orders", () => {
    expect(resolveHistoryTab("points")).toBe("points");
    expect(resolveHistoryTab("orders")).toBe("orders");
    expect(resolveHistoryTab("voucher")).toBe("orders");
    expect(resolveHistoryTab(null)).toBe("orders");
  });

  it("tạo URL canonical cho từng tab", () => {
    expect(getHistoryTabHref("points")).toBe("/history?tab=points");
    expect(getHistoryTabHref("orders")).toBe("/history");
  });
});
