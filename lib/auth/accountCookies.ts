import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { AccountError } from "@/lib/auth/accountError";
/** Hash opaque account proof material without retaining the raw value. */
export function accountDigest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
/** Read or create a strict, protected browser binding for account proofs. */
export async function accountBrowserBinding(req: Request, create = false): Promise<string> {
  const jar = await cookies();
  let value = jar.get("account_auth_browser")?.value;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) {
    if (!create) throw new AccountError("ACCOUNT_PROOF_INVALID", 401, "UNAUTHORIZED");
    value = randomBytes(32).toString("hex");
    jar.set("account_auth_browser", value, { httpOnly: true, secure: new URL(req.url).protocol === "https:" || process.env.NODE_ENV === "production",
      sameSite: "strict", path: "/api", maxAge: 600 });
  }
  return accountDigest(value);
}
/** Read the protected claim context as a hash, never as public account data. */
export async function claimContextHash(): Promise<string> {
  const raw = (await cookies()).get("account_claim_context")?.value;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
  return accountDigest(raw);
}
/** Replace or clear the short-lived protected claim context. */
export async function setClaimContext(req: Request, token: string | null, expiresAt?: Date): Promise<void> {
  const jar = await cookies();
  jar.set("account_claim_context", token ?? "", { httpOnly: true, secure: new URL(req.url).protocol === "https:" || process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/api/auth", maxAge: token && expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : 0 });
}