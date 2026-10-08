import { describe, expect, it } from "vitest";
import { classifyLoginIdentifier } from "@/src/lib/utils/loginIdentifier";
describe("Phân loại điện thoại đăng nhập — APPLICATION_LOGIC", () => {
  it.each(["0912345678", "+84912345678", "84912345678", "091-234-5678", "+840912345678"])("nhận diện %s và trả dạng nội địa", (input) => {
    expect(classifyLoginIdentifier(input)).toEqual({ kind: "phone", value: "0912345678" });
  });
  it("Instagram có dấu @ và chữ không bị chuyển thành phone", () => {
    expect(classifyLoginIdentifier("@0912345678")).toEqual({ kind: "instagram", value: "0912345678" });
    expect(classifyLoginIdentifier("ca.0912345678")).toEqual({ kind: "instagram", value: "ca.0912345678" });
  });
});
