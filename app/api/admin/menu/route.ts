import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMenuSchema } from "@/lib/validations/menu";
import { uploadMenuImage } from "@/lib/storage";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// ── Types ───────────────────────────────────────────────────────────────────

type MenuItemWithRelations = Prisma.MenuItemGetPayload<{
  include: {
    sizes: true;
    matchaPowder: { select: { id: true; name: true; type: true } };
    defaultPowder: { select: { id: true; name: true; type: true } };
    fusionAllowedPowders: {
      include: { matchaPowder: { select: { id: true; is_available: true } } };
    };
  };
}>;

// ── Helper ──────────────────────────────────────────────────────────────────

const SIZE_ORDER: Record<string, number> = { M: 0, L: 1, XL: 2 };

/** Formats a Prisma MenuItem row into the AdminMenuItem API shape. */
function formatAdminMenuItem(
  item: MenuItemWithRelations,
  milkMlMap: Record<string, number>
) {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    category: item.category,
    is_seasonal: item.is_seasonal,
    image_url: item.image_url ?? null,
    is_available: item.is_available,
    sort_order: item.sort_order,
    base_liquid_note: item.base_liquid_note ?? null,
    custom_powder_grams: item.custom_powder_grams ?? null,
    updated_at: item.updated_at,
    // Latte
    matcha_powder_id: item.matcha_powder_id ?? null,
    powder: item.matchaPowder ?? null,
    // Fusion
    default_powder_id: item.default_powder_id ?? null,
    default_powder: item.defaultPowder ?? null,
    allowed_powder_ids: item.fusionAllowedPowders
      .filter((fp) => fp.matchaPowder.is_available)
      .map((fp) => fp.powder_id),
    // Sizes — all 3 rows including null base_price_vnd
    sizes: item.sizes
      .map((s) => ({
        size: s.size,
        base_price_vnd: s.base_price_vnd,
        milk_ml: milkMlMap[s.size] ?? 0,
      }))
      .sort((a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size]),
  };
}

const INCLUDE = {
  sizes: { orderBy: { size: "asc" as const } },
  matchaPowder: { select: { id: true, name: true, type: true } },
  defaultPowder: { select: { id: true, name: true, type: true } },
  fusionAllowedPowders: {
    include: {
      matchaPowder: { select: { id: true, is_available: true } },
    },
  },
} satisfies Prisma.MenuItemInclude;

// ── GET ─────────────────────────────────────────────────────────────────────

/** GET /api/admin/menu — all items including unavailable. ADMIN only. */
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  try {
    const [items, defaultSizeConfigs] = await Promise.all([
      prisma.menuItem.findMany({
        orderBy: [{ category: "asc" }, { sort_order: "asc" }],
        include: INCLUDE,
      }),
      prisma.defaultSizeConfig.findMany(),
    ]);

    const milkMlMap: Record<string, number> = {};
    for (const c of defaultSizeConfigs) milkMlMap[c.size] = c.milk_ml;

    const latte: ReturnType<typeof formatAdminMenuItem>[] = [];
    const fusion: ReturnType<typeof formatAdminMenuItem>[] = [];
    let maxUpdatedAt = new Date(0);

    for (const item of items) {
      if (item.updated_at > maxUpdatedAt) maxUpdatedAt = item.updated_at;
      const formatted = formatAdminMenuItem(item, milkMlMap);
      if (item.category === "latte") latte.push(formatted);
      else fusion.push(formatted);
    }

    return NextResponse.json({
      data: {
        updated_at: maxUpdatedAt.toISOString(),
        latte,
        fusion,
      },
    });
  } catch (err) {
    console.error("[GET /api/admin/menu]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

/** POST /api/admin/menu — create menu item. ADMIN only. */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  try {
    const formData = await req.formData();

    // ── Parse form fields ───────────────────────────────────────────────────
    const raw: Record<string, unknown> = {
      name: formData.get("name"),
      description: formData.get("description") || null,
      category: formData.get("category"),
      is_available: formData.get("is_available") !== "false",
      is_seasonal: formData.get("is_seasonal") === "true",
      sort_order: formData.get("sort_order") ? Number(formData.get("sort_order")) : 0,
      matcha_powder_id: formData.get("matcha_powder_id") && /^[0-9a-fA-F]{8}-/.test(formData.get("matcha_powder_id") as string) 
        ? formData.get("matcha_powder_id") as string 
        : null,
      default_powder_id: formData.get("default_powder_id") && /^[0-9a-fA-F]{8}-/.test(formData.get("default_powder_id") as string)
        ? formData.get("default_powder_id") as string 
        : null,
      base_liquid_note: formData.get("base_liquid_note") || null,
    };

    console.log("[POST /api/admin/menu] RAW DATA:", JSON.stringify(raw, null, 2));

    const sizesStr = formData.get("sizes") as string | null;
    if (!sizesStr)
      return NextResponse.json({ error: "sizes là bắt buộc", code: "VALIDATION_ERROR" }, { status: 400 });
    try {
      raw.sizes = JSON.parse(sizesStr);
    } catch {
      return NextResponse.json(
        { error: "Định dạng sizes không hợp lệ (phải là JSON)", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const cpgStr = formData.get("custom_powder_grams") as string | null;
    if (cpgStr) {
      try {
        raw.custom_powder_grams = JSON.parse(cpgStr);
      } catch {
        return NextResponse.json(
          { error: "Định dạng custom_powder_grams không hợp lệ", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
    }

    // ── Zod validation ──────────────────────────────────────────────────────
    const validation = createMenuSchema.safeParse(raw);
    if (!validation.success) {
      console.error("[POST /api/admin/menu] Validation error:", JSON.stringify(validation.error.issues, null, 2));
      return NextResponse.json(
        { 
          error: validation.error.issues[0].message, 
          code: "VALIDATION_ERROR",
          details: { issues: validation.error.issues }
        },
        { status: 400 }
      );
    }
    const validData = validation.data;

    // ── Check uniqueness of powder ──────────────────────────────────────────
    if (validData.category === "latte" && validData.matcha_powder_id) {
      const existing = await prisma.menuItem.findUnique({
        where: { matcha_powder_id: validData.matcha_powder_id },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Loại bột này đã được sử dụng cho một món Latte khác", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
    }

    // ── Image upload ────────────────────────────────────────────────────────
    let image_url: string | null = null;
    const imageFile = formData.get("image") as File | null;
    if (imageFile instanceof File && imageFile.size > 0) {
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(imageFile.type))
        return NextResponse.json(
          { error: "Định dạng ảnh không hỗ trợ (JPEG, PNG, WEBP)", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      if (imageFile.size > 5 * 1024 * 1024)
        return NextResponse.json(
          { error: "Ảnh quá lớn (tối đa 5MB)", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      image_url = await uploadMenuImage(`${Date.now()}-${imageFile.name}`, buffer, imageFile.type);
    }

    // ── DB write — 1 menu_item + 3 menu_item_sizes in one transaction ───────
    const [createdItem, defaultSizeConfigs] = await Promise.all([
      prisma.$transaction(async (tx) => {
        const item = await tx.menuItem.create({
          data: {
            name: validData.name,
            description: validData.description ?? null,
            category: validData.category,
            is_available: validData.is_available,
            is_seasonal: validData.is_seasonal,
            sort_order: validData.sort_order,
            image_url,
            custom_powder_grams: validData.custom_powder_grams ?? undefined,
            // TS narrows correctly after discriminatedUnion parse — no casting needed
            base_liquid_note:
              validData.category === "fusion" ? (validData.base_liquid_note ?? null) : null,
            matcha_powder_id:
              validData.category === "latte" ? (validData.matcha_powder_id ?? null) : null,
            default_powder_id:
              validData.category === "fusion" ? (validData.default_powder_id ?? null) : null,
          },
        });

        await tx.menuItemSize.createMany({
          data: validData.sizes.map((s) => ({
            menu_item_id: item.id,
            size: s.size,
            base_price_vnd: s.base_price_vnd,
          })),
        });

        // Re-fetch with full include to return correct AdminMenuItem shape
        return tx.menuItem.findUniqueOrThrow({
          where: { id: item.id },
          include: INCLUDE,
        });
      }, { maxWait: 10000, timeout: 15000 }),
      prisma.defaultSizeConfig.findMany(),
    ]);

    const milkMlMap: Record<string, number> = {};
    for (const c of defaultSizeConfigs) milkMlMap[c.size] = c.milk_ml;

    return NextResponse.json({ data: formatAdminMenuItem(createdItem, milkMlMap) }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/menu]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
