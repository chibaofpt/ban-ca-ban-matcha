import { getRedisClient } from "@/lib/redis";
import type { SmsTestSendOtpData } from "@/contracts/smsTest";

interface RedisScripts {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

const RESERVE = `
local old = redis.call('GET', KEYS[1])
if old then
  local record = cjson.decode(old)
  if record.phone_digest ~= ARGV[1] or record.session_scope ~= ARGV[6] then return {'CONFLICT'} end
  return {'REPLAY', old}
end
if redis.call('EXISTS', KEYS[4]) == 1 then return {'COOLDOWN'} end
if tonumber(redis.call('GET', KEYS[5]) or '0') >= 5 then return {'ADMIN_LIMIT'} end
if tonumber(redis.call('GET', KEYS[6]) or '0') >= 20 then return {'GLOBAL_LIMIT'} end
redis.call('HSET', KEYS[2], 'challenge_id', ARGV[2], 'hash', ARGV[3], 'attempts', '0')
redis.call('EXPIRE', KEYS[2], 300)
redis.call('SETEX', KEYS[3], 600, '1')
redis.call('SETEX', KEYS[1], 600, ARGV[4])
redis.call('SETEX', KEYS[4], 60, '1')
local admin_count = redis.call('INCR', KEYS[5])
if admin_count == 1 then redis.call('EXPIRE', KEYS[5], 600) end
local global_count = redis.call('INCR', KEYS[6])
if global_count == 1 then redis.call('EXPIRE', KEYS[6], tonumber(ARGV[5])) end
return {'NEW'}
`;

const FINALIZE = `
local old = redis.call('GET', KEYS[1])
if not old then return 0 end
local record = cjson.decode(old)
if record.challenge_id ~= ARGV[1] then return 0 end
record.outcome = cjson.decode(ARGV[2])
record.dispatch_state = 'final'
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
redis.call('PSETEX', KEYS[1], ttl, cjson.encode(record))
return 1
`;

const VERIFY = `
local id = redis.call('HGET', KEYS[1], 'challenge_id')
if not id then
  if redis.call('EXISTS', KEYS[2]) == 1 then return 'EXPIRED' end
  return 'NOT_FOUND'
end
if id ~= ARGV[1] then return 'NOT_FOUND' end
local attempts = tonumber(redis.call('HGET', KEYS[1], 'attempts') or '0')
if attempts >= 5 then return 'LOCKED' end
local expected = redis.call('HGET', KEYS[1], 'hash')
if expected == ARGV[2] then
  redis.call('DEL', KEYS[1], KEYS[2])
  return 'VERIFIED'
end
attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts >= 5 then return 'LOCKED' end
return 'INVALID'
`;

const PROBE = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= 10 then return 0 end
count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return 1
`;

/** A missing or failed Redis client is always an unavailable SMS test store. */
export class SmsTestStoreUnavailable extends Error {}

function client(): RedisScripts {
  const redis = getRedisClient();
  if (!redis) throw new SmsTestStoreUnavailable();
  return redis as RedisScripts;
}

async function evalScript(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
  try {
    return await client().eval(script, keys, args);
  } catch {
    throw new SmsTestStoreUnavailable();
  }
}

export interface SmsTestOutcome {
  data?: SmsTestSendOtpData;
  error?: { status: number; code: string; reason: string; provider_code?: number };
}

interface IdempotencyRecord {
  challenge_id: string;
  phone_digest: string;
  session_scope: string;
  dispatch_state: "in_flight" | "final";
  outcome: SmsTestOutcome;
}

/** Atomically reserve an OTP dispatch, idempotency key, cooldown, and both send quotas. */
export async function reserveSmsTestSend(input: {
  idempotencyKey: string;
  activeKey: string;
  markerKey: string;
  cooldownKey: string;
  adminLimitKey: string;
  globalLimitKey: string;
  challengeId: string;
  phoneDigest: string;
  sessionScope: string;
  otpHash: string;
  initialData: SmsTestSendOtpData;
  globalTtlSeconds: number;
}): Promise<{ kind: "new" } | { kind: "replay"; outcome: SmsTestOutcome } | { kind: "blocked"; reason: string }> {
  const record: IdempotencyRecord = {
    challenge_id: input.challengeId,
    phone_digest: input.phoneDigest,
    session_scope: input.sessionScope,
    dispatch_state: "in_flight",
    outcome: { data: input.initialData },
  };
  const result = await evalScript(RESERVE, [
    input.idempotencyKey, input.activeKey, input.markerKey, input.cooldownKey,
    input.adminLimitKey, input.globalLimitKey,
  ], [input.phoneDigest, input.challengeId, input.otpHash, JSON.stringify(record), input.globalTtlSeconds, input.sessionScope]);
  if (!Array.isArray(result) || typeof result[0] !== "string") throw new SmsTestStoreUnavailable();
  if (result[0] === "NEW") return { kind: "new" };
  if (result[0] === "REPLAY") {
    try {
      const replay = (typeof result[1] === "string" ? JSON.parse(result[1]) : result[1]) as IdempotencyRecord;
      if (!replay || typeof replay.challenge_id !== "string" || !replay.outcome ||
        !["in_flight", "final"].includes(replay.dispatch_state) ||
        replay.phone_digest !== input.phoneDigest || replay.session_scope !== input.sessionScope) {
        throw new Error("Invalid idempotency record");
      }
      if (replay.dispatch_state === "in_flight") {
        if (!replay.outcome.data) throw new Error("Invalid in-flight outcome");
        return { kind: "replay", outcome: { data: {
          ...replay.outcome.data, delivery_status: "unknown", provider_code: null, sms_per_message: null,
        } } };
      }
      return { kind: "replay", outcome: replay.outcome };
    } catch {
      throw new SmsTestStoreUnavailable();
    }
  }
  if (["CONFLICT", "COOLDOWN", "ADMIN_LIMIT", "GLOBAL_LIMIT"].includes(result[0])) {
    return { kind: "blocked", reason: result[0] };
  }
  throw new SmsTestStoreUnavailable();
}

/** Persist the sanitized provider outcome for safe idempotent retries. */
export async function finalizeSmsTestSend(key: string, challengeId: string, outcome: SmsTestOutcome): Promise<void> {
  const result = await evalScript(FINALIZE, [key], [challengeId, JSON.stringify(outcome)]);
  if (result !== 1) throw new SmsTestStoreUnavailable();
}

/** Compare the submitted OTP digest and count wrong attempts atomically. */
export async function verifySmsTestOtp(activeKey: string, markerKey: string, challengeId: string, otpHash: string): Promise<"VERIFIED" | "INVALID" | "LOCKED" | "EXPIRED" | "NOT_FOUND"> {
  const result = await evalScript(VERIFY, [activeKey, markerKey], [challengeId, otpHash]);
  if (["VERIFIED", "INVALID", "LOCKED", "EXPIRED", "NOT_FOUND"].includes(String(result))) {
    return result as "VERIFIED" | "INVALID" | "LOCKED" | "EXPIRED" | "NOT_FOUND";
  }
  throw new SmsTestStoreUnavailable();
}

/** Apply the shared ten-per-minute admin diagnostic quota. */
export async function reserveSmsTestProbe(key: string): Promise<boolean> {
  const result = await evalScript(PROBE, [key], []);
  if (result === 1) return true;
  if (result === 0) return false;
  throw new SmsTestStoreUnavailable();
}
