import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateMenuSchema } from "@/lib/validations/menu";
import {
  MENU_IMAGE_OUTPUT_CONTENT_TYPE,
  buildMenuImagePath,
  contentTypeForMenuImagePath,
  copyMenuImage,
  parseMenuImagePath,
  removeMenuImages,
  uploadMenuImage,
} from "@/lib/storage";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { captureServerException } from "@/lib/observability";
import { ADMIN_MENU_INCLUDE, formatAdminMenuItem } from "@/lib/adminMenuDto";
import { parseAdminMenuUpdate } from "@/lib/adminMenuRequest";
import {
  asMenuStorageCategory,
  buildMenuItemSizeUpdate,
  isAvailabilityOnlyMenuUpdate,
  validateMenuImageFile,
  validateUniqueLattePowder,
} from "@/lib/adminMenuUpdate";

export const dynamic = "force-dynamic";

// ── Shared include + helper (mirrors route.ts) ───────────────────────────────

// ── PUT /api/admin/menu/[id] ─────────────────────────────────────────────────

/** PUT /api/admin/menu/[id] — update menu item. Accepts multipart/form-data OR application/json. ADMIN only. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;

  let newImagePath: string | null = null;
  let oldImagePathToDelete: string | null = null;
  let databaseCommitted = false;
  try {
    // ── Detect Content-Type → parse body ──────────────────────────────────
    // Toggle availability sends JSON { is_available }
    // Form edit sends multipart/form-data — both go through this same route
    const parsedRequest = await parseAdminMenuUpdate(req);
    if (!parsedRequest.ok) return parsedRequest.response;
    const { raw, imageFile } = parsedRequest;


    // ── findUnique → 404 ─────────────────────────────────────────────────
    const existing = await prisma.menuItem.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: "Không tìm thấy món", code: "NOT_FOUND" }, { status: 404 });

    // ── Zod validation ───────────────────────────────────────────────────
    const validation = updateMenuSchema.safeParse(raw);
    if (!validation.success) {
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
    const availabilityOnlyUpdate = isAvailabilityOnlyMenuUpdate(raw);

    if (existing.category !== "extras" && validData.unit_price_vnd != null) {
      return NextResponse.json(
        { error: "Đồ uống không sử dụng giá cố định", code: "VALIDATION_ERROR" },
        { status: 422 },
      );
    }
    if (existing.category === "extras" && validData.unit_price_vnd === null) {
      return NextResponse.json(
        { error: "Add-on phải có đơn giá", code: "VALIDATION_ERROR" },
        { status: 422 },
      );
    }
    if (
      existing.category === "extras" &&
      validData.unit_price_vnd !== undefined &&
      validData.unit_price_vnd !== existing.unit_price_vnd
    ) {
      const now = new Date();
      const activeItemVoucherCount = await prisma.voucher.count({
        where: {
          menu_item_id: id,
          voucher_type: "ITEM",
          status: { in: ["ACTIVE", "RESERVED"] },
          OR: [{ expires_at: null }, { expires_at: { gt: now } }],
        },
      });
      if (activeItemVoucherCount > 0 && validData.confirm_price_change !== true) {
        return NextResponse.json(
          {
            error: "Add-on đang có voucher ITEM còn hiệu lực",
            code: "CONFLICT",
            details: {
              reason: "ACTIVE_ITEM_VOUCHERS",
              count: activeItemVoucherCount,
              old_unit_price_vnd: existing.unit_price_vnd,
              new_unit_price_vnd: validData.unit_price_vnd,
            },
          },
          { status: 409 },
        );
      }
    }
    let resolvedDefaultBaseLiquidId = existing.default_base_liquid_id;
    let allowedBaseLiquidIdsToSave: string[] | undefined;
    if (!availabilityOnlyUpdate && existing.category !== "extras") {
      const activeBaseLiquids = await prisma.milkType.findMany({
        where: { is_active: true },
        select: { id: true, is_default: true },
      });
      const activeBaseLiquidIds = new Set(activeBaseLiquids.map((liquid) => liquid.id));
      resolvedDefaultBaseLiquidId = existing.category === "latte"
        ? activeBaseLiquids.find((liquid) => liquid.is_default)?.id ?? null
        : validData.default_base_liquid_id ?? existing.default_base_liquid_id;
      if (!resolvedDefaultBaseLiquidId || !activeBaseLiquidIds.has(resolvedDefaultBaseLiquidId)) {
        return NextResponse.json(
          { error: "Base Liquid mặc định không khả dụng", code: "BUSINESS_RULE_VIOLATION" },
          { status: 422 },
        );
      }
      allowedBaseLiquidIdsToSave = validData.allowed_base_liquid_ids === undefined
        ? undefined
        : [...new Set(validData.allowed_base_liquid_ids)]
          .filter((baseLiquidId) => baseLiquidId !== resolvedDefaultBaseLiquidId);
      if (allowedBaseLiquidIdsToSave?.some((baseLiquidId) => !activeBaseLiquidIds.has(baseLiquidId))) {
        return NextResponse.json(
          { error: "Danh sách Base Liquid có lựa chọn không khả dụng", code: "BUSINESS_RULE_VIOLATION" },
          { status: 422 },
        );
      }
    }

    // ── Check uniqueness of powder ──────────────────────────────────────────
    const powderConflict = await validateUniqueLattePowder({
      itemId: id,
      category: existing.category,
      currentPowderId: existing.matcha_powder_id,
      nextPowderId: validData.matcha_powder_id,
    });
    if (powderConflict) return powderConflict;

    // ── Image upload or SEO rename (multipart only) ───────────────────────
    let image_url: string | undefined;
    if (imageFile) {
      const imageError = validateMenuImageFile(imageFile);
      if (imageError) return imageError;
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      try {
        const imagePath = buildMenuImagePath({
          category: asMenuStorageCategory(existing.category),
          productName: validData.name ?? existing.name,
          requestedName: validData.image_filename,
          contentType: MENU_IMAGE_OUTPUT_CONTENT_TYPE,
        });
        image_url = await uploadMenuImage(imagePath, buffer, imageFile.type);
        newImagePath = imagePath;
        oldImagePathToDelete = existing.image_url
          ? parseMenuImagePath(existing.image_url)
          : null;
      } catch (uploadErr: unknown) {
        captureServerException(uploadErr, { operation: "upload_menu_image_update" });
        return NextResponse.json(
          { error: "Upload ảnh thất bại", code: "UPLOAD_ERROR" },
          { status: 500 }
        );
      }
    } else if (validData.image_filename) {
      const currentPath = existing.image_url
        ? parseMenuImagePath(existing.image_url)
        : null;
      const currentContentType = currentPath
        ? contentTypeForMenuImagePath(currentPath)
        : null;
      if (!currentPath || !currentContentType) {
        return NextResponse.json(
          { error: "Không có ảnh hợp lệ để đổi tên", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      const renamedPath = buildMenuImagePath({
        category: asMenuStorageCategory(existing.category),
        productName: validData.name ?? existing.name,
        requestedName: validData.image_filename,
        contentType: currentContentType,
      });
      image_url = await copyMenuImage(currentPath, renamedPath);
      newImagePath = renamedPath;
      oldImagePathToDelete = currentPath;
    }

    // ── DB write in transaction ───────────────────────────────────────────
    const defaultSizeConfigs = await prisma.defaultSizeConfig.findMany();
    const updatedItem = await prisma.$transaction(async (tx) => {
        await tx.menuItem.update({
          where: { id },
          data: {
            ...(validData.name !== undefined && { name: validData.name }),
            ...(validData.description !== undefined && { description: validData.description }),
            ...(validData.is_seasonal !== undefined && { is_seasonal: validData.is_seasonal }),
            ...(validData.is_available !== undefined && { is_available: validData.is_available }),
            ...(validData.sort_order !== undefined && { sort_order: validData.sort_order }),
            ...(existing.category === "extras" && validData.unit_price_vnd !== undefined && {
              unit_price_vnd: validData.unit_price_vnd,
            }),
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
            ...(existing.category === "fusion" && !availabilityOnlyUpdate && {
              default_base_liquid_id: resolvedDefaultBaseLiquidId,
            }),
            ...(image_url !== undefined && { image_url }),
            updated_at: new Date(),
          },
        });

        // Upsert sizes if provided
        if (existing.category !== "extras" && validData.sizes && validData.sizes.length > 0) {
          await Promise.all(
            validData.sizes.map((s) =>
              tx.menuItemSize.upsert({
                where: { menu_item_id_size: { menu_item_id: id, size: s.size } },
                create: {
                  menu_item_id: id,
                  size: s.size,
                  base_price_vnd: s.base_price_vnd,
                  base_liquid_ml: s.base_liquid_ml ?? null,
                },
                update: buildMenuItemSizeUpdate(s),
              })
            )
          );
        }

        if (allowedBaseLiquidIdsToSave !== undefined) {
          await tx.menuItemAllowedBaseLiquid.deleteMany({ where: { menu_item_id: id } });
          if (allowedBaseLiquidIdsToSave.length > 0) {
            await tx.menuItemAllowedBaseLiquid.createMany({
              data: allowedBaseLiquidIdsToSave.map((baseLiquidId) => ({
                menu_item_id: id,
                base_liquid_id: baseLiquidId,
              })),
            });
          }
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

        return tx.menuItem.findUniqueOrThrow({ where: { id }, include: ADMIN_MENU_INCLUDE });
      }, { maxWait: 10000, timeout: 15000 });
    databaseCommitted = true;
    const milkMlMap: Record<string, number> = {};
    for (const c of defaultSizeConfigs) milkMlMap[c.size] = c.milk_ml;

    if (oldImagePathToDelete) {
      try {
        await removeMenuImages([oldImagePathToDelete]);
      } catch (cleanupError) {
        captureServerException(cleanupError, {
          operation: "delete_replaced_menu_image",
        });
      }
    }

    try {
      await invalidateMenuCaches();
    } catch (cacheError) {
      captureServerException(cacheError, { operation: "invalidate_menu_after_update" });
    }
    return NextResponse.json({ data: formatAdminMenuItem(updatedItem, milkMlMap) });
  } catch (err: unknown) {
    if (newImagePath && !databaseCommitted) {
      try {
        await removeMenuImages([newImagePath]);
      } catch (cleanupError) {
        captureServerException(cleanupError, {
          operation: "rollback_menu_image_update",
        });
      }
    }
    captureServerException(err, { operation: "update_menu_item" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
