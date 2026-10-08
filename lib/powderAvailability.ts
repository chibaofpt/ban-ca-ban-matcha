import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { FusionPowderReplacementDetails, FusionPowderReplacement } from "@/contracts/admin/catalog";

class PowderAvailabilityError extends Error {
  constructor(readonly details: FusionPowderReplacementDetails) {
    super("Vui lòng chọn bột thay thế cho tất cả món Fusion liên quan");
  }
}

/** Map the replacement workflow's caller-visible business-rule failure. */
export function powderAvailabilityErrorResponse(error: unknown): NextResponse | null {
  return error instanceof PowderAvailabilityError
    ? NextResponse.json({ error: error.message, code: "BUSINESS_RULE_VIOLATION", details: error.details }, { status: 422 })
    : null;
}

/** Validate and synchronize a powder, its reference Latte and explicit Fusion replacements inside the caller transaction. */
export async function syncPowderAvailability(
  tx: Prisma.TransactionClient,
  powderId: string,
  isAvailable: boolean,
  replacements?: FusionPowderReplacement[],
  referenceLatteId?: string | null,
): Promise<string | null> {
  const powder = await tx.matchaPowder.findUnique({ where: { id: powderId },
    select: { id: true, is_available: true, reference_latte_item_id: true } });
  if (!powder) throw new Error("NOT_FOUND");
  const effectiveLatteId = referenceLatteId === undefined ? powder.reference_latte_item_id : referenceLatteId;
  const latte = effectiveLatteId
    ? await tx.menuItem.findUnique({ where: { id: effectiveLatteId }, select: { is_available: true } })
    : null;
  if (powder.is_available === isAvailable && (!latte || latte.is_available === isAvailable)) return effectiveLatteId;
  if (!isAvailable) {
    const fusions = await tx.menuItem.findMany({
      where: { category: "fusion", OR: [{ default_powder_id: powderId }, { replacement_powder_id: powderId }] },
      select: { id: true, name: true, is_available: true, default_powder_id: true, replacement_powder_id: true },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
    });
    const candidates = await tx.matchaPowder.findMany({
      where: { is_available: true, id: { not: powderId } },
      select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const fusionIds = new Set(fusions.map((fusion) => fusion.id));
    const supplied = replacements ?? [];
    if (supplied.length !== fusions.length ||
      new Set(supplied.map((entry) => entry.menu_item_id)).size !== supplied.length ||
      supplied.some((entry) => !fusionIds.has(entry.menu_item_id) ||
        entry.replacement_powder_id === powderId || !candidateIds.has(entry.replacement_powder_id))) {
      throw new PowderAvailabilityError({
        reason: "FUSION_POWDER_REPLACEMENT_REQUIRED", powder_id: powderId,
        fusion_items: fusions, available_powders: candidates,
      });
    }
    for (const entry of supplied) {
      await tx.menuItem.update({ where: { id: entry.menu_item_id },
        data: { replacement_powder_id: entry.replacement_powder_id, updated_at: new Date() } });
    }
  } else {
    await tx.menuItem.updateMany({ where: { category: "fusion", default_powder_id: powderId },
      data: { replacement_powder_id: null, updated_at: new Date() } });
  }
  await tx.matchaPowder.update({ where: { id: powderId }, data: { is_available: isAvailable } });
  if (effectiveLatteId) {
    await tx.menuItem.update({ where: { id: effectiveLatteId },
      data: { is_available: isAvailable, updated_at: new Date() } });
  }
  return effectiveLatteId;
}

/** Resolve a reference Latte's current powder before applying the shared pair transition. */
export async function syncReferenceLatteAvailability(
  tx: Prisma.TransactionClient,
  latteId: string,
  isAvailable: boolean,
  replacements?: FusionPowderReplacement[],
): Promise<void> {
  const powder = await tx.matchaPowder.findFirst({ where: { reference_latte_item_id: latteId }, select: { id: true } });
  if (powder) await syncPowderAvailability(tx, powder.id, isAvailable, replacements);
}
