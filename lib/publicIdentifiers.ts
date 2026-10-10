import type { User, Voucher } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordLegacyIdentifierFallback } from "@/lib/observability";
import { resolveCanonicalCustomerId } from "@/lib/auth/accountMergeGuard";
import { AccountError } from "@/lib/auth/accountError";

export type PublicUserIdentity = Pick<User, "id" | "qr_token">;
export type PublicStaffIdentity = Pick<User, "id" | "qr_token" | "role">;

/** Resolve a STAFF/ADMIN filter token, then one-release legacy UUID fallback. */
export async function resolveStaffIdentifier(
  identifier: string,
  db: Pick<typeof prisma, "user"> = prisma,
): Promise<PublicStaffIdentity | null> {
  const publicUser = await db.user.findUnique({
    where: { qr_token: identifier },
    select: { id: true, qr_token: true, role: true },
  });
  if (publicUser) {
    return publicUser.role === "STAFF" || publicUser.role === "ADMIN" ? publicUser : null;
  }

  const legacyUser = await db.user.findUnique({
    where: { id: identifier },
    select: { id: true, qr_token: true, role: true },
  });
  if (!legacyUser || (legacyUser.role !== "STAFF" && legacyUser.role !== "ADMIN")) return null;
  recordLegacyIdentifierFallback("user", "staff");
  return legacyUser;
}

/** Resolve a customer QR alias to its canonical account, retaining the legacy UUID bridge. */
export async function resolveCustomerIdentifier(
  identifier: string,
  db: Pick<typeof prisma, "user" | "accountMerge"> = prisma,
): Promise<PublicUserIdentity | null> {
  const select = { id: true, qr_token: true, role: true, sourceMerge: { select: { target_user_id: true } } } as const;
  let user = await db.user.findUnique({ where: { qr_token: identifier }, select });
  if (!user) {
    user = await db.user.findUnique({ where: { id: identifier }, select });
    if (user?.role === "CUSTOMER") recordLegacyIdentifierFallback("user", "customer");
  }
  if (!user || user.role !== "CUSTOMER") return null;
  if (!user.sourceMerge) return { id: user.id, qr_token: user.qr_token };
  try {
    const canonicalId = await resolveCanonicalCustomerId(db, user.id);
    const canonical = await db.user.findUnique({ where: { id: canonicalId }, select });
    return canonical?.role === "CUSTOMER" && !canonical.sourceMerge
      ? { id: canonical.id, qr_token: canonical.qr_token } : null;
  } catch (error) {
    if (error instanceof AccountError && error.reason === "ACCOUNT_MERGE_CYCLE") return null;
    throw error;
  }
}

/** Resolve a voucher identifier while enforcing ownership before legacy UUID fallback. */
export async function resolveOwnedVoucherIdentifier(
  identifier: string,
  ownerId: string,
  db: Pick<typeof prisma, "voucher"> = prisma,
): Promise<(Voucher & {
  menuItemScopes: Array<{
    menu_item_id: string; size: Voucher["size"]; matcha_powder_id: string | null;
    milk_type_id: string | null; covered_price_vnd: number | null;
  }>;
  addonOptionScopes: Array<{ addon_option_id: string }>;
}) | null> {
  const publicVoucher = await db.voucher.findUnique({
    where: { qr_token: identifier },
    include: {
      menuItemScopes: { select: { menu_item_id: true, size: true, matcha_powder_id: true, milk_type_id: true, covered_price_vnd: true } },
      addonOptionScopes: { select: { addon_option_id: true } },
    },
  });
  if (publicVoucher) {
    return publicVoucher.user_id === ownerId ? publicVoucher : null;
  }

  const legacyVoucher = await db.voucher.findUnique({
    where: { id: identifier },
    include: {
      menuItemScopes: { select: { menu_item_id: true, size: true, matcha_powder_id: true, milk_type_id: true, covered_price_vnd: true } },
      addonOptionScopes: { select: { addon_option_id: true } },
    },
  });
  if (!legacyVoucher || legacyVoucher.user_id !== ownerId) return null;
  recordLegacyIdentifierFallback("voucher", "owner");
  return legacyVoucher;
}

/** Resolve a voucher for an authorized staff flow, preferring its public token. */
export async function resolveStaffVoucherIdentifier(
  identifier: string,
): Promise<(Voucher & {
  menuItemScopes: Array<{ menu_item_id: string }>;
  addonOptionScopes: Array<{ addon_option_id: string }>;
}) | null> {
  const publicVoucher = await prisma.voucher.findUnique({
    where: { qr_token: identifier },
    include: {
      menuItemScopes: { select: { menu_item_id: true } },
      addonOptionScopes: { select: { addon_option_id: true } },
    },
  });
  if (publicVoucher) return publicVoucher;

  const legacyVoucher = await prisma.voucher.findUnique({
    where: { id: identifier },
    include: {
      menuItemScopes: { select: { menu_item_id: true } },
      addonOptionScopes: { select: { addon_option_id: true } },
    },
  });
  if (legacyVoucher) recordLegacyIdentifierFallback("voucher", "staff");
  return legacyVoucher;
}
