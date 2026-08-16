const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1_000;

/** Convert an inclusive Vietnam calendar date into its exclusive UTC end instant. */
export function toExclusiveEndIso(date: string): string | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1) - VIETNAM_OFFSET_MS)
    .toISOString();
}

/** Format an exclusive end instant as the final usable Vietnam calendar date. */
export function formatInclusiveEndDate(iso: string): string {
  const finalInstant = new Date(new Date(iso).getTime() - 1);
  return finalInstant.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
