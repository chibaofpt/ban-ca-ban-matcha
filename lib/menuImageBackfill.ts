export const STAGING_SUPABASE_PROJECT_REF = "mnklsbzkefuefpqvghrr";
const REQUIRED_CACHE_TTL_SECONDS = 31_536_000;

export type MenuImageReferenceSource = "menuItem" | "matchaPowder" | "milkType" | "addonGroup";
export type MenuImageStorageCategory = "latte" | "fusion" | "extras" | "powders" | "milk-types" | "addons";

/** One database field that currently references an image in the menu bucket. */
export interface MenuImageReference {
  source: MenuImageReferenceSource;
  id: string;
  name: string;
  category: MenuImageStorageCategory;
  imageUrl: string;
}

/** Storage metadata used to decide whether an object already satisfies the target format. */
export interface BackfillMenuImageObject {
  path: string;
  createdAt: string | null;
  cacheControl: string | null;
  size: number | null;
}

/** Side effects injected into the staging-only backfill workflow. */
export interface MenuImageBackfillDependencies {
  listReferences: () => Promise<MenuImageReference[]>;
  listObjects: () => Promise<BackfillMenuImageObject[]>;
  downloadImage: (path: string) => Promise<{ buffer: Buffer; contentType: string }>;
  uploadImage: (path: string, buffer: Buffer, contentType: string) => Promise<string>;
  updateReference: (
    reference: MenuImageReference,
    oldUrl: string,
    newUrl: string,
  ) => Promise<boolean>;
  removeImages: (paths: string[]) => Promise<void>;
  buildOutputPath: (reference: MenuImageReference) => string;
}

/** Summary printed by dry-run and apply modes. */
export interface MenuImageBackfillResult {
  scanned: number;
  eligible: number;
  optimized: number;
  skipped: number;
  failed: number;
}

interface RunMenuImageBackfillInput {
  apply: boolean;
  supabaseUrl: string;
  dependencies: MenuImageBackfillDependencies;
}

function projectRefFromUrl(supabaseUrl: string): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    if (!hostname.endsWith(".supabase.co")) return null;
    return hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function parseMenuImagePath(publicUrl: string): string | null {
  try {
    const marker = "/storage/v1/object/public/menu-images/";
    const url = new URL(publicUrl);
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(url.pathname.slice(index + marker.length));
    if (!path || path.startsWith("/") || path.split("/").includes("..")) return null;
    return path;
  } catch {
    return null;
  }
}

function cacheTtlSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 0;
  const maxAge = cacheControl.match(/max-age\s*=\s*(\d+)/i)?.[1];
  const plainSeconds = cacheControl.match(/^\s*(\d+)\s*$/)?.[1];
  return Number(maxAge ?? plainSeconds ?? 0);
}

function alreadyOptimized(path: string, object: BackfillMenuImageObject | undefined): boolean {
  return path.toLowerCase().endsWith(".webp")
    && cacheTtlSeconds(object?.cacheControl ?? null) >= REQUIRED_CACHE_TTL_SECONDS;
}

/** Run an inventory or safe compare-and-swap backfill against the locked staging project. */
export async function runMenuImageBackfill(
  input: RunMenuImageBackfillInput,
): Promise<MenuImageBackfillResult> {
  if (projectRefFromUrl(input.supabaseUrl) !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("STAGING_PROJECT_REF_REQUIRED");
  }

  const references = await input.dependencies.listReferences();
  const objects = await input.dependencies.listObjects();
  const objectsByPath = new Map(objects.map((object) => [object.path, object]));
  const result: MenuImageBackfillResult = {
    scanned: references.length,
    eligible: 0,
    optimized: 0,
    skipped: 0,
    failed: 0,
  };

  for (const reference of references) {
    const oldPath = parseMenuImagePath(reference.imageUrl);
    if (!oldPath || alreadyOptimized(oldPath, objectsByPath.get(oldPath))) {
      result.skipped += 1;
      continue;
    }
    result.eligible += 1;
    if (!input.apply) continue;

    const newPath = input.dependencies.buildOutputPath(reference);
    let uploaded = false;
    try {
      const downloaded = await input.dependencies.downloadImage(oldPath);
      const newUrl = await input.dependencies.uploadImage(
        newPath,
        downloaded.buffer,
        downloaded.contentType,
      );
      uploaded = true;
      const updated = await input.dependencies.updateReference(
        reference,
        reference.imageUrl,
        newUrl,
      );
      if (!updated) throw new Error("IMAGE_REFERENCE_CHANGED");
      result.optimized += 1;
    } catch {
      if (uploaded) {
        try {
          await input.dependencies.removeImages([newPath]);
        } catch {
          // The failed cleanup is reflected by the same failed item and surfaced in the CLI summary.
        }
      }
      result.failed += 1;
    }
  }

  return result;
}
