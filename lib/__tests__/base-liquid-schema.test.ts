import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFusionMenuSchema } from "@/lib/validations/menu";
import { customerOrderItemSchema } from "@/lib/validations/order";
import { createMilkTypeSchema, updateMilkTypeSchema } from "@/lib/validations/milkType";
import {
  buildMenuItemSizeUpdate,
  isAvailabilityOnlyMenuUpdate,
} from "@/lib/adminMenuUpdate";

const uuid = "11111111-1111-4111-8111-111111111111";
const sizes = ["SMALL", "MEDIUM", "LARGE"].map((size) => ({
  size,
  base_price_vnd: 50_000,
  base_liquid_ml: null,
}));

describe("Validation cấu hình Base Liquid", () => {
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

describe("Kiến trúc migration Base Liquid", () => {
  it("có bảng allowed, volume override, index và RLS", () => {
    const migrationRoot = join(process.cwd(), "prisma", "migrations");
    const entries = readFileSync(join(migrationRoot, "migration_lock.toml"), "utf8");
    expect(entries).toContain("postgresql");

    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(schema).toContain("model MenuItemAllowedBaseLiquid");
    expect(schema).toContain("base_liquid_ml");
    expect(schema).toMatch(/model OrderItem[\s\S]*base_liquid_ml\s+Int\?/);

    const migration = readFileSync(
      join(migrationRoot, "20260815121000_add_menu_base_liquids", "migration.sql"),
      "utf8",
    );
    expect(migration).toContain('ALTER TABLE public."order_items"');
    expect(migration).toContain('ADD COLUMN "base_liquid_ml" INTEGER');
    expect(migration).toContain('uniq_milk_type_single_default');
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
