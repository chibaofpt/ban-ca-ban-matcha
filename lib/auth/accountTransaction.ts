import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/serializableTransaction";
/** Use the shared bounded Serializable transaction owner for account workflows. */
export async function accountTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return runSerializableTransaction(prisma, work);
}