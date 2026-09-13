import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWelcomeReward } from "@/lib/welcomeReward";
import { toWelcomeRewardDto } from "@/lib/welcomeRewardDto";

/** Returns the authenticated customer's durable welcome reward. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "CUSTOMER") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  try {
    const reward = await getWelcomeReward(prisma, session.id);
    const dto = reward
      ? await toWelcomeRewardDto(prisma, reward)
      : null;
    return NextResponse.json({ data: { reward: dto } });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
