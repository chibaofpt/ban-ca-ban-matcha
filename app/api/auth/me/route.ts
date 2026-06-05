/**
 * GET /api/auth/me — Returns the current session's user role from the access token.
 *
 * Used by the AdminLoginPage to check if a user is already logged in as ADMIN/STAFF
 * so they can be redirected to their dashboard without seeing the login form.
 *
 * No DB query — purely reads and verifies the httpOnly access_token cookie.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    data: {
      role: session.role,
      id: session.id,
    },
  });
}
