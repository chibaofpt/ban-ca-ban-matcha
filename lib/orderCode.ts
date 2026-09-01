import type { Prisma } from "@prisma/client";

/** Unambiguous alphanumeric charset — excludes 0/O, 1/I, L */
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_RETRIES = 10;

/** Generates a random 6-character alphanumeric suffix. */
function randomSuffix(): string {
  let result = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return result;
}

/**
 * Generates a unique order code in the format BCBM-XXXXXX.
 * Retries up to MAX_RETRIES times if a collision is detected.
 */
export async function generateOrderCode(prisma: Pick<Prisma.TransactionClient, "order">): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = `BCBM-${randomSuffix()}`;
    const existing = await prisma.order.findUnique({
      where: { order_code: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error(
    `[generateOrderCode] Failed to generate unique order code after ${MAX_RETRIES} attempts`
  );
}
