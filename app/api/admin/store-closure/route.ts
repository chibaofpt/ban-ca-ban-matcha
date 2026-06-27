import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toggleStoreClosureSchema } from "@/lib/validations/storeSchedule";
import { invalidateStoreCaches } from "@/lib/cacheInvalidation";

/** POST /api/admin/store-closure — ADMIN only. Opens or temporarily closes the store. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Chưa đăng nhập", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Không có quyền truy cập", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body không hợp lệ", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const parsed = toggleStoreClosureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dữ liệu không hợp lệ",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { action, note } = parsed.data;

  try {
    if (action === "close") {
      // Deactivate any existing active closure first (safety measure)
      await prisma.storeTemporaryClosure.updateMany({
        where: { is_active: true },
        data: { is_active: false, opened_at: new Date() },
      });

      // Insert new closure record
      const closure = await prisma.storeTemporaryClosure.create({
        data: {
          is_active: true,
          note: note ?? null,
          closed_at: new Date(),
        },
      });

      await invalidateStoreCaches();
      return NextResponse.json({
        data: {
          is_active: closure.is_active,
          note: closure.note,
          closed_at: closure.closed_at.toISOString(),
        },
      });
    } else {
      // action === "open"
      const existing = await prisma.storeTemporaryClosure.findFirst({
        where: { is_active: true },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Cửa hàng không đang tạm đóng", code: "CONFLICT" },
          { status: 409 },
        );
      }

      await prisma.storeTemporaryClosure.update({
        where: { id: existing.id },
        data: { is_active: false, opened_at: new Date() },
      });

      await invalidateStoreCaches();
      return NextResponse.json({ data: { is_active: false } });
    }
  } catch {
    return NextResponse.json(
      { error: "Lỗi server", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
