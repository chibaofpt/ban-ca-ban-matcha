import { z } from "zod";

const paginationValue = (fallback: number, maximum: number) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? fallback : value),
    z.coerce.number().int().min(1).max(maximum),
  );

export const pointsHistoryQuerySchema = z.object({
  page: paginationValue(1, 100),
  limit: paginationValue(10, 50),
  cursor: z.string().min(1).max(512).optional(),
});
