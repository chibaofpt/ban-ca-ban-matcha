import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/src/utils/jsonLd";

describe("serializeJsonLd", () => {
  it("không cho dữ liệu quản trị đóng thẻ script JSON-LD", () => {
    const serialized = serializeJsonLd({
      name: "Matcha </script><script>alert('xss')</script>",
      description: "line\u2028separator\u2029end",
    });

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(serialized).toContain("\\u2028");
    expect(serialized).toContain("\\u2029");
    expect(JSON.parse(serialized)).toEqual({
      name: "Matcha </script><script>alert('xss')</script>",
      description: "line\u2028separator\u2029end",
    });
  });
});
