import type {
  CustomerProfile,
  UpdateProfilePayload,
} from "@/src/lib/types/user";

export interface ProfileEditValues {
  name: string;
  insta_name: string;
  current_password: string;
}

/** Normalize an Instagram form value without the decorative @ prefix. */
export function normalizeProfileInstagram(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

/** Return true when editable profile values differ after normalization. */
export function hasProfileChanges(
  profile: CustomerProfile,
  values: ProfileEditValues,
): boolean {
  const nameChanged = values.name.trim() !== profile.name;
  const normalizedInstagram = normalizeProfileInstagram(values.insta_name);
  const instagramChanged =
    (normalizedInstagram || null) !== profile.insta_name;
  return nameChanged || instagramChanged;
}

/** Build the minimal PATCH payload from dirty profile form values. */
export function buildProfilePatchPayload(
  profile: CustomerProfile,
  values: ProfileEditValues,
): UpdateProfilePayload {
  const payload: UpdateProfilePayload = {};
  const normalizedName = values.name.trim();
  const normalizedInstagram = normalizeProfileInstagram(values.insta_name);
  const instagramChanged =
    (normalizedInstagram || null) !== profile.insta_name;

  if (normalizedName !== profile.name) payload.name = normalizedName;
  if (instagramChanged) {
    payload.insta_name = normalizedInstagram || null;
    payload.current_password = values.current_password;
  }
  return payload;
}
