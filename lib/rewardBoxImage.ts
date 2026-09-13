import { captureServerException } from "@/lib/observability";
import {
  MENU_IMAGE_OUTPUT_CONTENT_TYPE,
  buildMenuImagePath,
  parseMenuImagePath,
  removeMenuImages,
  uploadMenuImage,
} from "@/lib/storage";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_COMBINED_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type RewardBoxImageReason = "INVALID_IMAGE_CONTENT_TYPE" | "IMAGE_TOO_LARGE" | "COMBINED_IMAGES_TOO_LARGE";

export class RewardBoxImageError extends Error {
  constructor(public readonly reason: RewardBoxImageReason) { super(reason); }
}

export interface RewardBoxImageAdapter {
  uploadMenuImage(path: string, buffer: Buffer, contentType: string, preset: "reward-box"): Promise<string>;
  removeMenuImages(paths: string[]): Promise<void>;
}

const defaultAdapter: RewardBoxImageAdapter = { uploadMenuImage, removeMenuImages };

export interface PreparedRewardBoxImages {
  closed?: { url: string; path: string };
  open?: { url: string; path: string };
}

function validateFiles(files: File[]): void {
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) throw new RewardBoxImageError("INVALID_IMAGE_CONTENT_TYPE");
    if (file.size > MAX_FILE_BYTES) throw new RewardBoxImageError("IMAGE_TOO_LARGE");
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_COMBINED_BYTES) {
    throw new RewardBoxImageError("COMBINED_IMAGES_TOO_LARGE");
  }
}

/** Validate and upload supplied closed/open reward-box images with pair rollback. */
export async function prepareRewardBoxImages(
  input: { name: string; closedImage?: File | null; openImage?: File | null },
  adapter: RewardBoxImageAdapter = defaultAdapter,
): Promise<PreparedRewardBoxImages> {
  const entries = ([
    ["closed", input.closedImage], ["open", input.openImage],
  ] as const).filter((entry): entry is readonly ["closed" | "open", File] => entry[1] instanceof File);
  validateFiles(entries.map(([, file]) => file));
  const prepared: PreparedRewardBoxImages = {};
  try {
    for (const [kind, file] of entries) {
      const path = buildMenuImagePath({
        category: "reward-boxes", productName: `${input.name}-${kind}`,
        requestedName: `${input.name}-${kind}`, contentType: MENU_IMAGE_OUTPUT_CONTENT_TYPE,
      });
      const url = await adapter.uploadMenuImage(path, Buffer.from(await file.arrayBuffer()), file.type, "reward-box");
      prepared[kind] = { url, path };
    }
    return prepared;
  } catch (error) {
    const paths = Object.values(prepared).map((item) => item.path);
    if (paths.length) await adapter.removeMenuImages(paths).catch(() => undefined);
    throw error;
  }
}

/** Remove newly uploaded image paths, suppressing cleanup failure after another failure. */
export async function rollbackRewardBoxImages(images: PreparedRewardBoxImages, adapter: RewardBoxImageAdapter = defaultAdapter): Promise<void> {
  const paths = Object.values(images).map((item) => item.path);
  if (paths.length) await adapter.removeMenuImages(paths).catch(() => undefined);
}

/** Best-effort delete committed box image URLs while logging only operation metadata. */
export async function removeRewardBoxUrlsBestEffort(urls: Array<string | null | undefined>, adapter: RewardBoxImageAdapter = defaultAdapter): Promise<void> {
  const paths = urls.flatMap((url) => {
    const path = url ? parseMenuImagePath(url) : null;
    return path ? [path] : [];
  });
  if (!paths.length) return;
  try {
    await adapter.removeMenuImages(paths);
  } catch (error) {
    captureServerException(error, { operation: "reward_box_image_cleanup", path_count: String(paths.length) });
  }
}
