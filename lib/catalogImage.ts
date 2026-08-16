import {
  buildMenuImagePath,
  contentTypeForMenuImagePath,
  copyMenuImage,
  parseMenuImagePath,
  uploadMenuImage,
} from "@/lib/storage";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type CatalogImageKind = "addons" | "powders";

export interface PreparedCatalogImage {
  imageUrl: string | undefined;
  newPath: string | null;
  oldPath: string | null;
}

interface PrepareCatalogImageInput {
  kind: CatalogImageKind;
  entityName: string;
  requestedName?: string;
  imageFile: File | null;
  currentImageUrl: string | null;
}

/** Upload or SEO-rename an addon/powder image using the menu image bucket flow. */
export async function prepareCatalogImage(
  input: PrepareCatalogImageInput,
): Promise<PreparedCatalogImage> {
  const requestedName = input.requestedName?.trim();
  if (!input.imageFile && !requestedName) {
    return { imageUrl: undefined, newPath: null, oldPath: null };
  }

  const oldPath = input.currentImageUrl
    ? parseMenuImagePath(input.currentImageUrl)
    : null;

  if (input.imageFile) {
    validateImage(input.imageFile);
    const newPath = buildMenuImagePath({
      category: input.kind,
      productName: input.entityName,
      requestedName,
      contentType: input.imageFile.type,
    });
    const buffer = Buffer.from(await input.imageFile.arrayBuffer());
    const imageUrl = await uploadMenuImage(newPath, buffer, input.imageFile.type);
    return { imageUrl, newPath, oldPath };
  }

  const currentContentType = oldPath
    ? contentTypeForMenuImagePath(oldPath)
    : null;
  if (!oldPath || !currentContentType) throw new Error("NO_CURRENT_IMAGE");

  const newPath = buildMenuImagePath({
    category: input.kind,
    productName: input.entityName,
    requestedName,
    contentType: currentContentType,
  });
  const imageUrl = await copyMenuImage(oldPath, newPath);
  return { imageUrl, newPath, oldPath };
}

function validateImage(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("INVALID_IMAGE_CONTENT_TYPE");
  }
  if (file.size > MAX_IMAGE_SIZE) throw new Error("IMAGE_TOO_LARGE");
}

/** Convert known catalog image validation failures into user-facing Vietnamese messages. */
export function catalogImageValidationMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const messages: Record<string, string> = {
    INVALID_IMAGE_CONTENT_TYPE: "Định dạng ảnh không hỗ trợ (JPEG, PNG, WEBP)",
    IMAGE_TOO_LARGE: "Ảnh quá lớn (tối đa 5MB)",
    NO_CURRENT_IMAGE: "Không có ảnh hợp lệ để đổi tên",
    INVALID_IMAGE_FILENAME: "Tên file ảnh không hợp lệ",
  };
  return messages[error.message] ?? null;
}
