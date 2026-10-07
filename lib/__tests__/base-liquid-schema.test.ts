import { describe, expect, it } from "vitest";
import { createFusionMenuSchema, updateMenuSchema } from "@/lib/validations/menu";
import { customerOrderItemSchema } from "@/lib/validations/order";
import { createMilkTypeSchema, updateMilkTypeSchema } from "@/lib/validations/milkType";
import {
  buildMenuItemSizeUpdate,
  isAvailabilityOnlyMenuUpdate,
} from "@/lib/catalog/adminMenuUpdate";

const uuid = "11111111-1111-4111-8111-111111111111";
const sizes = ["SMALL", "MEDIUM", "LARGE"].map((size) => ({
  size,
  base_price_vnd: 50_000,
  base_liquid_ml: null,
}));

describe("Validation cấu hình Base Liquid", () => {
  it("chấp nhận payload cập nhật Add-on với danh sách size rỗng", () => {
    expect(updateMenuSchema.safeParse({
      category: "extras",
      unit_price_vnd: 20_000,
      sizes: [],
    }).success).toBe(true);
  });

  it("không cho lưu Fusion nếu thiếu default Base Liquid", () => {
    const result = createFusionMenuSchema.safeParse({
      category: "fusion",
      name: "Fusion A",
      sizes,
    });
    expect(result.success).toBe(false);
  });

  it("chấp nhận Fusion có default và allowed Base Liquid", () => {
    const result = createFusionMenuSchema.safeParse({
      category: "fusion",
      name: "Fusion A",
      sizes,
      default_base_liquid_id: uuid,
      allowed_base_liquid_ids: [uuid],
    });
    expect(result.success).toBe(true);
  });

  it("order chấp nhận field mới selected_base_liquid_id", () => {
    const result = customerOrderItemSchema.safeParse({
      menu_item_id: uuid,
      quantity: 1,
      size: "SMALL",
      selected_base_liquid_id: uuid,
      client_price_vnd: 50_000,
    });
    expect(result.success).toBe(true);
  });
});

describe("Invariant mutation Base Liquid", () => {
  it("không cho tạo hoặc cập nhật default thành inactive", () => {
    expect(createMilkTypeSchema.safeParse({
      name: "Sữa lỗi",
      price_per_ml: 40,
      is_default: true,
      is_active: false,
    }).success).toBe(false);
    expect(updateMilkTypeSchema.safeParse({
      is_default: true,
      is_active: false,
    }).success).toBe(false);
  });

  it("nhận diện quick toggle để không ép Fusion legacy phải có default", () => {
    expect(isAvailabilityOnlyMenuUpdate({ is_available: false })).toBe(true);
    expect(isAvailabilityOnlyMenuUpdate({ is_available: true, name: "A" })).toBe(false);
  });

  it("không ghi null đè volume override khi payload size bỏ qua base_liquid_ml", () => {
    expect(buildMenuItemSizeUpdate({
      size: "SMALL",
      base_price_vnd: 50_000,
    })).toEqual({ base_price_vnd: 50_000 });
    expect(buildMenuItemSizeUpdate({
      size: "SMALL",
      base_price_vnd: 50_000,
      base_liquid_ml: null,
    })).toEqual({ base_price_vnd: 50_000, base_liquid_ml: null });
  });
});
