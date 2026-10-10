import { retiredRegistration } from "@/lib/auth/retiredRegistration";
/** Retire public phone existence probing. */
export async function POST() { return retiredRegistration(); }
