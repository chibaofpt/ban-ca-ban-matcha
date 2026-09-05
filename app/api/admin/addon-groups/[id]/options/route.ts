import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAddonOptionSchema } from "@/lib/validations/addonGroup";
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

class OptionRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly reason?: string,
  ) {
    super(reason ?? code);
  }
}

/** POST /api/admin/addon-groups/[id]/options - append one option to a group. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedRequest = await parseCatalogRequest(req);
  if (!parsedRequest.ok) return parsedRequest.response;
  const validation = createAddonOptionSchema.safeParse(parsedRequest.raw);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const newImagePaths: string[] = [];
  let databaseCommitted = false;
  try {
    const preparedImage = await prepareCatalogImage({
      kind: "addons",
      entityName: validation.data.label,
      requestedName: validation.data.image_filename,
      imageFile: parsedRequest.imageFile,
      currentImageUrl: null,
    });
    if (preparedImage.newPath) newImagePaths.push(preparedImage.newPath);

    const result = await runSerializableTransaction(prisma, async (tx) => {
      const group = await tx.addonGroup.findUnique({
        where: { id },
        select: { id: true, is_dynamic_gram: true },
      });
      if (!group) throw new OptionRouteError(404, "NOT_FOUND");

      const pricingReason = validateAddonOptionPricing(group.is_dynamic_gram, validation.data);
      if (pricingReason) throw new OptionRouteError(422, "BUSINESS_RULE_VIOLATION", pricingReason);

      const currentOrder = await tx.addonOption.aggregate({
        where: { addon_group_id: id },
        _max: { sort_order: true },
      });
      await tx.addonOption.create({
        data: {
          addon_group_id: id,
          label: validation.data.label,
          image_url: preparedImage.imageUrl ?? null,
          price_vnd: validation.data.price_vnd,
          gram_value: validation.data.gram_value ?? null,
          is_default: false,
          is_active: validation.data.is_active,
          sort_order: (currentOrder._max.sort_order ?? -1) + 1,
        },
      });
      return tx.addonGroup.findUniqueOrThrow({
        where: { id },
        include: { options: { orderBy: ADMIN_ADDON_OPTION_ORDER_BY } },
      });
    });
    databaseCommitted = true;
    await invalidateMenuCaches();
    return NextResponse.json({ data: mapAdminAddonGroup(result) }, { status: 201 });
  } catch (error: unknown) {
    if (newImagePaths.length > 0 && !databaseCommitted) {
      await removeMenuImages(newImagePaths).catch(() => undefined);
    }
    if (error instanceof OptionRouteError) {
      return NextResponse.json(
        {
          error: error.status === 404
            ? "Nhóm addon không tồn tại"
            : error.reason === "DYNAMIC_GRAM_OPTION_REQUIRES_GRAMS"
              ? "Option theo gram phải có số gram lớn hơn 0 và giá cố định bằng 0"
              : "Option giá cố định không được nhập số gram",
          code: error.code,
          ...(error.reason && { details: { reason: error.reason } }),
        },
        { status: error.status },
      );
    }
    const imageMessage = catalogImageValidationMessage(error);
    if (imageMessage) {
      return NextResponse.json({ error: imageMessage, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    console.error("[POST /api/admin/addon-groups/[id]/options]", error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
