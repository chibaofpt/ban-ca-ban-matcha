import type { CreateVoucherPackageInput } from "@/lib/validations/voucherPackage";

type AddonInput = Extract<CreateVoucherPackageInput, { voucher_type: "ADDON" }>;

interface AddonRecord {
  gram_value: unknown | null;
  price_vnd: number;
  is_active: boolean;
  group: { is_active: boolean };
}

export interface AdminVoucherAddonDatabase {
  addonOption: { findUnique: (args: unknown) => Promise<AddonRecord | null> };
  voucherPackage: { create: (args: unknown) => Promise<unknown> };
}

/** Expected admin ADDON package reference error. */
export class VoucherAddonReferenceError extends Error {
  constructor(public readonly reason: "NOT_FOUND" | "VALIDATION_ERROR", message: string) {
    super(message);
    this.name = "VoucherAddonReferenceError";
  }
}

/** Validate and snapshot one ADDON package. */
export async function createAddonVoucherPackage(
  db: AdminVoucherAddonDatabase,
  data: AddonInput,
): Promise<unknown> {
  const addon = await db.addonOption.findUnique({
    where: { id: data.addon_option_id },
    select: {
      gram_value: true,
      price_vnd: true,
      is_active: true,
      group: { select: { is_active: true } },
    },
  });
  if (!addon || !addon.is_active || !addon.group.is_active) {
    throw new VoucherAddonReferenceError("NOT_FOUND", "Addon option not found");
  }
  if (addon.gram_value !== null) {
    throw new VoucherAddonReferenceError(
      "VALIDATION_ERROR",
      "ADDON vouchers cannot target Extra Matcha options",
    );
  }
  return db.voucherPackage.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      voucher_type: "ADDON",
      acquisition_mode: data.acquisition_mode,
      points_cost: data.points_cost,
      ends_at: data.ends_at ? new Date(data.ends_at) : null,
      is_active: true,
      expires_after_days: data.expires_after_days ?? null,
      quantity: data.quantity ?? null,
      max_per_user: data.max_per_user,
      addon_option_id: data.addon_option_id,
      covered_price_vnd: addon.price_vnd,
      included_addon_option_ids: [],
    },
  });
}
