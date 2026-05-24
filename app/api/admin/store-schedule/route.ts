import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWeeklySchedule } from "@/lib/storeSchedule";
import { updateStoreScheduleSchema } from "@/lib/validations/storeSchedule";

/** GET /api/admin/store-schedule — ADMIN only. Returns all schedule rows grouped by day. */
export async function GET(req: NextRequest) {
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

  try {
    const weekly = await getWeeklySchedule();
    return NextResponse.json({ data: weekly });
  } catch {
    return NextResponse.json(
      { error: "Lỗi server", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

/** PUT /api/admin/store-schedule — ADMIN only. Replaces entire schedule in a transaction. */
export async function PUT(req: NextRequest) {
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

  const parsed = updateStoreScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dữ liệu lịch không hợp lệ",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { schedules } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      // Delete all existing schedule rows
      await tx.storeSchedule.deleteMany();

      // Insert new rows
      const rows = schedules.flatMap((day) =>
        day.slots.map((slot, idx) => ({
          day_of_week: day.day_of_week,
          slot: idx + 1,
          open_time: slot.open_time,
          close_time: slot.close_time,
        })),
      );

      if (rows.length > 0) {
        await tx.storeSchedule.createMany({ data: rows });
      }
    });

    const updated = await getWeeklySchedule();
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json(
      { error: "Lỗi server", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
