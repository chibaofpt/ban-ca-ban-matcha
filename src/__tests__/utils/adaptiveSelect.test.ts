import { describe, expect, it } from "vitest";
import {
  filterAdaptiveOptions,
  toggleAdaptiveValue,
  type AdaptiveSelectOption,
} from "@/src/lib/utils/adaptiveSelect";

const OPTIONS: AdaptiveSelectOption[] = [
  { value: "matcha", label: "Matcha sữa" },
  { value: "dao", label: "Trà đào" },
  { value: "seasonal", label: "Món theo mùa", description: "Seasonal" },
];

describe("AdaptiveSelect dùng chung", () => {
  it("tìm kiếm không phân biệt dấu và chữ hoa", () => {
    expect(filterAdaptiveOptions(OPTIONS, "TRA DAO").map((option) => option.value)).toEqual(["dao"]);
  });

  it("tìm cả mô tả phụ", () => {
    expect(filterAdaptiveOptions(OPTIONS, "seasonal").map((option) => option.value)).toEqual([
      "seasonal",
    ]);
  });

  it("single select luôn thay thế lựa chọn cũ", () => {
    expect(toggleAdaptiveValue(["matcha"], "dao", false)).toEqual(["dao"]);
  });

  it("multi select thêm và bỏ đúng giá trị", () => {
    expect(toggleAdaptiveValue(["matcha"], "dao", true)).toEqual(["matcha", "dao"]);
    expect(toggleAdaptiveValue(["matcha", "dao"], "matcha", true)).toEqual(["dao"]);
  });
});
