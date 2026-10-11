import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWelcomeRewardPreview } from "@/lib/rewards/welcomeRewardConfiguration";

export const dynamic = "force-dynamic";

/** Read the public welcome offer without creating an entitlement or exposing internal configuration. */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ data: await getWelcomeRewardPreview(prisma) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Quà chào mừng đang tạm gián đoạn.", code: "SERVICE_UNAVAILABLE" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
