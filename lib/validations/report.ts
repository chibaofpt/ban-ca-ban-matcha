import { z } from "zod";

/** Zod schema for GET /api/report query params */
export const reportQuerySchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  /** Admin only — filter by specific staff user id */
  staffId: z.string().uuid().optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
