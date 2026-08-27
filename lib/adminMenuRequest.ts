import { NextResponse } from "next/server";

type ParsedMenuUpdate = {
  ok: true;
  raw: Record<string, unknown>;
  imageFile: File | null;
};

type InvalidMenuUpdate = { ok: false; response: NextResponse };

function invalidJsonField(field: string): InvalidMenuUpdate {
  return {
    ok: false,
    response: NextResponse.json(
      { error: `Định dạng ${field} không hợp lệ`, code: "VALIDATION_ERROR" },
      { status: 400 },
    ),
  };
}

function parseJsonField(
  formData: FormData,
  raw: Record<string, unknown>,
  field: string,
): InvalidMenuUpdate | null {
  const value = formData.get(field);
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    raw[field] = JSON.parse(value);
    return null;
  } catch {
    return invalidJsonField(field);
  }
}

/** Parse the JSON or multipart payload accepted by the admin menu update route. */
export async function parseAdminMenuUpdate(
  request: Request,
): Promise<ParsedMenuUpdate | InvalidMenuUpdate> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      ok: true,
      raw: (await request.json().catch(() => null)) ?? {},
      imageFile: null,
    };
  }

  const formData = await request.formData();
  const powderId = formData.get("matcha_powder_id");
  const defaultPowderId = formData.get("default_powder_id");
  const defaultBaseLiquidId = formData.get("default_base_liquid_id");
  const raw: Record<string, unknown> = {
    name: formData.get("name") || undefined,
    description: formData.get("description") || undefined,
    is_seasonal: parseOptionalBoolean(formData.get("is_seasonal")),
    is_available: parseOptionalBoolean(formData.get("is_available")),
    sort_order: formData.get("sort_order")
      ? Number(formData.get("sort_order"))
      : undefined,
    unit_price_vnd: formData.get("unit_price_vnd")
      ? Number(formData.get("unit_price_vnd"))
      : undefined,
    confirm_price_change: parseOptionalBoolean(formData.get("confirm_price_change")),
    matcha_powder_id:
      typeof powderId === "string" && /^[0-9a-fA-F]{8}-/.test(powderId)
        ? powderId
        : undefined,
    default_powder_id:
      typeof defaultPowderId === "string" && /^[0-9a-fA-F]{8}-/.test(defaultPowderId)
        ? defaultPowderId
        : undefined,
    default_base_liquid_id:
      typeof defaultBaseLiquidId === "string" && /^[0-9a-fA-F]{8}-/.test(defaultBaseLiquidId)
        ? defaultBaseLiquidId
        : undefined,
    base_liquid_note: formData.get("base_liquid_note") || undefined,
    image_filename: formData.get("image_filename") || undefined,
  };

  for (const field of ["sizes", "custom_powder_grams", "allowed_powder_ids", "allowed_base_liquid_ids"]) {
    const error = parseJsonField(formData, raw, field);
    if (error) return error;
  }

  const candidate = formData.get("image");
  return {
    ok: true,
    raw,
    imageFile: candidate instanceof File && candidate.size > 0 ? candidate : null,
  };
}

function parseOptionalBoolean(value: FormDataEntryValue | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}
