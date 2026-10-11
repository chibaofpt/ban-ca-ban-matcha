import { vi } from "vitest";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";

type Entry = { value: string | number; until: number };
type Data = Record<string, unknown>;
const delays = [120000, 3600000, 18000000, 86400000, 604800000];

/** Stateful fake Redis protocol; models policy outcomes, never real Lua atomicity. */
export class OtpRedisFake {
  entries = new Map<string, Entry>();
  unavailable = false;
  get(key: string): string | number | null {
    const entry = this.entries.get(key);
    if (!entry || entry.until <= Date.now()) { this.entries.delete(key); return null; }
    return entry.value;
  }
  set(key: string, value: string | number, ttl: number) { this.entries.set(key, { value, until: Date.now() + ttl }); }
  ttl(key: string) { return Math.max(0, (this.entries.get(key)?.until ?? Date.now()) - Date.now()); }
  json(key: string): Data | null {
    const value = this.get(key);
    return value === null ? null : JSON.parse(String(value)) as Data;
  }
  increment(key: string, ttl: number) {
    const count = Number(this.get(key) ?? 0) + 1;
    if (count === 1) this.set(key, count, ttl);
    else this.entries.set(key, { value: count, until: this.entries.get(key)!.until });
    return count;
  }
  async eval(script: string, keys: string[], args: (string | number)[]) {
    if (this.unavailable) throw new Error("Redis unavailable");
    const now = Date.now();
    if (script.includes("registration-otp:claim")) {
      const old = this.json(keys[0]);
      if (old) return old.binding !== args[0] ? ["CONFLICT"] : ["REPLAY", JSON.stringify(old)];
      this.set(keys[0], String(args[1]), 604800000);
      return ["NEW"];
    }
    if (script.includes("registration-otp:reserve")) {
      const record = this.json(keys[0]);
      const outcome = record?.outcome as { data?: Data } | undefined;
      if (!record || record.dispatch_state !== "checking" || record.challenge_id !== args[3] || !outcome || typeof outcome !== "object" || !outcome.data || typeof outcome.data !== "object" || this.ttl(keys[0]) <= 0) return ["UNAVAILABLE"];
      if (this.get(keys[5])) return ["OTP_BUSY", now + this.ttl(keys[5])];
      if (Number(this.get(keys[4]) ?? 0) >= 5) return ["OTP_LOCKED", now + this.ttl(keys[4])];
      let cycle = this.json(keys[1]) ?? { count: 0, last: 0 };
      if (now - Number(cycle.last) >= 604800000) cycle = { count: 0, last: 0 };
      const count = Number(cycle.count);
      if (count >= 5 || count > 0 && now < Number(cycle.last) + delays[count - 1]) {
        return ["PHONE_LIMIT", Number(cycle.last) + delays[count - 1]];
      }
      if (Number(this.get(keys[2]) ?? 0) >= 20) return ["IP_LIMIT", now + this.ttl(keys[2])];
      if (Number(this.get(keys[3]) ?? 0) >= Number(args[1])) return ["DAILY_LIMIT", now + Number(args[2]) * 1000];
      this.set(keys[1], JSON.stringify({ count: count + 1, last: now }), 604800000);
      this.increment(keys[2], 600000); this.increment(keys[3], Number(args[2]) * 1000);
      const data = outcome.data;
      data.expires_at = args[6]; data.resend_at = args[7 + count];
      record.dispatch_state = "in_flight";
      this.set(keys[0], JSON.stringify(record), this.ttl(keys[0]));
      const active = JSON.stringify({ id: args[3], flow: args[4], payload: args[5], data });
      this.set(keys[6], active, 300000); this.set(keys[7], active, 300000);
      return ["NEW", JSON.stringify(data)];
    }
    if (script.includes("registration-otp:finalize")) {
      const record = this.json(keys[0]);
      if (!record || record.challenge_id !== args[0]) return 0;
      record.outcome = JSON.parse(String(args[1])); record.dispatch_state = "final";
      this.set(keys[0], JSON.stringify(record), this.ttl(keys[0]));
      if ((record.outcome as { data?: Data }).data) {
        for (const key of keys.slice(1)) {
          const active = this.json(key);
          if (active && active.id === args[0]) {
            active.data = (record.outcome as { data: Data }).data;
            this.set(key, JSON.stringify(active), this.ttl(key));
          }
        }
      }
      return 1;
    }
    if (script.includes("registration-otp:verify")) {
      const active = this.json(keys[0]);
      if (!active) return ["OTP_EXPIRED"];
      if (active.id !== args[0] || active.flow !== args[1] || active.payload !== args[2]) return ["OTP_INVALID"];
      if (Number(this.get(keys[1]) ?? 0) >= 5) return ["OTP_LOCKED", now + this.ttl(keys[1])];
      if (Number(args[6]) >= 5) return ["OTP_INVALID"];
      const lease = this.get(keys[2]);
      if (lease && lease !== args[4]) return ["OTP_BUSY", now + this.ttl(keys[2])];
      if (args[3] === "1") { if (!lease) this.set(keys[2], String(args[4]), 60000); return ["VALID"]; }
      const replay = this.get(keys[3]);
      if (replay) return JSON.parse(String(replay));
      const count = this.increment(keys[1], 1800000);
      const result = count >= 5 ? ["WRONG_LOCKED", now + this.ttl(keys[1])] : ["WRONG"];
      this.set(keys[3], JSON.stringify(result), 1800000);
      return result;
    }
    if (script.includes("registration-otp:release")) {
      if (this.get(keys[0]) !== args[0]) return 0;
      this.entries.delete(keys[0]);
      if (args[1] === "1") for (const key of keys.slice(1)) if (this.json(key)?.id === args[2]) this.entries.delete(key);
      return 1;
    }
    if (script.includes("registration-otp:probe")) {
      if (Number(this.get(keys[0]) ?? 0) >= 10) return this.ttl(keys[0]);
      this.increment(keys[0], 60000); return 0;
    }
    if (script.includes("tonumber")) return Number(this.get(keys[0]) ?? 0);
    return this.get(keys[0]);
  }
}

export function otpChallenge(id = "550e8400-e29b-41d4-a716-446655440000") {
  return { challenge_id: id, masked_phone: "+8491***678", server_now: new Date().toISOString(),
    expires_at: new Date(Date.now() + 300000).toISOString(),
    resend_at: new Date(Date.now() + 120000).toISOString(),
    delivery_status: "unknown" as const, provider_code: null, sms_per_message: null };
}

export function otpRequest(body: unknown, path = "/api/auth/register/otp") {
  return new Request("https://matcha.example" + path, {
    method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.1" }, body: JSON.stringify(body),
  });
}

export function otpEnvironment() {
  vi.stubEnv("REGISTRATION_OTP_SECRET", "registration-only-test-secret-at-least-32-chars");
  vi.stubEnv("JWT_SECRET", "registration-jwt-test-secret-at-least-32-chars");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "public-test-site-key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "private-turnstile-test-key");
  vi.stubEnv("VERCEL_ENV", "preview");
}

export async function reason(promise: Promise<unknown>, expected: string) {
  try { await promise; throw new Error("Expected rejection"); }
  catch (error) { if (!(error instanceof RegistrationOtpError) || error.reason !== expected) throw error; }
}
