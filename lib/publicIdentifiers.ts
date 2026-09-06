import type { User, Voucher } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordLegacyIdentifierFallback } from "@/lib/observability";

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

/** Resolve a customer path identifier by public token, then one-release legacy UUID fallback. */
export async function resolveCustomerIdentifier(
  identifier: string,
  db: Pick<typeof prisma, "user"> = prisma,
): Promise<PublicUserIdentity | null> {
  const publicUser = await db.user.findUnique({
    where: { qr_token: identifier },
    select: { id: true, qr_token: true, role: true },
  });
  if (publicUser) {
    return publicUser.role === "CUSTOMER" ? publicUser : null;
  }

  const legacyUser = await db.user.findUnique({
    where: { id: identifier },
    select: { id: true, qr_token: true, role: true },
  });
  if (!legacyUser || legacyUser.role !== "CUSTOMER") return null;
  recordLegacyIdentifierFallback("user", "customer");
  return legacyUser;
}

/** Resolve a voucher identifier while enforcing ownership before legacy UUID fallback. */
export async function resolveOwnedVoucherIdentifier(
  identifier: string,
  ownerId: string,
  db: Pick<typeof prisma, "voucher"> = prisma,
): Promise<(Voucher & { menuItemScopes: Array<{ menu_item_id: string }> }) | null> {
  const publicVoucher = await db.voucher.findUnique({
    where: { qr_token: identifier },
    include: { menuItemScopes: { select: { menu_item_id: true } } },
  });
  if (publicVoucher) {
    return publicVoucher.user_id === ownerId ? publicVoucher : null;
  }

  const legacyVoucher = await db.voucher.findUnique({
    where: { id: identifier },
    include: { menuItemScopes: { select: { menu_item_id: true } } },
  });
  if (!legacyVoucher || legacyVoucher.user_id !== ownerId) return null;
  recordLegacyIdentifierFallback("voucher", "owner");
  return legacyVoucher;
}

/** Resolve a voucher for an authorized staff flow, preferring its public token. */
export async function resolveStaffVoucherIdentifier(
  identifier: string,
): Promise<Voucher | null> {
  const publicVoucher = await prisma.voucher.findUnique({
    where: { qr_token: identifier },
  });
  if (publicVoucher) return publicVoucher;

  const legacyVoucher = await prisma.voucher.findUnique({
    where: { id: identifier },
  });
  if (legacyVoucher) recordLegacyIdentifierFallback("voucher", "staff");
  return legacyVoucher;
}
