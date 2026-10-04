/** Atomic request ownership; checking and in-flight replays never repeat external calls. */
export const OTP_CLAIM = `-- registration-otp:claim
local old = redis.call('GET', KEYS[1])
if old then
 local record = cjson.decode(old)
 if record.binding ~= ARGV[1] then return {'CONFLICT'} end
 return {'REPLAY', old}
end
redis.call('SETEX', KEYS[1], 604800, ARGV[2])
return {'NEW'}
`;

/** Reserve paid quotas only after CAPTCHA acceptance or its verified upstream outage. */
export const OTP_RESERVE = `-- registration-otp:reserve
local request = redis.call('GET', KEYS[1])
if not request then return {'UNAVAILABLE'} end
local record = cjson.decode(request)
if record.dispatch_state ~= 'checking' or record.challenge_id ~= ARGV[4] then return {'UNAVAILABLE'} end
if type(record.outcome) ~= 'table' or type(record.outcome.data) ~= 'table' then return {'UNAVAILABLE'} end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return {'UNAVAILABLE'} end
local now = tonumber(ARGV[1])
if redis.call('EXISTS', KEYS[6]) == 1 then return {'OTP_BUSY', now + redis.call('PTTL', KEYS[6])} end
if tonumber(redis.call('GET', KEYS[5]) or '0') >= 5 then return {'OTP_LOCKED', now + redis.call('PTTL', KEYS[5])} end
local cycle = cjson.decode(redis.call('GET', KEYS[2]) or '{"count":0,"last":0}')
if now - cycle.last >= 604800000 then cycle = {count=0,last=0} end
local delays = {120000,3600000,18000000,86400000,604800000}
if cycle.count >= 5 or (cycle.count > 0 and now < cycle.last + delays[cycle.count]) then
 return {'PHONE_LIMIT', cycle.last + delays[cycle.count]}
end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 20 then return {'IP_LIMIT', now + redis.call('PTTL', KEYS[3])} end
if tonumber(redis.call('GET', KEYS[4]) or '0') >= tonumber(ARGV[2]) then return {'DAILY_LIMIT', now + tonumber(ARGV[3]) * 1000} end
cycle.count = cycle.count + 1
cycle.last = now
redis.call('SETEX', KEYS[2], 604800, cjson.encode(cycle))
local ip = redis.call('INCR', KEYS[3])
if ip == 1 then redis.call('EXPIRE', KEYS[3], 600) end
local daily = redis.call('INCR', KEYS[4])
if daily == 1 then redis.call('EXPIRE', KEYS[4], tonumber(ARGV[3])) end
record.outcome.data.expires_at = ARGV[7]
record.outcome.data.resend_at = ARGV[7 + cycle.count]
record.dispatch_state = 'in_flight'
redis.call('PSETEX', KEYS[1], ttl, cjson.encode(record))
local active = cjson.encode({id=ARGV[4], flow=ARGV[5], payload=ARGV[6], data=record.outcome.data})
redis.call('SETEX', KEYS[7], 300, active)
redis.call('SETEX', KEYS[8], 300, active)
return {'NEW', cjson.encode(record.outcome.data)}
`;

/** Finalize only the owned request, retaining its original expiry and paid reservation. */
export const OTP_FINALIZE = `-- registration-otp:finalize
local old = redis.call('GET', KEYS[1])
if not old then return 0 end
local record = cjson.decode(old)
if record.challenge_id ~= ARGV[1] then return 0 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
record.dispatch_state = 'final'
record.outcome = cjson.decode(ARGV[2])
redis.call('PSETEX', KEYS[1], ttl, cjson.encode(record))
if record.outcome.data then
 for i=2,#KEYS do
  local old_active = redis.call('GET', KEYS[i])
  if old_active then
   local active = cjson.decode(old_active)
   local active_ttl = redis.call('PTTL', KEYS[i])
   if active.id == ARGV[1] and active_ttl > 0 then
    active.data = record.outcome.data
    redis.call('PSETEX', KEYS[i], active_ttl, cjson.encode(active))
   end
  end
 end
end
return 1
`;

/** Bound flow/payload checks precede all phone wrong counters and verification leases. */
export const OTP_VERIFY = `-- registration-otp:verify
local old = redis.call('GET', KEYS[1])
if not old then return {'OTP_EXPIRED'} end
local active = cjson.decode(old)
if active.id ~= ARGV[1] or active.flow ~= ARGV[2] or active.payload ~= ARGV[3] then return {'OTP_INVALID'} end
local wrong = tonumber(redis.call('GET', KEYS[2]) or '0')
if wrong >= 5 then return {'OTP_LOCKED', tonumber(ARGV[6]) + redis.call('PTTL', KEYS[2])} end
if tonumber(ARGV[7]) >= 5 then return {'OTP_INVALID'} end
local lease = redis.call('GET', KEYS[3])
if lease and lease ~= ARGV[5] then return {'OTP_BUSY', tonumber(ARGV[6]) + redis.call('PTTL', KEYS[3])} end
if ARGV[4] == '1' then
 if not lease then redis.call('SETEX', KEYS[3], 60, ARGV[5]) end
 return {'VALID'}
end
local replay = redis.call('GET', KEYS[4])
if replay then return cjson.decode(replay) end
wrong = redis.call('INCR', KEYS[2])
if wrong == 1 then redis.call('EXPIRE', KEYS[2], 1800) end
local result = {'WRONG'}
if wrong >= 5 then result = {'WRONG_LOCKED', tonumber(ARGV[6]) + redis.call('PTTL', KEYS[2])} end
redis.call('SETEX', KEYS[4], 1800, cjson.encode(result))
return result
`;

/** Release a verification lease only for its owner, consuming active state after DB success. */
export const OTP_RELEASE = `-- registration-otp:release
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
if ARGV[2] == '1' then
 for i=2,3 do
  local old = redis.call('GET', KEYS[i])
  if old and cjson.decode(old).id == ARGV[3] then redis.call('DEL', KEYS[i]) end
 end
end
return 1
`;

/** Bound balance diagnostics to ten calls per minute for each admin. */
export const OTP_PROBE = `-- registration-otp:probe
if tonumber(redis.call('GET', KEYS[1]) or '0') >= 10 then return redis.call('PTTL', KEYS[1]) end
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return 0
`;
