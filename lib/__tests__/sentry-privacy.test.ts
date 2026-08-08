import { describe, expect, it } from "vitest";
import {
  sanitizeBreadcrumbData,
  sanitizeSentryEvent,
} from "@/lib/sentryPrivacy";

describe("Sentry privacy scrubber", () => {
  it("xóa request body, cookie, authorization và query string", () => {
    const result = sanitizeSentryEvent({
      request: {
        url: "https://example.com/checkout?phone=0901234567&token=secret",
        headers: { authorization: "Bearer secret", cookie: "session=secret", accept: "json" },
        data: { delivery_address: "123 Secret Street", note: "ít đá" },
      },
    });

    expect(result.request?.url).toBe("https://example.com/checkout");
    expect(result.request?.headers).toEqual({ accept: "json" });
    expect(result.request?.data).toBeUndefined();
  });

  it("redact key nhạy cảm ở contexts và extra lồng nhau", () => {
    const result = sanitizeSentryEvent({
      extra: {
        phone_number: "+84901234567",
        nested: { qr_token: "qr-secret", safe_count: 2 },
      },
      contexts: { order: { user_id: "user-secret", status: "PENDING" } },
    });

    expect(result.extra).toEqual({
      phone_number: "[Filtered]",
      nested: { qr_token: "[Filtered]", safe_count: 2 },
    });
    expect(result.contexts).toEqual({
      order: { user_id: "[Filtered]", status: "PENDING" },
    });
  });

  it("breadcrumb chỉ giữ dữ liệu nghiệp vụ tổng quát", () => {
    expect(sanitizeBreadcrumbData({
      item_count: 2,
      order_type: "PICKUP",
      product_id: "product-secret",
      voucher_id: "voucher-secret",
      phone: "0901234567",
    })).toEqual({
      item_count: 2,
      order_type: "PICKUP",
      product_id: "[Filtered]",
      voucher_id: "[Filtered]",
      phone: "[Filtered]",
    });
  });
});
