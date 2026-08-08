import { captureServerException } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import {
  listMenuImages,
  parseMenuImagePath,
  removeMenuImages,
} from "@/lib/storage";

const ORPHAN_GRACE_MS = 48 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 100;

/** Summary returned by a menu image cleanup execution. */
export interface MenuImageCleanupResult {
  dry_run: boolean;
  scanned: number;
  referenced: number;
  eligible: number;
  deleted: number;
  skipped_recent: number;
  skipped_unknown_age: number;
  failed: number;
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/** Find and optionally delete unreferenced menu images older than the grace period. */
export async function runMenuImageCleanup(options: {
  now?: Date;
  dryRun: boolean;
}): Promise<MenuImageCleanupResult> {
  const now = options.now ?? new Date();
  const rows = await prisma.menuItem.findMany({
    where: { image_url: { not: null } },
    select: { image_url: true },
  });
  const referencedPaths = new Set(
    rows.flatMap((row) => {
      const path = row.image_url ? parseMenuImagePath(row.image_url) : null;
      return path ? [path] : [];
    }),
  );
  const objects = await listMenuImages();
  const eligiblePaths: string[] = [];
  let skippedRecent = 0;
  let skippedUnknownAge = 0;

  for (const object of objects) {
    if (referencedPaths.has(object.path)) continue;
    if (!object.createdAt) {
      skippedUnknownAge += 1;
      continue;
    }
    const createdAt = new Date(object.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      skippedUnknownAge += 1;
      continue;
    }
    if (now.getTime() - createdAt.getTime() < ORPHAN_GRACE_MS) {
      skippedRecent += 1;
      continue;
    }
    eligiblePaths.push(object.path);
  }

  console.info("[menu-image-cleanup] candidates", eligiblePaths);
  let deleted = 0;
  let failed = 0;
  if (!options.dryRun) {
    for (const batch of batches(eligiblePaths, DELETE_BATCH_SIZE)) {
      try {
        await removeMenuImages(batch);
        deleted += batch.length;
      } catch (error) {
        failed += batch.length;
        captureServerException(error, {
          operation: "menu_image_cleanup",
          batch_size: String(batch.length),
        });
      }
    }
  }

  return {
    dry_run: options.dryRun,
    scanned: objects.length,
    referenced: referencedPaths.size,
    eligible: eligiblePaths.length,
    deleted,
    skipped_recent: skippedRecent,
    skipped_unknown_age: skippedUnknownAge,
    failed,
  };
}
