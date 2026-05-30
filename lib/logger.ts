import { prisma } from "@/lib/prisma";

export type LogLevel = "info" | "warn" | "error";

interface LogParams {
  level?: LogLevel;
  source: string;
  message: string;
  error?: unknown;
  context?: Record<string, unknown> | null;
}

/**
 * Global logging utility. Writes to the SystemLog table in Prisma.
 * Always handles internal errors gracefully (will fallback to console.error)
 * so it doesn't crash the application if the DB write fails.
 */
export async function logSystemEvent({
  level = "error",
  source,
  message,
  error,
  context = null,
}: LogParams) {
  let stack: string | null = null;
  let errMsg = message;

  if (error instanceof Error) {
    if (!errMsg) errMsg = error.message;
    stack = error.stack ?? null;
  } else if (error) {
    stack = String(error);
  }

  try {
    await prisma.systemLog.create({
      data: {
        level,
        source,
        message: errMsg,
        stack,
        context: context ? JSON.parse(JSON.stringify(context)) : null,
      },
    });
  } catch (err) {
    // Fallback if DB logging fails
    console.error("[SystemLog] FAILED to write to DB:", err);
    console.error(`[${level.toUpperCase()}] [${source}]`, errMsg, stack, context);
  }
}
