import { retiredRegistration } from "@/lib/auth/retiredRegistration";
/** Require updated Google onboarding instead of public phone registration. */
export async function POST() { return retiredRegistration(); }
