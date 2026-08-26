import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { effectiveVoucherStatus } from "@/lib/adminVoucherInsights";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(51).transform((value) => value.startsWith("@") ? value.slice(1) : value).pipe(z.string().min(2).max(50)),
  status: z.enum(["ALL", "ACTIVE", "RESERVED", "REDEEMED", "EXPIRED", "REFUNDED"]).default("ALL"),
  cursor: z.string().trim().min(1).optional(),
});

function searchVariants(rawQuery: string): string[] {
  const clean = rawQuery;
  const variants = [clean];
  if (/^0\d+$/.test(clean)) variants.push(`+84${clean.slice(1)}`);
  if (/^\+84\d+$/.test(clean)) variants.push(`0${clean.slice(3)}`);
  return [...new Set(variants)];
}

function voucherStatusWhere(status: z.infer<typeof querySchema>["status"], now: Date) {
  if (status === "ALL") return undefined;
  if (status === "ACTIVE") return { status: "ACTIVE" as const, OR: [{ expires_at: null }, { expires_at: { gt: now } }] };
  if (status === "EXPIRED") return { OR: [{ status: "EXPIRED" as const }, { status: "ACTIVE" as const, expires_at: { lte: now } }] };
  return { status };
}

/** GET package owners with grouped public voucher instances — ADMIN only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid query", code: "VALIDATION_ERROR" }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Voucher package not found", code: "NOT_FOUND" }, { status: 404 });
  const now = new Date();
  const terms = searchVariants(parsed.data.q);
  try {
    const packageExists = await prisma.voucherPackage.findUnique({ where: { id }, select: { id: true } });
    if (!packageExists) return NextResponse.json({ error: "Voucher package not found", code: "NOT_FOUND" }, { status: 404 });
    const users = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        ...(parsed.data.cursor ? { qr_token: { gt: parsed.data.cursor } } : {}),
        vouchers: { some: { package_id: id, ...voucherStatusWhere(parsed.data.status, now) } },
        OR: terms.flatMap((term) => [
          { name: { contains: term, mode: "insensitive" as const } },
          { insta_name: { contains: term, mode: "insensitive" as const } },
          { phone_number: { contains: term } },
        ]),
      },
      orderBy: { qr_token: "asc" },
      take: 21,
      select: {
        qr_token: true, name: true, insta_name: true, phone_number: true,
        vouchers: {
          where: { package_id: id, ...voucherStatusWhere(parsed.data.status, now) },
          orderBy: { created_at: "desc" },
          select: { qr_token: true, status: true, issued_via: true, created_at: true, expires_at: true, redeemed_at: true, used_channel: true },
        },
      },
    });
    const hasMore = users.length > 20;
    const page = users.slice(0, 20);
    return NextResponse.json({ data: {
      users: page.map((user) => ({ ...user, vouchers: user.vouchers.map((voucher) => ({ ...voucher, effective_status: effectiveVoucherStatus(voucher, now) })) })),
      next_cursor: hasMore ? page.at(-1)?.qr_token ?? null : null,
    } });
  } catch (error) {
    console.error("[GET /api/admin/voucher-packages/[id]/owners]", error);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
