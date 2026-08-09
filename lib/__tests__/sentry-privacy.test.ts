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
    expect(result.request?.headers).toBeUndefined();
    expect(result.request?.data).toBeUndefined();
  });

  it("xóa metadata request và làm sạch URL lồng trong breadcrumb", () => {
    const result = sanitizeSentryEvent({
      request: {
        url: "https://example.com/menu?phone=0901234567#delivery",
        headers: { referer: "https://example.com/?token=secret", "x-real-ip": "10.0.0.1" },
        cookies: { session: "secret" },
        query_string: "phone=0901234567",
        env: { SERVER_SECRET: "secret" },
      },
      breadcrumbs: [{
        category: "fetch",
        data: {
          url: "https://tiles.goong.io/tile.pbf?api_key=map-secret#fragment",
          status_code: 200,
        },
      }],
    });

    expect(result.request).toEqual({ url: "https://example.com/menu" });
    expect(result.breadcrumbs?.[0]).toEqual({
      category: "fetch",
      data: { url: "https://tiles.goong.io/tile.pbf", status_code: 200 },
    });
    expect(JSON.stringify(result)).not.toContain("map-secret");
    expect(JSON.stringify(result)).not.toContain("10.0.0.1");
  });

  it("làm sạch message, exception và tags trước khi gửi", () => {
    const result = sanitizeSentryEvent({
      message: "Fetch https://tiles.goong.io/style.json?api_key=map-secret",
      exception: { values: [{ type: "Error", value: "Bearer token-secret +84901234567" }] },
      tags: {
        source_url: "https://example.com/path?token=secret#fragment",
        order_id: "internal-id",
      },
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("map-secret");
    expect(serialized).not.toContain("token-secret");
    expect(serialized).not.toContain("+84901234567");
    expect(result.tags).toEqual({ source_url: "https://example.com/path", order_id: "[Filtered]" });
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
