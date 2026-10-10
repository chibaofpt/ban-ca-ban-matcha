export interface AccountIdentityInput {
  password_hash: string | null;
  google_sub: string | null;
  account_origin: "LEGACY_PHONE" | "GOOGLE_EMAIL";
  role: string;
  is_blocked: boolean;
  phone_number: string | null;
  merged: boolean;
}

export interface LegacyGhostEvidence {
  hasEarnedPoints: boolean;
  hasVouchers: boolean;
}

/** Classify accounts with a password credential or a Google subject as registered. */
export function isRegisteredAccount(user: AccountIdentityInput): boolean {
  return hasPasswordCredential(user.password_hash) || Boolean(user.google_sub?.trim());
}

/** Determine whether an unclaimed legacy customer ghost has evidence worth claiming. */
export function canClaimLegacyGhost(user: AccountIdentityInput, evidence: LegacyGhostEvidence): boolean {
  return isEligibleLegacyCustomer(user)
    && !isRegisteredAccount(user)
    && (evidence.hasEarnedPoints || evidence.hasVouchers);
}

/** Determine whether a Google-linked legacy customer may create its first password. */
export function canSetInitialPassword(user: AccountIdentityInput): boolean {
  return isEligibleLegacyCustomer(user)
    && Boolean(user.google_sub?.trim())
    && !hasPasswordCredential(user.password_hash);
}

function hasPasswordCredential(value: string | null): boolean {
  return Boolean(value?.trim()) && value?.trim() !== "GHOST_USER_NO_PASSWORD";
}

function isEligibleLegacyCustomer(user: AccountIdentityInput): boolean {
  return user.role === "CUSTOMER"
    && !user.is_blocked
    && !user.merged
    && user.account_origin === "LEGACY_PHONE"
    && Boolean(user.phone_number?.trim());
}