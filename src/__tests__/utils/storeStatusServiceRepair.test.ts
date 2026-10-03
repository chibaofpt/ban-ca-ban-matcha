import { describe, expect, it } from "vitest";

import { parseStoreStatusResponse } from "@/src/services/storeStatusService";

const validStatus = {
  is_open: true,
  reason: "OPEN",
  closure_note: null,
  today_schedule: [{ slot: 1, open_time: "08:00", close_time: "22:00" }],
  weekly_schedule: [{
    day_of_week: 1,
    slots: [{ slot: 1, open_time: "08:00", close_time: "22:00" }],
  }],
};

describe("hợp đồng trạng thái cửa hàng", () => {
  it("giữ DTO hợp lệ sau khi xác minh envelope", () => {
    expect(parseStoreStatusResponse(validStatus)).toEqual(validStatus);
  });

  it("từ chối trạng thái thiếu trường bắt buộc thay vì đóng cửa giả", () => {
    expect(() => parseStoreStatusResponse({ is_open: false, reason: "UNKNOWN" })).toThrow(
      "Phản hồi trạng thái cửa hàng không hợp lệ",
    );
  });
});
