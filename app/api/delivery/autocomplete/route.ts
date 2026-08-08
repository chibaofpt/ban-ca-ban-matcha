import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { goongAutocomplete } from "@/lib/goong";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";
import { autocompleteQuerySchema } from "@/lib/validations/delivery";
import { captureServerException } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Return bounded Goong address suggestions for an authenticated account. */
export async function GET(req: NextRequest) {
  const parsed = autocompleteQuerySchema.safeParse({
    q: req.nextUrl.searchParams.get("q") ?? undefined,
    session_token: req.nextUrl.searchParams.get("session_token") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const limit = await checkRateLimits([
    { ruleName: "deliveryAccount", identifier: session.id },
    { ruleName: "deliveryIp", identifier: getClientIp(req) },
  ]);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const predictions = await goongAutocomplete(parsed.data.q, parsed.data.session_token);
    return NextResponse.json({ data: predictions });
  } catch {
    captureServerException(new Error("Delivery autocomplete upstream failure"), {
      operation: "delivery_autocomplete",
    });
    return NextResponse.json(
      { error: "Failed to fetch address suggestions", code: "GOONG_API_ERROR" },
      { status: 502 }
    );
  }
}
