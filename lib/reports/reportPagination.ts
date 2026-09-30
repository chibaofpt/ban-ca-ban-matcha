/** Signal that a report exceeds the approved bounded workload. */
export class ReportRangeTooLargeError extends Error {}

/** Collect deterministic pages only after the same snapshot has passed its count gate. */
export async function collectReportPages<T>(
  count: () => Promise<number>,
  readPage: (skip: number, take: number) => Promise<T[]>,
): Promise<T[]> {
  const total = await count();
  if (total > 10_000) throw new ReportRangeTooLargeError();
  const rows: T[] = [];
  // Read one page for an empty snapshot too, preserving a single deterministic query shape.
  for (let skip = 0; skip < Math.max(1, total); skip += 100) {
    const page = await readPage(skip, 100);
    rows.push(...page);
    if (rows.length > 10_000) throw new ReportRangeTooLargeError();
    if (page.length < 100) break;
  }
  return rows;
}
