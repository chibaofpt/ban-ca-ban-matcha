import { NextResponse } from "next/server";

type ParsedCatalogRequest = {
  ok: true;
  raw: unknown;
  imageFile: File | null;
  optionImages: CatalogOptionImage[];
};

export interface CatalogOptionImage {
  imageKey: string;
  imageFile: File | null;
  requestedName?: string;
}

type InvalidCatalogRequest = {
  ok: false;
  response: NextResponse;
};

/** Parse backward-compatible JSON or multipart catalog mutations. */
export async function parseCatalogRequest(
  request: Request,
): Promise<ParsedCatalogRequest | InvalidCatalogRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      ok: true,
      raw: await request.json().catch(() => null),
      imageFile: null,
      optionImages: [],
    };
  }

  const formData = await request.formData();
  const payload = formData.get("payload");
  if (typeof payload !== "string") {
    return invalidPayload();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return invalidPayload();
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return invalidPayload();
  }

  const imageFilename = formData.get("image_filename");
  const candidate = formData.get("image");
  const optionImages = parseOptionImages(formData);
  if (!optionImages) return invalidPayload();
  return {
    ok: true,
    raw: {
      ...raw,
      ...(typeof imageFilename === "string" && imageFilename.length > 0
        ? { image_filename: imageFilename }
        : {}),
    },
    imageFile: candidate instanceof File && candidate.size > 0 ? candidate : null,
    optionImages,
  };
}

function parseOptionImages(formData: FormData): CatalogOptionImage[] | null {
  const records = new Map<string, CatalogOptionImage>();
  const filenamePrefix = "option_image_filename_";
  const imagePrefix = "option_image_";

  for (const [field, value] of formData.entries()) {
    if (field.startsWith(filenamePrefix)) {
      const imageKey = field.slice(filenamePrefix.length);
      if (!isValidImageKey(imageKey) || typeof value !== "string") return null;
      const current = records.get(imageKey) ?? { imageKey, imageFile: null };
      if (current.requestedName !== undefined) return null;
      current.requestedName = value.trim() || undefined;
      records.set(imageKey, current);
      continue;
    }
    if (!field.startsWith(imagePrefix)) continue;
    const imageKey = field.slice(imagePrefix.length);
    if (!isValidImageKey(imageKey) || !(value instanceof File) || value.size === 0) return null;
    const current = records.get(imageKey) ?? { imageKey, imageFile: null };
    if (current.imageFile) return null;
    current.imageFile = value;
    records.set(imageKey, current);
  }

  return [...records.values()];
}

function isValidImageKey(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

function invalidPayload(): InvalidCatalogRequest {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "Dữ liệu biểu mẫu không hợp lệ", code: "VALIDATION_ERROR" },
      { status: 400 },
    ),
  };
}
