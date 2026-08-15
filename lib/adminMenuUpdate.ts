import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Return true only for the compatibility quick-toggle payload. */
export function isAvailabilityOnlyMenuUpdate(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  return keys.length === 1 && keys[0] === "is_available";
}

/** Build an upsert update without clearing an omitted Base Liquid volume override. */
export function buildMenuItemSizeUpdate(input: {
  size: "SMALL" | "MEDIUM" | "LARGE";
  base_price_vnd: number | null;
  base_liquid_ml?: number | null;
}): { base_price_vnd: number | null; base_liquid_ml?: number | null } {
  return {
    base_price_vnd: input.base_price_vnd,
    ...(input.base_liquid_ml !== undefined && {
      base_liquid_ml: input.base_liquid_ml,
    }),
  };
}

/** Narrow a persisted menu category before using it in storage paths. */
export function asMenuStorageCategory(category: string): "latte" | "fusion" {
  if (category === "latte" || category === "fusion") return category;
  throw new Error("Invalid menu category");
}

/** Validate a replacement image before upload. */
export function validateMenuImageFile(image: File): NextResponse | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
    return NextResponse.json(
      { error: "Định dạng ảnh không hỗ trợ (JPEG, PNG, WEBP)", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  if (image.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Ảnh quá lớn (tối đa 5MB)", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  return null;
}

/** Ensure a Latte powder is not already assigned to a different menu item. */
export async function validateUniqueLattePowder(input: {
  itemId: string;
  category: string;
  currentPowderId: string | null;
  nextPowderId?: string | null;
}): Promise<NextResponse | null> {
  if (
    input.category !== "latte" ||
    !input.nextPowderId ||
    input.nextPowderId === input.currentPowderId
  ) return null;

  const used = await prisma.menuItem.findUnique({
    where: { matcha_powder_id: input.nextPowderId },
  });
  if (!used || used.id === input.itemId) return null;
  return NextResponse.json(
    {
      error: "Loại bột này đã được sử dụng cho một món Latte khác",
      code: "VALIDATION_ERROR",
    },
    { status: 400 },
  );
}
