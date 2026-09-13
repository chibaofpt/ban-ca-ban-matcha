import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openWelcomeReward, WelcomeRewardError } from "@/lib/welcomeReward";
import { toWelcomeRewardDto } from "@/lib/welcomeRewardDto";

const openWelcomeRewardSchema = z.object({
  reward_id: z.string().uuid(),
  box_id: z.string().uuid(),
  request_id: z.string().uuid(),
}).strict();

/** Opens one pending welcome reward for the authenticated customer. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "CUSTOMER") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  const parsed = openWelcomeRewardSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const reward = await openWelcomeReward(prisma, {
      userId: session.id,
      rewardId: parsed.data.reward_id,
      boxId: parsed.data.box_id,
      requestId: parsed.data.request_id,
    });
    const dto = await toWelcomeRewardDto(prisma, reward);
    return NextResponse.json({ data: { reward: dto } });
  } catch (error) {
    if (error instanceof WelcomeRewardError) {
      if (error.reason === "NOT_FOUND") return NextResponse.json({ error: "Reward not found", code: "NOT_FOUND" }, { status: 404 });
      if (error.reason === "CONFLICT") return NextResponse.json({ error: "Reward conflict", code: "CONFLICT" }, { status: 409 });
      return NextResponse.json({
        error: "Reward cannot be opened",
        code: "BUSINESS_RULE_VIOLATION",
        details: { reason: error.reason },
      }, { status: 422 });
    }
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
