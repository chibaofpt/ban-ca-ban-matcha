import { z } from "zod";

/** Zod schema for GET /api/report query params */
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "date must be a real Gregorian date");

export const reportQuerySchema = z.object({
  startDate: z
    .string().pipe(dateSchema),
  endDate: z.string().pipe(dateSchema),
  /** Admin only — public staff qr_token; legacy UUID accepted server-side for one release. */
  staffId: z.string().min(1).max(255).optional(),
}).superRefine(({ startDate, endDate }, ctx) => {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const calendarDays = (end - start) / 86_400_000 + 1;
  if (end < start) ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must not precede startDate" });
  if (calendarDays > 366) ctx.addIssue({ code: "custom", path: ["endDate"], message: "range must not exceed 366 days" });
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
