import { describe, expect, it } from "vitest";
import { createAddonGroupSchema } from "@/lib/validations/addonGroup";

describe("Addon contract opt-in", () => {
  it("chấp nhận SELECTOR optional mà không có option mặc định", () => {
    const result = createAddonGroupSchema.safeParse({
      name: "Kem",
      description: null,
      max_select: 1, is_dynamic_gram: false,
      max_quantity: null,
      is_active: true,
      options: [
        {
          label: "Nửa viên kem",
          price_vnd: 20_000,
          sort_order: 0,
          gram_value: null,
          is_active: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty("is_required");
    expect(result.data).not.toHaveProperty("min_quantity");
    expect(result.data.options[0]).not.toHaveProperty("is_default");
    expect(result.data.options[0].is_active).toBe(true);
  });

  it("chấp nhận max_select=1 với nhiều option (single-select)", () => {
    const result = createAddonGroupSchema.safeParse({
      name: "Đá dừa",
      max_select: 1, is_dynamic_gram: false,
      max_quantity: null,
      is_active: true,
      options: [
        { label: "Đá dừa", price_vnd: 5_000, sort_order: 0, gram_value: null, is_active: true },
        { label: "Đá dừa lớn", price_vnd: 10_000, sort_order: 1, gram_value: null, is_active: true },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("chấp nhận max_select=3 (multi-select) với một option", () => {
    const result = createAddonGroupSchema.safeParse({
      name: "Shot",
      max_select: 3, is_dynamic_gram: false,
      max_quantity: null,
      is_active: true,
      options: [
        { label: "Shot", price_vnd: 5_000, sort_order: 0, gram_value: null, is_active: true },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("từ chối group trộn option gram động và giá cố định", () => {
    const result = createAddonGroupSchema.safeParse({
      name: "Extra Matcha",
      max_select: 1, is_dynamic_gram: false,
      max_quantity: null,
      is_active: true,
      options: [
        { label: "1g", price_vnd: 0, sort_order: 0, gram_value: 1, is_active: true },
        { label: "Kem", price_vnd: 20_000, sort_order: 1, gram_value: null, is_active: true },
      ],
    });

    expect(result.success).toBe(false);
  });
});
