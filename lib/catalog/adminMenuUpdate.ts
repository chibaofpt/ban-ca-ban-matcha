import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { UpdateMenuInput } from "@/lib/validations/menu";
import { Prisma } from "@prisma/client";

type PowderField = "matcha_powder_id" | "default_powder_id" | "allowed_powder_ids";
type PowderUpdate = Pick<UpdateMenuInput, PowderField>;

function submittedPowderReferences(category: string, data: PowderUpdate): Array<[PowderField, string[]]> {
  if (category === "latte") return [["matcha_powder_id", data.matcha_powder_id ? [data.matcha_powder_id] : []]];
  if (category !== "fusion") return [];
  return [
    ["default_powder_id", data.default_powder_id ? [data.default_powder_id] : []],
    ["allowed_powder_ids", [...new Set(data.allowed_powder_ids ?? [])]],
  ];
}

function missingPowderResponse(field: PowderField, powderIds: string[]): NextResponse {
  const messages: Record<PowderField, string> = {
    matcha_powder_id: "Loại bột Latte không còn tồn tại",
    default_powder_id: "Loại bột mặc định không còn tồn tại",
    allowed_powder_ids: "Danh sách bột được đổi có lựa chọn không còn tồn tại",
  };
  return NextResponse.json({
    error: messages[field], code: "BUSINESS_RULE_VIOLATION",
    details: { reason: "POWDER_REFERENCE_NOT_FOUND", field, powder_ids: powderIds },
  }, { status: 422 });
}

/** Validate submitted applicable powder references, including inactive catalogue rows. */
export async function validateMenuPowderReferences(category: string, data: PowderUpdate): Promise<NextResponse | null> {
  const references = submittedPowderReferences(category, data);
  const ids = [...new Set(references.flatMap(([, powderIds]) => powderIds))];
  if (ids.length === 0) return null;
  const powders = await prisma.matchaPowder.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const existingIds = new Set(powders.map((powder) => powder.id));
  for (const [field, powderIds] of references) {
    const missingIds = powderIds.filter((powderId) => !existingIds.has(powderId));
    if (missingIds.length > 0) return missingPowderResponse(field, missingIds);
  }
  return null;
}

/** Map only identified powder foreign keys from the submitted menu write to a business error. */
export function menuPowderForeignKeyError(error: unknown, category: string, data: PowderUpdate): NextResponse | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2003") return null;
  const fieldName = error.meta?.field_name;
  if (typeof fieldName !== "string") return null;
  const key = fieldName.replace(/ \(index\)$/, "");
  const references = submittedPowderReferences(category, data);
  for (const [field, powderIds] of references) {
    if (powderIds.length === 0) continue;
    const constraint = field === "allowed_powder_ids"
      ? "fusion_allowed_powder_powder_id_fkey"
      : `menu_items_${field}_fkey`;
    const columnMatches = field === "allowed_powder_ids"
      ? key === "powder_id" && error.meta?.modelName === "FusionAllowedPowder"
      : key === field && (!error.meta?.modelName || error.meta.modelName === "MenuItem");
    if (key === constraint || columnMatches) return missingPowderResponse(field, powderIds);
  }
  return null;
}

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
export function asMenuStorageCategory(category: string): "latte" | "fusion" | "extras" {
  if (category === "latte" || category === "fusion" || category === "extras") return category;
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
