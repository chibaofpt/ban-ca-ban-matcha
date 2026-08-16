import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLatteWithPowderSchema } from "@/lib/validations/createLatteWithPowder";
import {
  buildMenuImagePath,
  removeMenuImages,
  uploadMenuImage,
} from "@/lib/storage";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { captureServerException } from "@/lib/observability";
import { ADMIN_MENU_INCLUDE, formatAdminMenuItem } from "@/lib/adminMenuDto";

export const dynamic = "force-dynamic";

// ── Types ────────────────────────────────────────────────────────────────────

// ── Helper ───────────────────────────────────────────────────────────────────

// ── POST ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/menu/create-latte-with-powder
 *
 * Giải quyết circular dependency: Latte cần powder_id, nhưng powder cần
 * reference_latte_item_id. Route này thực hiện toàn bộ trong 1 transaction:
 *   1. Tạo MatchaPowder (chưa có reference)
 *   2. Tạo PowderSizeConfig (nếu có)
 *   3. Tạo MenuItem (Latte) với matcha_powder_id = powder.id
 *   4. Tạo 3 MenuItemSize rows
 *   5. Update MatchaPowder.reference_latte_item_id = latte.id
 *   6. Re-fetch MenuItem với full includes
 *
 * ADMIN only.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  let uploadedImagePath: string | null = null;
  let databaseCommitted = false;
  try {
    // ── Parse multipart/form-data ────────────────────────────────────────────
    const formData = await req.formData();

    const rawSizesStr = formData.get("sizes") as string | null;
    if (!rawSizesStr) {
      return NextResponse.json(
        { error: "sizes là bắt buộc", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    let parsedSizes: unknown;
    try {
      parsedSizes = JSON.parse(rawSizesStr);
    } catch {
      return NextResponse.json(
        { error: "Định dạng sizes không hợp lệ (phải là JSON)", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    let parsedCustomPowderGrams: unknown = undefined;
    const cpgStr = formData.get("custom_powder_grams") as string | null;
    if (cpgStr) {
      try {
        parsedCustomPowderGrams = JSON.parse(cpgStr);
      } catch {
        return NextResponse.json(
          { error: "Định dạng custom_powder_grams không hợp lệ", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
    }

    let parsedPowderSizeConfig: unknown = undefined;
    const powderSizeConfigStr = formData.get("new_powder_size_config") as string | null;
    if (powderSizeConfigStr) {
      try {
        parsedPowderSizeConfig = JSON.parse(powderSizeConfigStr);
      } catch {
        return NextResponse.json(
          { error: "Định dạng new_powder_size_config không hợp lệ", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
    }

    const rawPricePerGram = formData.get("new_powder_price_per_gram");
    const parsedPricePerGram =
      rawPricePerGram !== null && rawPricePerGram !== "" ? Number(rawPricePerGram) : NaN;
    let parsedAllowedBaseLiquidIds: unknown = [];
    const allowedBaseLiquidIdsRaw = formData.get("allowed_base_liquid_ids");
    if (typeof allowedBaseLiquidIdsRaw === "string" && allowedBaseLiquidIdsRaw.length > 0) {
      try {
        parsedAllowedBaseLiquidIds = JSON.parse(allowedBaseLiquidIdsRaw);
      } catch {
        return NextResponse.json(
          { error: "Định dạng allowed_base_liquid_ids không hợp lệ", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
    }

    const raw = {
      name: formData.get("name"),
      description: formData.get("description") || null,
      is_available: formData.get("is_available") !== "false",
      is_seasonal: formData.get("is_seasonal") === "true",
      sort_order: formData.get("sort_order") ? Number(formData.get("sort_order")) : 0,
      sizes: parsedSizes,
      custom_powder_grams: parsedCustomPowderGrams,
      image_filename: formData.get("image_filename") || undefined,
      allowed_base_liquid_ids: parsedAllowedBaseLiquidIds,
      new_powder: {
        name: formData.get("new_powder_name"),
        price_per_gram: parsedPricePerGram,
        size_config: parsedPowderSizeConfig,
      },
    };

    // ── Zod validation ───────────────────────────────────────────────────────
    const validation = createLatteWithPowderSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: validation.error.issues[0].message,
          code: "VALIDATION_ERROR",
          details: { issues: validation.error.issues },
        },
        { status: 400 }
      );
    }
    const validData = validation.data;
    const activeBaseLiquids = await prisma.milkType.findMany({
      where: { is_active: true },
      select: { id: true, is_default: true },
    });
    const globalDefaultBaseLiquidId = activeBaseLiquids.find((liquid) => liquid.is_default)?.id;
    if (!globalDefaultBaseLiquidId) {
      return NextResponse.json(
        { error: "Chưa có Base Liquid mặc định cho Latte", code: "BUSINESS_RULE_VIOLATION" },
        { status: 422 },
      );
    }
    const activeIds = new Set(activeBaseLiquids.map((liquid) => liquid.id));
    const allowedBaseLiquidIds = [...new Set(validData.allowed_base_liquid_ids)]
      .filter((baseLiquidId) => baseLiquidId !== globalDefaultBaseLiquidId);
    if (allowedBaseLiquidIds.some((baseLiquidId) => !activeIds.has(baseLiquidId))) {
      return NextResponse.json(
        { error: "Danh sách Base Liquid có lựa chọn không khả dụng", code: "BUSINESS_RULE_VIOLATION" },
        { status: 422 },
      );
    }

    // ── Image upload (before transaction) ────────────────────────────────────
    let image_url: string | null = null;
    const imageFile = formData.get("image") as File | null;
    if (imageFile instanceof File && imageFile.size > 0) {
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(imageFile.type)) {
        return NextResponse.json(
          { error: "Định dạng ảnh không hỗ trợ (JPEG, PNG, WEBP)", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      if (imageFile.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Ảnh quá lớn (tối đa 5MB)", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const imagePath = buildMenuImagePath({
        category: "latte",
        productName: validData.name,
        requestedName: validData.image_filename,
        contentType: imageFile.type,
      });
      image_url = await uploadMenuImage(imagePath, buffer, imageFile.type);
      uploadedImagePath = imagePath;
    }

    // ── Fetch defaultSizeConfig for response formatting ───────────────────────
    const defaultSizeConfigs = await prisma.defaultSizeConfig.findMany();
    const milkMlMap: Record<string, number> = {};
    for (const c of defaultSizeConfigs) milkMlMap[c.size] = c.milk_ml;

    // ── Single transaction: powder → latte → sizes → update powder ────────────
    const [createdItem, powderName] = await prisma.$transaction(
      async (tx) => {
        // Step 1: Create MatchaPowder (no reference yet)
        const powder = await tx.matchaPowder.create({
          data: {
            name: validData.new_powder.name,
            price_per_gram: validData.new_powder.price_per_gram,
            type: "NONE",
            is_available: true,
            reference_latte_item_id: null,
            // Fields not captured inline — admin can fill in from powder management tab
            manufacturer: null,
            description: null,
            fragrance: null,
            body: null,
            bitterness: null,
            umami: null,
            color: null,
          },
        });

        // Step 2: Create PowderSizeConfig (if provided)
        if (validData.new_powder.size_config && validData.new_powder.size_config.length > 0) {
          await tx.powderSizeConfig.createMany({
            data: validData.new_powder.size_config.map((sc) => ({
              powder_id: powder.id,
              size: sc.size,
              grams: sc.grams,
            })),
          });
        }

        // Step 3: Create MenuItem (Latte) with powder.id
        const latte = await tx.menuItem.create({
          data: {
            name: validData.name,
            description: validData.description ?? null,
            category: "latte",
            is_available: validData.is_available,
            is_seasonal: validData.is_seasonal,
            sort_order: validData.sort_order,
            image_url,
            custom_powder_grams: validData.custom_powder_grams ?? undefined,
            base_liquid_note: null,
            matcha_powder_id: powder.id,
            default_powder_id: null,
          },
        });

        // Step 4: Create 3 MenuItemSize rows
        await tx.menuItemSize.createMany({
          data: validData.sizes.map((s) => ({
            menu_item_id: latte.id,
            size: s.size,
            base_price_vnd: s.base_price_vnd,
            base_liquid_ml: s.base_liquid_ml ?? null,
          })),
        });

        if (allowedBaseLiquidIds.length > 0) {
          await tx.menuItemAllowedBaseLiquid.createMany({
            data: allowedBaseLiquidIds.map((baseLiquidId) => ({
              menu_item_id: latte.id,
              base_liquid_id: baseLiquidId,
            })),
          });
        }

        // Step 5: Update powder with reference_latte_item_id = latte.id
        await tx.matchaPowder.update({
          where: { id: powder.id },
          data: { reference_latte_item_id: latte.id },
        });

        // Step 6: Re-fetch MenuItem with full includes for response
        const fullItem = await tx.menuItem.findUniqueOrThrow({
          where: { id: latte.id },
          include: ADMIN_MENU_INCLUDE,
        });

        return [fullItem, powder.name] as const;
      },
      { maxWait: 10000, timeout: 15000 }
    );
    databaseCommitted = true;

    try {
      await invalidateMenuCaches();
    } catch (cacheError) {
      captureServerException(cacheError, {
        operation: "invalidate_menu_after_inline_latte_create",
      });
    }
    return NextResponse.json(
      {
        data: {
          menu_item: formatAdminMenuItem(createdItem, milkMlMap),
          powder_name: powderName,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (uploadedImagePath && !databaseCommitted) {
      try {
        await removeMenuImages([uploadedImagePath]);
      } catch (cleanupError) {
        captureServerException(cleanupError, {
          operation: "rollback_inline_latte_image_create",
        });
      }
    }
    // Handle Prisma unique constraint (reference_latte_item_id already taken)
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002" &&
      "meta" in err &&
      Array.isArray((err as { meta: { target?: string[] } }).meta?.target) &&
      (err as { meta: { target: string[] } }).meta.target.includes("reference_latte_item_id")
    ) {
      return NextResponse.json(
        {
          error: "Latte item này đã được gán cho một bột khác",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    captureServerException(err, { operation: "create_latte_with_powder" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
