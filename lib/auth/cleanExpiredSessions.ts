import { prisma } from "@/lib/prisma";

const SESSION_BATCH_SIZE = 500;
const MAX_BATCHES = 5;

/** Summary returned after one bounded expired-session cleanup run. */
export interface CleanExpiredSessionsResult {
  batches: number;
  selected: number;
  deleted: number;
  reached_batch_limit: boolean;
}

/** Delete expired sessions in at most five idempotent batches of 500 rows. */
export async function runCleanExpiredSessions(
  now: Date = new Date(),
): Promise<CleanExpiredSessionsResult> {
  let batches = 0;
  let selected = 0;
  let deleted = 0;
  let reachedBatchLimit = false;

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const sessions = await prisma.session.findMany({
      where: { expires_at: { lt: now } },
      select: { id: true },
      orderBy: { expires_at: "asc" },
      take: SESSION_BATCH_SIZE,
    });
    if (sessions.length === 0) break;

    const result = await prisma.session.deleteMany({
      where: {
        id: { in: sessions.map((session) => session.id) },
        expires_at: { lt: now },
      },
    });
    batches += 1;
    selected += sessions.length;
    deleted += result.count;

    if (sessions.length < SESSION_BATCH_SIZE) break;
    if (batch === MAX_BATCHES - 1) reachedBatchLimit = true;
  }

  return {
    batches,
    selected,
    deleted,
    reached_batch_limit: reachedBatchLimit,
  };
}
