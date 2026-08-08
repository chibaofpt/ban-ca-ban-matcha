import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function hashCredential(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Return a fail-closed error response unless the request has the configured cron bearer token. */
export function verifyCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  if (!timingSafeEqual(hashCredential(provided), hashCredential(expected))) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  return null;
}
