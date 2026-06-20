import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateMenuSchema } from "@/lib/validations/menu";
import { uploadMenuImage } from "@/lib/storage";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// ── Shared include + helper (mirrors route.ts) ───────────────────────────────

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

const SIZE_ORDER: Record<string, number> = { M: 0, L: 1, XL: 2 };

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
    matcha_powder_id: item.matcha_powder_id ?? null,
    powder: item.matchaPowder ?? null,
    default_powder_id: item.default_powder_id ?? null,
    default_powder: item.defaultPowder ?? null,
    allowed_powder_ids: item.fusionAllowedPowders
      .filter((fp) => fp.matchaPowder.is_available)
      .map((fp) => fp.powder_id),
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

// ── PUT /api/admin/menu/[id] ─────────────────────────────────────────────────

/** PUT /api/admin/menu/[id] — update menu item. Accepts multipart/form-data OR application/json. ADMIN only. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;

  try {
    console.log("[PUT] STEP 1 — start, id:", id);
    // ── Detect Content-Type → parse body ──────────────────────────────────
    // Toggle availability sends JSON { is_available }
    // Form edit sends multipart/form-data — both go through this same route
    const contentType = req.headers.get("content-type") ?? "";
    console.log("[PUT] STEP 2 — content-type:", contentType);
    let raw: Record<string, unknown>;
    let imageFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      raw = {
        name: formData.get("name") || undefined,
        description: formData.get("description") || undefined,
        is_seasonal:
          formData.get("is_seasonal") === "true"
            ? true
            : formData.get("is_seasonal") === "false"
            ? false
            : undefined,
        is_available:
          formData.get("is_available") === "true"
            ? true
            : formData.get("is_available") === "false"
            ? false
            : undefined,
        sort_order: formData.get("sort_order")
          ? Number(formData.get("sort_order"))
          : undefined,
        matcha_powder_id: formData.get("matcha_powder_id") && /^[0-9a-fA-F]{8}-/.test(formData.get("matcha_powder_id") as string) 
          ? formData.get("matcha_powder_id") as string 
          : undefined,
        default_powder_id: formData.get("default_powder_id") && /^[0-9a-fA-F]{8}-/.test(formData.get("default_powder_id") as string)
          ? formData.get("default_powder_id") as string 
          : undefined,
        base_liquid_note: formData.get("base_liquid_note") || undefined,
      };

      const sizesStr = formData.get("sizes") as string | null;
      if (sizesStr) {
        try {
          raw.sizes = JSON.parse(sizesStr);
        } catch {
          return NextResponse.json(
            { error: "Định dạng sizes không hợp lệ", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
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

      const apStr = formData.get("allowed_powder_ids") as string | null;
      if (apStr) {
        try {
          raw.allowed_powder_ids = JSON.parse(apStr);
        } catch {
          return NextResponse.json(
            { error: "Định dạng allowed_powder_ids không hợp lệ", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
      }

      const candidate = formData.get("image");
      if (candidate instanceof File && candidate.size > 0) imageFile = candidate;
    } else {
      raw = (await req.json().catch(() => null)) ?? {};
    }

    console.log("[PUT] STEP 3 — raw keys:", Object.keys(raw));
    console.log("[PUT] STEP 3 — imageFile:", imageFile ? `${imageFile.name} (${imageFile.size}b, ${imageFile.type})` : null);

    // ── findUnique → 404 ─────────────────────────────────────────────────
    console.log("[PUT] STEP 4 — querying DB for id:", id);
    const existing = await prisma.menuItem.findUnique({ where: { id } });
    console.log("[PUT] STEP 5 — existing:", existing ? existing.name : "NOT FOUND");
    if (!existing)
      return NextResponse.json({ error: "Không tìm thấy món", code: "NOT_FOUND" }, { status: 404 });

    // ── Zod validation ───────────────────────────────────────────────────
    const validation = updateMenuSchema.safeParse(raw);
    if (!validation.success) {
      console.error("[PUT /api/admin/menu/[id]] Validation error:", JSON.stringify(validation.error.issues, null, 2));
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
    console.log("[PUT] STEP 6 — validation passed");

    // ── Check uniqueness of powder ──────────────────────────────────────────
    if (existing.category === "latte" && validData.matcha_powder_id && validData.matcha_powder_id !== existing.matcha_powder_id) {
      const powderUsed = await prisma.menuItem.findUnique({
        where: { matcha_powder_id: validData.matcha_powder_id },
      });
      if (powderUsed && powderUsed.id !== id) {
        return NextResponse.json(
          { error: "Loại bột này đã được sử dụng cho một món Latte khác", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
    }

    // ── Image upload (multipart only) ─────────────────────────────────────
    let image_url: string | undefined;
    if (imageFile) {
      console.log("[PUT] STEP 7 — uploading image:", imageFile.name, imageFile.type, imageFile.size);
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
      console.log("[PUT] STEP 8 — buffer ready, size:", buffer.length);
      try {
        image_url = await uploadMenuImage(`${Date.now()}-${imageFile.name}`, buffer, imageFile.type);
        console.log("[PUT] STEP 9 — upload OK, url:", image_url);
      } catch (uploadErr: unknown) {
        const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        console.error("[PUT] STEP 9 FAILED — upload error:", msg);
        return NextResponse.json(
          { error: `Upload ảnh thất bại: ${msg}`, code: "UPLOAD_ERROR" },
          { status: 500 }
        );
      }
    } else {
      console.log("[PUT] STEP 7 — no image to upload");
    }

    // ── DB write in transaction ───────────────────────────────────────────
    const [updatedItem, defaultSizeConfigs] = await Promise.all([
      prisma.$transaction(async (tx) => {
        await tx.menuItem.update({
          where: { id },
          data: {
            ...(validData.name !== undefined && { name: validData.name }),
            ...(validData.description !== undefined && { description: validData.description }),
            ...(validData.is_seasonal !== undefined && { is_seasonal: validData.is_seasonal }),
            ...(validData.is_available !== undefined && { is_available: validData.is_available }),
            ...(validData.sort_order !== undefined && { sort_order: validData.sort_order }),
            ...(validData.base_liquid_note !== undefined && {
              base_liquid_note: validData.base_liquid_note,
            }),
            ...(validData.custom_powder_grams !== undefined && {
              custom_powder_grams: validData.custom_powder_grams ?? undefined,
            }),
            // Category is read from DB (existing.category) — ignore client-sent value
            ...(existing.category === "latte" &&
              validData.matcha_powder_id !== undefined && {
                matcha_powder_id: validData.matcha_powder_id,
              }),
            ...(existing.category === "fusion" &&
              validData.default_powder_id !== undefined && {
                default_powder_id: validData.default_powder_id,
              }),
            ...(image_url !== undefined && { image_url }),
            updated_at: new Date(),
          },
        });

        // Upsert sizes if provided
        if (validData.sizes && validData.sizes.length > 0) {
          await Promise.all(
            validData.sizes.map((s) =>
              tx.menuItemSize.upsert({
                where: { menu_item_id_size: { menu_item_id: id, size: s.size } },
                create: { menu_item_id: id, size: s.size, base_price_vnd: s.base_price_vnd },
                update: { base_price_vnd: s.base_price_vnd },
              })
            )
          );
        }

        // Sync fusionAllowedPowders if provided (Fusion items only)
        if (existing.category === "fusion" && validData.allowed_powder_ids !== undefined) {
          await tx.fusionAllowedPowder.deleteMany({ where: { menu_item_id: id } });
          if (validData.allowed_powder_ids.length > 0) {
            await tx.fusionAllowedPowder.createMany({
              data: validData.allowed_powder_ids.map((pid) => ({
                menu_item_id: id,
                powder_id: pid,
              })),
            });
          }
        }

        // Cascade: sync powder anchor cùng trạng thái khi latte thay đổi is_available
        if (
          existing.category === "latte" &&
          validData.is_available !== undefined &&
          validData.is_available !== existing.is_available
        ) {
          const referencingPowder = await tx.matchaPowder.findFirst({
            where: { reference_latte_item_id: id },
            select: { id: true },
          });
          if (referencingPowder) {
            await tx.matchaPowder.update({
              where: { id: referencingPowder.id },
              data: { is_available: validData.is_available },
            });
          }
        }

        return tx.menuItem.findUniqueOrThrow({ where: { id }, include: INCLUDE });
      }, { maxWait: 10000, timeout: 15000 }),
      prisma.defaultSizeConfig.findMany(),
    ]);

    const milkMlMap: Record<string, number> = {};
    for (const c of defaultSizeConfigs) milkMlMap[c.size] = c.milk_ml;

    return NextResponse.json({ data: formatAdminMenuItem(updatedItem, milkMlMap) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[PUT] UNCAUGHT ERROR:", msg);
    console.error("[PUT] STACK:", stack);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR", details: { msg } },
      { status: 500 }
    );
  }
}

// ── DELETE /api/admin/menu/[id] ───────────────────────────────────────────────

/** DELETE /api/admin/menu/[id] — soft delete + cascade disable referenced powder. ADMIN only. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;

  try {
    // ── findUnique → 404 ─────────────────────────────────────────────────
    const existing = await prisma.menuItem.findUnique({
      where: { id },
      include: {
        referenceLatteItem: { select: { id: true } },
      },
    });
    if (!existing)
      return NextResponse.json({ error: "Không tìm thấy món", code: "NOT_FOUND" }, { status: 404 });

    // ── Soft delete + cascade in transaction ──────────────────────────────
    let disabledPowderId: string | undefined;

    await prisma.$transaction(async (tx) => {
      await tx.menuItem.update({
        where: { id },
        data: { is_available: false, updated_at: new Date() },
      });

      // Cascade disable powder if this Latte item is a pricing anchor
      if (existing.category === "latte") {
        const referencingPowder = await tx.matchaPowder.findFirst({
          where: { reference_latte_item_id: id, is_available: true },
          select: { id: true },
        });
        if (referencingPowder) {
          await tx.matchaPowder.update({
            where: { id: referencingPowder.id },
            data: { is_available: false },
          });
          disabledPowderId = referencingPowder.id;
        }
      }
    });

    return NextResponse.json({
      data: {
        id,
        ...(disabledPowderId !== undefined && { disabled_powder_id: disabledPowderId }),
      },
    });
  } catch (err) {
    console.error("[DELETE /api/admin/menu/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
