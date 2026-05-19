import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const staffUsersQuerySchema = z
  .object({
    q: z.string().min(2).max(20).optional(),
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
      const { normalizePhone } = await import("@/lib/auth");
      const normalized = normalizePhone(phone);
      const user = await prisma.user.findUnique({
        where: { phone_number: normalized },
        select: { id: true, name: true, phone_number: true, points_balance: true },
      });
      return NextResponse.json(
        { data: { items: user ? [user] : [] } },
        { status: 200 }
      );
    }

    // Fuzzy search path
    const isDigitsOnly = /^\d+$/.test(q!);
    const users = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        ...(isDigitsOnly
          ? { phone_number: { endsWith: q } }
          : { name: { contains: q, mode: "insensitive" } }),
      },
      select: { id: true, name: true, phone_number: true, points_balance: true },
      orderBy: { created_at: "desc" },
      take: 10,
    });

    return NextResponse.json({ data: { items: users } }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/staff/users]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
