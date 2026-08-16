import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const MENU_IMAGES_BUCKET = "menu-images";
const PAGE_SIZE = 100;

let supabase: SupabaseClient | null = null;

/** Metadata needed by the orphan-image cleanup job. */
export interface MenuImageObject {
  path: string;
  createdAt: string | null;
}

/** Inputs used to generate a collision-safe SEO storage path. */
export interface MenuImagePathInput {
  category: "latte" | "fusion" | "extras" | "addons" | "powders";
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

/** Upload a menu image without overwriting an existing storage object. */
export async function uploadMenuImage(
  fileName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const bucket = getSupabase().storage.from(MENU_IMAGES_BUCKET);
  const { error } = await bucket.upload(fileName, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return publicUrlForPath(fileName);
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
        files.push({
          path: entryPath,
          createdAt: entry.created_at ?? entry.updated_at ?? null,
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
