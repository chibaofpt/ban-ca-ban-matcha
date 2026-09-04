import type { Prisma, PrismaClient } from "@prisma/client";

/** Run a Serializable transaction, retrying only PostgreSQL write conflicts (P2034). */
export async function runSerializableTransaction<T>(
  client: Pick<PrismaClient, "$transaction">,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: "Serializable",
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error) {
      if (
        attempt === 3 ||
        !(error instanceof Error && "code" in error && error.code === "P2034")
      ) {
        throw error;
      }
    }
  }
  throw new Error("Unreachable transaction retry state");
}
