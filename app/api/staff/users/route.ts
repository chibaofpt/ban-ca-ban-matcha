import { isPhoneSearch, normalizeCustomerSearch, normalizePhone, phoneSearchVariants } from "@/src/utils/phone";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CustomerSearchResult } from "@/contracts/staff";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const staffUsersQuerySchema = z
  .object({
    q: z.string().min(2).max(254).optional(),
    phone: z.string().min(1).optional(),
  })
  .refine((d) => d.q !== undefined || d.phone !== undefined, {
    message: "Either q or phone param is required",
  });

export const dynamic = "force-dynamic";

/**
 * GET /api/staff/users — search customers by name or last digits of phone, STAFF or ADMIN only.
 * Params:
 *   ?q=xxxx  — fuzzy: all-digits → suffix match on phone; letters → ILIKE on name. min 2 chars.
 *   ?phone=xx — legacy exact match (backward compat). Returns same array shape.
 */
export async function GET(req: NextRequest) {
  // 1. Session check
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // 2. Role check
  if (!["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  // 3. Parse + validate query params
  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q") ?? undefined;
  const rawPhone = searchParams.get("phone") ?? undefined;

  const parsed = staffUsersQuerySchema.safeParse({ q: rawQ, phone: rawPhone });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // 4. Business logic
  try {
    const { q, phone } = parsed.data;

    if (phone !== undefined) {
      // Legacy exact-match path — kept for backward compat
      const normalized = normalizePhone(phone);
      const user = await prisma.user.findUnique({
        where: { phone_number: normalized },
        select: { qr_token: true, name: true, phone_number: true, email: true, insta_name: true, points_balance: true, role: true, sourceMerge: { select: { target_user_id: true } } },
      });
      const items = (user && user.role === "CUSTOMER" && !user.sourceMerge
        ? [{ qr_token: user.qr_token, name: user.name, phone_number: user.phone_number, email: user.email, insta_name: user.insta_name, points_balance: user.points_balance }] : []) satisfies CustomerSearchResult[];
      return NextResponse.json(
        { data: { items } },
        { status: 200 }
      );
    }

    // Fuzzy search path
    const isDigitsOnly = isPhoneSearch(q!);
    const normalized = normalizeCustomerSearch(q!);
    const prefixes = phoneSearchVariants(q!).filter((term) => term.startsWith("+84"));
    const users = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        sourceMerge: { is: null },
        ...(isDigitsOnly
          ? { OR: [{ phone_number: { endsWith: normalized } }, ...prefixes.map((term) => ({ phone_number: { startsWith: term } }))] }
          : { OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { insta_name: { contains: q!.replace(/^@/, ""), mode: "insensitive" } },
            ] }),
      },
      select: { qr_token: true, name: true, phone_number: true, email: true, insta_name: true, points_balance: true },
      orderBy: { created_at: "desc" },
      take: 10,
    });

    const items = users satisfies CustomerSearchResult[];
    return NextResponse.json({ data: { items } }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/staff/users]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
