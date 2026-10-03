import { describe, expect, it } from "vitest";
import { formatCartMoney, formatKa, formatSizeLabel } from "@/src/utils/display";

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


describe("tiền hiển thị trong cart", () => {
  it.each([[0, "0 ká"], [999, "1 ká"], [1000, "1 ká"], [1001, "2 ká"], [35500, "36 ká"], [1000000, "1.000 ká"]])("chia 1000 và làm tròn lên: %i thành %s", (vnd, expected) => {
    expect(formatCartMoney(vnd)).toBe(expected);
  });

  it("giữ formatter ká hiện có cho consumer ngoài cart", () => {
    expect(formatKa(35500)).toBe("35,5 ká");
    expect(formatKa(35500, "floor")).toBe("35 ká");
  });
});
