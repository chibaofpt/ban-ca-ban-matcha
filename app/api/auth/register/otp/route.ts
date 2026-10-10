import { retiredRegistration } from "@/lib/auth/retiredRegistration";
/** Retire public registration OTP configuration. */
export async function GET() { return retiredRegistration(); }
/** Retire public registration OTP sends. */
export async function POST() { return retiredRegistration(); }
