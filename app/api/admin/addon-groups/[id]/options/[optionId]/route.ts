import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  toggleAddonOptionSchema,
  updateAddonOptionDetailsSchema,
} from "@/lib/validations/addonGroup";
import { parseCatalogRequest } from "@/lib/catalogRequest";
import { catalogImageValidationMessage, prepareCatalogImage } from "@/lib/catalogImage";
import { removeMenuImages } from "@/lib/storage";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import {
  ADMIN_ADDON_OPTION_ORDER_BY,
  mapAdminAddonGroup,
  validateAddonOptionPricing,
} from "@/lib/adminAddonGroup";
import { runSerializableTransaction } from "@/lib/serializableTransaction";

export const dynamic = "force-dynamic";

interface RouteParams {
  id: string;
  optionId: string;
}

/** PUT /api/admin/addon-groups/[id]/options/[optionId] - update details or activation. */
export async function PUT(req: Request, { params }: { params: Promise<RouteParams> }) {
  const parsedRequest = await parseCatalogRequest(req);
  if (!parsedRequest.ok) return parsedRequest.response;
  const raw = parsedRequest.raw && typeof parsedRequest.raw === "object" && !Array.isArray(parsedRequest.raw)
    ? parsedRequest.raw as Record<string, unknown>
    : {};

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const { id, optionId } = await params;
  const existing = await prisma.addonOption.findFirst({
    where: { id: optionId, addon_group_id: id },
    include: {
      group: { select: { id: true, is_dynamic_gram: true, is_active: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Option không tồn tại", code: "NOT_FOUND" }, { status: 404 });
  }

  const isToggle = Object.keys(raw).length === 1 && "is_active" in raw;
  if (isToggle) {
    const validation = toggleAddonOptionSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0].message, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    try {
      const toggleResult = await runSerializableTransaction(prisma, async (tx) => {
        const current = await tx.addonOption.findFirst({
          where: { id: optionId, addon_group_id: id },
          include: {
            group: { select: { id: true, is_dynamic_gram: true, is_active: true } },
          },
        });
        if (!current) return { kind: "not_found" } as const;
        if (!validation.data.is_active && current.is_active && current.group.is_active) {
          const activeCount = await tx.addonOption.count({
            where: { addon_group_id: id, is_active: true },
          });
          if (activeCount <= 1) return { kind: "business_rule" } as const;
        }
        await tx.addonOption.update({
          where: { id: optionId },
          data: { is_active: validation.data.is_active },
        });
        const group = await tx.addonGroup.findUniqueOrThrow({
          where: { id },
          include: { options: { orderBy: ADMIN_ADDON_OPTION_ORDER_BY } },
        });
        return { kind: "updated", group } as const;
      });
      if (toggleResult.kind === "not_found") {
        return NextResponse.json(
          { error: "Option không tồn tại", code: "NOT_FOUND" },
          { status: 404 },
        );
      }
      if (toggleResult.kind === "business_rule") {
        return NextResponse.json(
          {
            error: "Nhóm đang hiển thị phải có ít nhất một option đang bật",
            code: "BUSINESS_RULE_VIOLATION",
            details: { reason: "ACTIVE_GROUP_REQUIRES_ACTIVE_OPTION" },
          },
          { status: 422 },
        );
      }
      await invalidateMenuCaches();
      return NextResponse.json({ data: mapAdminAddonGroup(toggleResult.group) });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "P2034") {
        return NextResponse.json(
          { error: "Dữ liệu addon vừa thay đổi. Vui lòng thử lại.", code: "CONFLICT" },
          { status: 409 },
        );
      }
      console.error("[PUT /api/admin/addon-groups/[id]/options/[optionId] toggle]", error);
      return NextResponse.json(
        { error: "Không thể cập nhật trạng thái option. Vui lòng thử lại.", code: "INTERNAL_ERROR" },
        { status: 500 },
      );
    }
  }

  const validation = updateAddonOptionDetailsSchema.safeParse(raw);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.issues[0].message, code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const pricingReason = validateAddonOptionPricing(existing.group.is_dynamic_gram, validation.data);
  if (pricingReason) {
    return NextResponse.json(
      {
        error: pricingReason === "DYNAMIC_GRAM_OPTION_REQUIRES_GRAMS"
          ? "Option theo gram phải có số gram lớn hơn 0 và giá cố định bằng 0"
          : "Option giá cố định không được nhập số gram",
        code: "BUSINESS_RULE_VIOLATION",
        details: { reason: pricingReason },
      },
      { status: 422 },
    );
  }

  const newImagePaths: string[] = [];
  const oldImagePaths: string[] = [];
  let databaseCommitted = false;
  try {
    const preparedImage = await prepareCatalogImage({
      kind: "addons",
      entityName: validation.data.label,
      requestedName: validation.data.image_filename,
      imageFile: parsedRequest.imageFile,
      currentImageUrl: existing.image_url,
    });
    if (preparedImage.newPath) newImagePaths.push(preparedImage.newPath);
    if (preparedImage.oldPath) oldImagePaths.push(preparedImage.oldPath);

    const result = await runSerializableTransaction(prisma, async (tx) => {
      await tx.addonOption.update({
        where: { id: optionId },
        data: {
          label: validation.data.label,
          price_vnd: validation.data.price_vnd,
          gram_value: validation.data.gram_value ?? null,
          ...(preparedImage.imageUrl !== undefined && { image_url: preparedImage.imageUrl }),
        },
      });
      return tx.addonGroup.findUniqueOrThrow({
        where: { id },
        include: { options: { orderBy: ADMIN_ADDON_OPTION_ORDER_BY } },
      });
    });
    databaseCommitted = true;
    if (oldImagePaths.length > 0) {
      await removeMenuImages(oldImagePaths).catch(() => undefined);
    }
    await invalidateMenuCaches();
    return NextResponse.json({ data: mapAdminAddonGroup(result) });
  } catch (error: unknown) {
    if (newImagePaths.length > 0 && !databaseCommitted) {
      await removeMenuImages(newImagePaths).catch(() => undefined);
    }
    const imageMessage = catalogImageValidationMessage(error);
    if (imageMessage) {
      return NextResponse.json({ error: imageMessage, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    console.error("[PUT /api/admin/addon-groups/[id]/options/[optionId]]", error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
