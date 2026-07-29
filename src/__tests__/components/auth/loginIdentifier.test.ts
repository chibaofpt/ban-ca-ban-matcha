import { describe, expect, it } from "vitest";
import { classifyLoginIdentifier } from "@/src/lib/utils/loginIdentifier";

describe("Phân loại định danh đăng nhập", () => {
  it("nhận diện và làm sạch số điện thoại", () => {
    expect(classifyLoginIdentifier("091 234 5678")).toEqual({
      kind: "phone",
      value: "0912345678",
    });
  });

  it("nhận diện Instagram và bỏ @", () => {
    expect(classifyLoginIdentifier(" @Ban.Ca ")).toEqual({
      kind: "instagram",
      value: "ban.ca",
    });
  });

  it("@ ép username toàn số đi theo Instagram", () => {
    expect(classifyLoginIdentifier("@0912345678")).toEqual({
      kind: "instagram",
      value: "0912345678",
    });
  });
});
