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
      select: { qr_token: true, name: true, role: true },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({
      data: staff.map((member) => ({
        qr_token: member.qr_token,
        // One-release compatibility alias. This is the public token, never users.id.
        id: member.qr_token,
        name: member.name,
        role: member.role,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
