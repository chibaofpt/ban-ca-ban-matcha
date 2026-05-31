import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET /api/admin/staff — List all STAFF and ADMIN users for the report dropdown */
export async function GET() {
  // 1. Authenticate
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // 2. Role check — ADMIN only
  if (session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ["STAFF", "ADMIN"] } },
      select: { id: true, name: true, role: true },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({ data: staff });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
