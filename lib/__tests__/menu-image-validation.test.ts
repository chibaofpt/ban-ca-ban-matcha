import { describe, expect, it } from "vitest";
import { createLatteWithPowderSchema } from "@/lib/validations/createLatteWithPowder";
import { createMenuSchema, updateMenuSchema } from "@/lib/validations/menu";

const sizes = [
  { size: "SMALL" as const, base_price_vnd: 50_000 },
  { size: "MEDIUM" as const, base_price_vnd: 60_000 },
  { size: "LARGE" as const, base_price_vnd: 70_000 },
];

describe("Validation tên file SEO cho ảnh menu", () => {
  it("create menu chấp nhận image_filename tùy chọn", () => {
    const result = createMenuSchema.safeParse({
      name: "Matcha Latte",
      category: "latte",
      sizes,
      image_filename: "matcha-latte",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.image_filename).toBe("matcha-latte");
  });

  it("update menu chấp nhận rename-only", () => {
    const result = updateMenuSchema.safeParse({ image_filename: "ten-moi" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.image_filename).toBe("ten-moi");
  });

  it("create latte cùng powder chấp nhận image_filename", () => {
    const result = createLatteWithPowderSchema.safeParse({
      name: "Matcha Latte",
      sizes,
      image_filename: "matcha-latte",
      new_powder: { name: "Powder", price_per_gram: 6_000 },
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.image_filename).toBe("matcha-latte");
  });

  it("từ chối slash, backslash và dot-dot", () => {
    for (const imageFilename of ["../secret", "folder/name", "folder\\name"]) {
      expect(updateMenuSchema.safeParse({ image_filename: imageFilename }).success).toBe(false);
    }
  });
});
