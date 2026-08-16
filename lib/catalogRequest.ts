import { NextResponse } from "next/server";

type ParsedCatalogRequest = {
  ok: true;
  raw: unknown;
  imageFile: File | null;
};

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
  return {
    ok: true,
    raw: {
      ...raw,
      ...(typeof imageFilename === "string" && imageFilename.length > 0
        ? { image_filename: imageFilename }
        : {}),
    },
    imageFile: candidate instanceof File && candidate.size > 0 ? candidate : null,
  };
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
