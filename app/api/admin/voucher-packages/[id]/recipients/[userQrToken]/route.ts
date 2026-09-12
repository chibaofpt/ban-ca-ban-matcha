import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import {
  effectiveAdminGrantStatus,
  getAdminVoucherRecipientSummary,
  type AdminVoucherGrantDatabase,
} from "@/lib/adminVoucherGrant";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["ALL", "CURRENT", "USED"]).default("ALL");
const uuidSchema = z.string().uuid();

interface RecipientCursor {
  created_at: string;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ created_at: createdAt.toISOString(), id }), "utf8").toString("base64url");
}

function decodeCursor(raw: string): RecipientCursor | null {
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<RecipientCursor>;
    if (typeof value.created_at !== "string" || Number.isNaN(new Date(value.created_at).getTime()) || typeof value.id !== "string" || !uuidSchema.safeParse(value.id).success) return null;
    return { created_at: new Date(value.created_at).toISOString(), id: value.id };
  } catch {
    return null;
  }
}

function statusWhere(status: z.infer<typeof statusSchema>, now: Date): Prisma.VoucherWhereInput {
  if (status === "CURRENT") {
    return {
      OR: [
        { status: "RESERVED" },
        { status: "ACTIVE", OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      ],
    };
  }
  if (status === "USED") return { status: "REDEEMED" };
  return {};
}

/** Returns bounded package history for one public CUSTOMER token without expiring rows. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userQrToken: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  const { id: packageId, userQrToken } = await params;
  if (!uuidSchema.safeParse(packageId).success || !uuidSchema.safeParse(userQrToken).success) {
    return NextResponse.json({ error: "Resource not found", code: "NOT_FOUND" }, { status: 404 });
  }
  const status = statusSchema.safeParse(req.nextUrl.searchParams.get("status") ?? "ALL");
  const rawCursor = req.nextUrl.searchParams.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (!status.success || (rawCursor !== null && !cursor)) {
    return NextResponse.json({ error: "Invalid pagination", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { qr_token: userQrToken },
      select: { id: true, qr_token: true, name: true, phone_number: true, role: true },
    });
    if (!user) return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
    if (user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Recipient is not a customer", code: "BUSINESS_RULE_VIOLATION", details: { reason: "RECIPIENT_NOT_CUSTOMER" } }, { status: 422 });
    }

    const now = new Date();
    const lifecycleWhere = statusWhere(status.data, now);
    const cursorWhere: Prisma.VoucherWhereInput = cursor
      ? { OR: [{ created_at: { lt: new Date(cursor.created_at) } }, { created_at: new Date(cursor.created_at), id: { lt: cursor.id } }] }
      : {};
    const lifecycleAndCursor: Prisma.VoucherWhereInput[] = [];
    if (Object.keys(lifecycleWhere).length > 0) lifecycleAndCursor.push(lifecycleWhere);
    if (Object.keys(cursorWhere).length > 0) lifecycleAndCursor.push(cursorWhere);
    const [fresh, vouchers] = await Promise.all([
      getAdminVoucherRecipientSummary(prisma as unknown as AdminVoucherGrantDatabase, packageId, user.id, now),
      prisma.voucher.findMany({
        where: {
          package_id: packageId,
          user_id: user.id,
          ...(lifecycleAndCursor.length > 0 ? { AND: lifecycleAndCursor } : {}),
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 21,
        select: { id: true, qr_token: true, issued_via: true, status: true, created_at: true, expires_at: true, redeemed_at: true },
      }),
    ]);
    if (!fresh) return NextResponse.json({ error: "Voucher package not found", code: "NOT_FOUND" }, { status: 404 });
    const hasMore = vouchers.length > 20;
    const page = vouchers.slice(0, 20);
    const next = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!.created_at, page[page.length - 1]!.id) : null;
    return NextResponse.json({
      data: {
        user: { qr_token: user.qr_token, name: user.name, phone_number: user.phone_number },
        vouchers: page.map((voucher) => ({
          qr_token: voucher.qr_token,
          issued_via: voucher.issued_via,
          created_at: voucher.created_at,
          effective_status: effectiveAdminGrantStatus(voucher, now),
          expires_at: voucher.expires_at,
          redeemed_at: voucher.redeemed_at,
        })),
        meta: { has_more: hasMore, next_cursor: next },
        summary: { ...fresh.summary, expiry_preview: fresh.summary.expiry_preview?.toISOString() ?? null },
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/voucher-packages/[id]/recipients/[userQrToken]]", { name: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
