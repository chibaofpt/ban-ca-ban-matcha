import { describe, expect, it } from "vitest";
import {
  resolveEffectiveGram,
  type DefaultSizeEntry,
  type PowderSizeEntry,
  type RawOrderItem,
} from "@/lib/reports/reportAggregation";

const defaults: DefaultSizeEntry[] = [
  { size: "SMALL", milk_ml: 130, powder_gram: 3.5 },
  { size: "MEDIUM", milk_ml: 200, powder_gram: 4.5 },
  { size: "LARGE", milk_ml: 300, powder_gram: 8 },
];
const meyumiOverrides: PowderSizeEntry[] = [
  { powder_id: "powder-meyumi", size: "SMALL", grams: 5 },
  { powder_id: "powder-meyumi", size: "MEDIUM", grams: 6 },
];

type GramCase = {
  name: string;
  size: RawOrderItem["size"];
  selectedPowderId: string | null;
  menuPowderId: string | null;
  customGrams: Record<string, number> | null;
  overrides: PowderSizeEntry[];
  expected: number;
};

const cases: GramCase[] = [
  {
    name: "dùng gram mặc định cho size nhỏ khi không có override",
    size: "SMALL", selectedPowderId: "powder-meyumi", menuPowderId: "powder-meyumi",
    customGrams: null, overrides: [], expected: 3.5,
  },
  {
    name: "dùng gram mặc định cho size vừa",
    size: "MEDIUM", selectedPowderId: "powder-meyumi", menuPowderId: "powder-meyumi",
    customGrams: null, overrides: [], expected: 4.5,
  },
  {
    name: "dùng gram mặc định cho size lớn",
    size: "LARGE", selectedPowderId: "powder-meyumi", menuPowderId: "powder-meyumi",
    customGrams: null, overrides: [], expected: 8,
  },
  {
    name: "ưu tiên cấu hình gram theo bột và size",
    size: "SMALL", selectedPowderId: "powder-meyumi", menuPowderId: "powder-meyumi",
    customGrams: null, overrides: meyumiOverrides, expected: 5,
  },
  {
    name: "về mặc định khi chỉ bột khác có override",
    size: "SMALL", selectedPowderId: "powder-hana", menuPowderId: "powder-hana",
    customGrams: null, overrides: meyumiOverrides, expected: 3.5,
  },
  {
    name: "về mặc định khi size lớn không có override",
    size: "LARGE", selectedPowderId: "powder-meyumi", menuPowderId: "powder-meyumi",
    customGrams: null, overrides: meyumiOverrides, expected: 8,
  },
  {
    name: "ưu tiên gram riêng của món hơn cấu hình bột và mặc định",
    size: "SMALL", selectedPowderId: "powder-meyumi", menuPowderId: "powder-meyumi",
    customGrams: { SMALL: 7, MEDIUM: 9, LARGE: 12 }, overrides: meyumiOverrides, expected: 7,
  },
  {
    name: "dùng gram riêng của món cho size vừa",
    size: "MEDIUM", selectedPowderId: "powder-meyumi", menuPowderId: "powder-meyumi",
    customGrams: { SMALL: 7, MEDIUM: 9, LARGE: 12 }, overrides: meyumiOverrides, expected: 9,
  },
  {
    name: "về mặc định khi gram riêng và override đều thiếu size lớn",
    size: "LARGE", selectedPowderId: "powder-meyumi", menuPowderId: "powder-meyumi",
    customGrams: { SMALL: 7 }, overrides: meyumiOverrides, expected: 8,
  },
  {
    name: "dùng bột được chọn cho món fusion",
    size: "SMALL", selectedPowderId: "powder-meyumi", menuPowderId: null,
    customGrams: null, overrides: meyumiOverrides, expected: 5,
  },
  {
    name: "dùng bột mặc định của món khi chưa chọn bột",
    size: "SMALL", selectedPowderId: null, menuPowderId: "powder-meyumi",
    customGrams: null, overrides: meyumiOverrides, expected: 5,
  },
  {
    name: "trả 0 khi cả hai nguồn bột đều null",
    size: "SMALL", selectedPowderId: null, menuPowderId: null,
    customGrams: null, overrides: [], expected: 0,
  },
];

describe("resolveEffectiveGram — thứ tự ưu tiên và fallback", () => {
  it.each(cases)("$name", ({ size, selectedPowderId, menuPowderId, customGrams, overrides, expected }) => {
    const item: Pick<RawOrderItem, "size" | "selected_powder_id" | "menuItem"> = {
      size,
      selected_powder_id: selectedPowderId,
      menuItem: {
        name: "Matcha",
        category: menuPowderId ? "latte" : "fusion",
        matcha_powder_id: menuPowderId,
        custom_powder_grams: customGrams,
      },
    };
    expect(resolveEffectiveGram(item, overrides, defaults)).toBe(expected);
  });
});
