import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * GET /api/auth/me
 * Returns the current user's id and role from the access_token JWT.
 * No DB query — purely verifies the JWT. Fast, stateless.
 * Protected by middleware rate limiting (under /api/auth/*).
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  return NextResponse.json(
    { data: { id: session.id, role: session.role } },
    { status: 200 }
  );
}
