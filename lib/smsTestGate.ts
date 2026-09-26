const SMS_TEST_GATE_REQUIREMENTS = [
  { key: "ABENLA_SMS_TEST_ENABLED", expected: "true" },
  { key: "NEXT_PUBLIC_APP_ENV", expected: "staging" },
  { key: "VERCEL_ENV", expected: "preview" },
] as const;

/** Describes which environment gate values block the staging SMS test surface. */
export interface SmsTestGateStatus {
  enabled: boolean;
  missing: string[];
  invalid: string[];
}

/** Returns a secret-free diagnostic for the staging SMS test environment gate. */
export function getSmsTestGateStatus(): SmsTestGateStatus {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const requirement of SMS_TEST_GATE_REQUIREMENTS) {
    const actual = process.env[requirement.key];
    if (!actual) missing.push(requirement.key);
    else if (actual !== requirement.expected) invalid.push(requirement.key);
  }

  return { enabled: missing.length === 0 && invalid.length === 0, missing, invalid };
}

/** Exposes SMS diagnostics only for the explicitly enabled staging preview. */
export function smsTestEnabled(): boolean {
  return getSmsTestGateStatus().enabled;
}
