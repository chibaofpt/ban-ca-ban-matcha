/** Exposes SMS diagnostics only for the explicitly enabled staging preview. */
export function smsTestEnabled(): boolean {
  return process.env.ABENLA_SMS_TEST_ENABLED === "true"
    && process.env.NEXT_PUBLIC_APP_ENV === "staging"
    && process.env.VERCEL_ENV === "preview";
}
