import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

const MENU_IMAGES_BUCKET = "menu-images";
const PAGE_SIZE = 100;
const MENU_IMAGE_CACHE_CONTROL = "31536000";
const SUPPORTED_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MENU_IMAGE_UPLOAD_PRESETS = {
  full: { maxDimension: 800, quality: 75 },
  compact: { maxDimension: 320, quality: 70 },
} as const;

export const MENU_IMAGE_OUTPUT_CONTENT_TYPE = "image/webp";
export type MenuImageUploadPreset = keyof typeof MENU_IMAGE_UPLOAD_PRESETS;

let supabase: SupabaseClient | null = null;

/** Metadata needed by the orphan-image cleanup job. */
export interface MenuImageObject {
  path: string;
  createdAt: string | null;
  cacheControl: string | null;
  size: number | null;
}

/** Binary data downloaded from the menu image bucket. */
export interface DownloadedMenuImage {
  buffer: Buffer;
  contentType: string;
}

/** Inputs used to generate a collision-safe SEO storage path. */
export interface MenuImagePathInput {
  category: "latte" | "fusion" | "extras" | "addons" | "powders" | "milk-types";
  productName: string;
  requestedName?: string | null;
  contentType: string;
  suffix?: string;
}

function getSupabase(): SupabaseClient {
  if (supabase) return supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  // One-release compatibility bridge; remove the legacy fallback after rollout.
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "";
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase URL and a server secret key are required for storage operations.");
  }

  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
  return supabase;
}

function extensionForContentType(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensions[contentType];
  if (!extension) throw new Error("INVALID_IMAGE_CONTENT_TYPE");
  return extension;
}

function sanitizeImageSlug(value: string): string {
  return value
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/g, "");
}

function validateRequestedName(value: string): void {
  if (value.includes("..") || value.includes("/") || value.includes("\\") || value.includes("\0")) {
    throw new Error("INVALID_IMAGE_FILENAME");
  }
}

function publicUrlForPath(path: string): string {
  return getSupabase().storage.from(MENU_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Build a normalized product image path with a random collision suffix. */
export function buildMenuImagePath(input: MenuImagePathInput): string {
  const requestedName = input.requestedName?.trim() ?? "";
  validateRequestedName(requestedName);
  const slug = sanitizeImageSlug(requestedName || input.productName) || "san-pham";
  const suffix = (input.suffix ?? crypto.randomUUID().replace(/-/g, "").slice(0, 8))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  if (suffix.length !== 8) throw new Error("INVALID_IMAGE_SUFFIX");
  const extension = extensionForContentType(input.contentType);
  return `products/${input.category}/${slug}-${suffix}.${extension}`;
}

/** Infer the supported image MIME type from a current object path. */
export function contentTypeForMenuImagePath(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

/** Parse a menu-images public URL into its normalized object path. */
export function parseMenuImagePath(publicUrl: string): string | null {
  try {
    const marker = `/storage/v1/object/public/${MENU_IMAGES_BUCKET}/`;
    const url = new URL(publicUrl);
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    if (!path || path.startsWith("/") || path.split("/").includes("..")) return null;
    return path;
  } catch {
    return null;
  }
}

/** Optimize and upload a menu image without overwriting an existing storage object. */
export async function uploadMenuImage(
  fileName: string,
  buffer: Buffer,
  contentType: string,
  preset: MenuImageUploadPreset = "full",
): Promise<string> {
  if (!SUPPORTED_IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new Error("INVALID_IMAGE_CONTENT_TYPE");
  }
  const { maxDimension, quality } = MENU_IMAGE_UPLOAD_PRESETS[preset];
  const optimizedBuffer = await sharp(buffer)
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer();
  const bucket = getSupabase().storage.from(MENU_IMAGES_BUCKET);
  const { error } = await bucket.upload(fileName, optimizedBuffer, {
    contentType: MENU_IMAGE_OUTPUT_CONTENT_TYPE,
    cacheControl: MENU_IMAGE_CACHE_CONTROL,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return publicUrlForPath(fileName);
}

/** Download a menu image through the Storage SDK for safe server-side processing. */
export async function downloadMenuImage(path: string): Promise<DownloadedMenuImage> {
  const { data, error } = await getSupabase().storage.from(MENU_IMAGES_BUCKET).download(path);
  if (error) throw new Error(`Download failed: ${error.message}`);
  const contentType = data.type || contentTypeForMenuImagePath(path);
  if (!contentType || !SUPPORTED_IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new Error("INVALID_IMAGE_CONTENT_TYPE");
  }
  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType,
  };
}

/** Copy a menu image within the same bucket and return its new public URL. */
export async function copyMenuImage(fromPath: string, toPath: string): Promise<string> {
  const { error } = await getSupabase().storage
    .from(MENU_IMAGES_BUCKET)
    .copy(fromPath, toPath);
  if (error) throw new Error(`Copy failed: ${error.message}`);
  return publicUrlForPath(toPath);
}

/** Delete explicit menu image paths through the official Storage API. */
export async function removeMenuImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getSupabase().storage.from(MENU_IMAGES_BUCKET).remove(paths);
  if (error) throw new Error(`Remove failed: ${error.message}`);
}

async function listDirectory(path: string): Promise<MenuImageObject[]> {
  const bucket = getSupabase().storage.from(MENU_IMAGES_BUCKET);
  const files: MenuImageObject[] = [];
  const directories: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await bucket.list(path, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`List failed: ${error.message}`);

    for (const entry of data ?? []) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.id === null) directories.push(entryPath);
      else {
        const metadata = entry.metadata && typeof entry.metadata === "object"
          ? entry.metadata as Record<string, unknown>
          : {};
        const cacheControl = metadata.cacheControl ?? metadata.cache_control;
        const size = metadata.size;
        files.push({
          path: entryPath,
          createdAt: entry.created_at ?? entry.updated_at ?? null,
          cacheControl: typeof cacheControl === "string" ? cacheControl : null,
          size: typeof size === "number" ? size : null,
        });
      }
    }

    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  for (const directory of directories) {
    files.push(...await listDirectory(directory));
  }
  return files;
}

/** Recursively list every legacy and nested image in the menu bucket. */
export async function listMenuImages(): Promise<MenuImageObject[]> {
  return listDirectory("");
}
