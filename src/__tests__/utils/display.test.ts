import { describe, expect, it } from "vitest";
import { formatSizeLabel } from "@/src/utils/display";

describe("nhãn size hiển thị", () => {
  it("chuyển enum size thành tên Cá tương ứng", () => {
    expect(formatSizeLabel("SMALL")).toBe("Cá con");
    expect(formatSizeLabel("MEDIUM")).toBe("Cá vừa");
    expect(formatSizeLabel("LARGE")).toBe("Cá Lớn");
  });

  it("giữ nguyên giá trị size chưa biết để không che mất dữ liệu lỗi", () => {
    expect(formatSizeLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});
