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
  const errMsg = message || "Operational error";
  void error;
  void context;

  try {
    await prisma.systemLog.create({
      data: {
        level,
        source,
        message: errMsg,
        stack: null,
        context: undefined,
      },
    });
  } catch (err) {
    // Fallback if DB logging fails
    console.error("[SystemLog] FAILED to write to DB", {
      name: err instanceof Error ? err.name : typeof err,
    });
    console.error(`[${level.toUpperCase()}] [${source}]`, errMsg);
  }
}
