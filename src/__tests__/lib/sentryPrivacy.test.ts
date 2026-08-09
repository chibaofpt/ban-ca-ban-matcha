import { describe, expect, it } from "vitest";
import {
  sanitizeClientBreadcrumb,
  sanitizeClientEvent,
} from "@/src/lib/sentryPrivacy";

describe("Sentry privacy phía trình duyệt", () => {
  it("xóa query và fragment khỏi URL trong breadcrumb fetch", () => {
    const result = sanitizeClientBreadcrumb({
      category: "fetch",
      message: "GET https://tiles.goong.io/tile.pbf?api_key=message-secret#fragment",
      data: {
        url: "https://tiles.goong.io/tile.pbf?api_key=data-secret#fragment",
        status_code: 200,
      },
    });

    expect(result.message).toBe("GET https://tiles.goong.io/tile.pbf");
    expect(result.data).toEqual({
      url: "https://tiles.goong.io/tile.pbf",
      status_code: 200,
    });
  });

  it("xóa request metadata và làm sạch exception, tags", () => {
    const result = sanitizeClientEvent({
      request: {
        url: "https://example.com/menu?phone=0901234567#delivery",
        data: { address: "123 Secret Street" },
        headers: { authorization: "Bearer secret" },
        cookies: { session: "secret" },
        query_string: "token=secret",
      },
      message: "Map failed https://tiles.goong.io/style.json?api_key=map-secret",
      exception: {
        values: [{
          type: "Error",
          value: "Bearer token-secret 0901234567; address=12 Nguyen Hue; coordinates=10.9901,106.6602",
        }],
      },
      tags: {
        request_url: "https://example.com/path?token=secret#fragment",
        user_id: "internal-id",
      },
    });

    const serialized = JSON.stringify(result);
    expect(result.request).toEqual({ url: "https://example.com/menu" });
    expect(serialized).not.toContain("map-secret");
    expect(serialized).not.toContain("token-secret");
    expect(serialized).not.toContain("0901234567");
    expect(serialized).not.toContain("12 Nguyen Hue");
    expect(serialized).not.toContain("10.9901");
    expect(result.tags).toEqual({ request_url: "https://example.com/path", user_id: "[Filtered]" });
  });
});
