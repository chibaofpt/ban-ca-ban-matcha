# Security audit reference

This reference defines audit questions, not implementation status. Load only the categories routed by
[`../SKILL.md`](../SKILL.md), then confirm each claim against its named owner. Report every item as
`PASS`, `FAIL`, `NOT_APPLICABLE`, or `UNVERIFIED`, with evidence. Reading this checklist never
authorizes credentials, live probes, remote changes, deployment, or release.

Operational claims such as deployed headers, live RLS, scheduler activation, provider restrictions,
backups, and alert delivery remain `UNVERIFIED` unless the task explicitly authorizes and supplies
runtime or remote evidence. Vendor advice is conditional: verify the selected provider and its current
authoritative documentation instead of assuming platform limits or settings.

## 1. Secrets and external credentials

- **S1 — Secret boundary:** No service-role, private VAPID, cron, JWT-signing, SMS, database, or
  paid upstream credential is hardcoded, logged, committed, exposed through `NEXT_PUBLIC_*`, or
  imported into a client bundle. Audit tracked files and history only within the authorized scope.
  Owners: [`.env.local.example`](../../../../.env.local.example) and
  [`SPECIFICATION.md` Runtime architecture](../../../../SPECIFICATION.md#runtime-architecture).
- **S2 — Public configuration:** Treat every `NEXT_PUBLIC_*` value as public. Confirm each is
  intentionally browser-visible and apply provider restrictions where supported. A VAPID public key
  is public cryptographic material; it does not by itself prove an app origin.
- **S3 — Goong keys:** Keep server Goong API credentials behind the project integration boundary.
  The public map style/tile credential may be used by the frontend map as specified by the delivery
  contract; apply provider-supported domain/quota restrictions. Owner:
  [`API.md` outbound-service constraints](../../../../API.md#address-and-outbound-service-bounds).
- **S4 — Cron authentication:** Cron routes reject a missing or invalid `CRON_SECRET` before
  protected work. Secret generation, rotation, and scheduler injection are operational checks.
  Owner: [`API.md` Cron contract](../../../../API.md#cron--cron_secret-required).

## 2. Authentication, authorization, and sessions

- **A1 — Route-specific access:** Compare every route with the inventory, Auth Cookies, and
  Middleware Behavior in [`API.md`](../../../../API.md). Public auth routes, authenticated customer
  routes, staff/admin routes, and secret-authenticated cron routes use their documented guard; do not
  require `getSession()` indiscriminately on every mutation.
- **A2 — Authoritative custom auth:** Preserve custom phone/password auth using `jose` and httpOnly
  cookies. Checks validate `sid`, user binding, expiry, and current role against PostgreSQL; legacy
  Redis session keys are eviction-only. Logout deletes the session before clearing cookies. Owners:
  [`SPECIFICATION.md` Business consistency boundaries](../../../../SPECIFICATION.md#business-consistency-boundaries)
  and [`API.md` Auth Cookies](../../../../API.md#auth-cookies).
- **A3 — Login and refresh:** Login performs equivalent bcrypt work for existing and missing users
  and returns the exact documented contract. Refresh rotation, grace behavior, active-session limits,
  TTL, and cleanup match [`API.md`](../../../../API.md); missing/deleted/expired sessions fail closed.
- **A4 — Object authorization:** For user-owned resources, prove authorization is bound to the
  authenticated identity or public token defined by the API, rather than trusting an internal ID from
  the request. Staff/admin role checks must match the endpoint contract.
- **A5 — Exposed data and RLS:** Review policies using the project [`supabase`](../../supabase/SKILL.md)
  owner and schema semantics. Static review does not prove deployed RLS. Direct anon-key probes require
  explicit live-access authorization and safe targets; otherwise report `UNVERIFIED`.

## 3. CSRF, validation, and injection

- **I1 — Cookie request integrity:** Verify auth-cookie attributes and the documented CSRF/origin
  defense for state-changing routes. Do not invent stricter cookie or header rules here; owner:
  [`API.md` Auth Cookies](../../../../API.md#auth-cookies).
- **I2 — Input and price authority:** Validate identifiers, quantities, strings, coordinates, and
  bounded collections before protected work. Client price/shipping fields are only stale-value inputs
  where documented; the server reloads authoritative data and recomputes totals. Owners:
  [`API.md`](../../../../API.md), [`pricing-logic`](../../pricing-logic/SKILL.md), and
  [`order-flow`](../../order-flow/SKILL.md).
- **I3 — XSS and output:** Do not pass user/staff-controlled content to unsafe HTML sinks. Validate
  URL and rendering contexts; keep hardcoded structured data distinct from database content.
- **I4 — Database injection:** Prefer Prisma query APIs. If raw SQL is justified, prove values are
  parameterized with Prisma-supported safe composition such as tagged templates and `Prisma.sql`;
  reject string concatenation and unsafe raw execution. Owners: [`supabase`](../../supabase/SKILL.md) and
  [`supabase-postgres-best-practices`](../../supabase-postgres-best-practices/SKILL.md).

## 4. Rate limits and bounded work

- **R1 — Distributed limits:** Check only the endpoint buckets and identities listed under
  [`API.md` Distributed rate limits](../../../../API.md#distributed-rate-limits), including auth,
  orders, voucher exchange, push, delivery, and the shared report bucket. Preserve documented `429`
  behavior and the approved Redis fail-open policy; do not copy quotas into this checklist.
- **R2 — Bounded reads:** Pagination, date windows, batch sizes, and transaction timeouts match each
  endpoint owner. Both report routes share the current bounded snapshot rules and return
  `422 BUSINESS_RULE_VIOLATION` with `details.reason = "REPORT_RANGE_TOO_LARGE"` when the documented
  workload ceiling is exceeded; no truncated totals are returned. Owner:
  [`API.md` admin report contract](../../../../API.md#get-apiadminreportstartdateyyyy-mm-ddenddateyyyy-mm-ddstaffidqr_token).
- **R3 — Expensive upstream work:** Validate, debounce where the UI contract requires it, rate-limit
  according to the API owner, set documented timeouts, and bound retries. Provider quota or edge
  protection is operational evidence, not inferred from code.

## 5. Transactions, races, and points

- **RC1 — Atomic business writes:** Multi-step database writes use `prisma.$transaction()` and the
  isolation/retry behavior required by the relevant order or voucher owner. Preflight, fulfillment,
  and issuance exceptions must be explicitly documented rather than generalized.
- **RC2 — Voucher concurrency:** Re-fetch eligibility and conditionally claim expected voucher state
  in the same transaction as the consuming write. Mock races prove application branching only; live
  database locking and rollback remain unproved without authorized evidence. Owner:
  [`voucher-flow`](../../voucher-flow/SKILL.md).
- **RC3 — Immutable points:** `points_log` is append-only. Awards, reversals, exchanges, refunds, and
  insufficient-recovery failures follow the order/voucher owners and schema semantics; never repair a
  balance by updating history. Owners: [`order-flow`](../../order-flow/SKILL.md),
  [`voucher-flow`](../../voucher-flow/SKILL.md), and [`SCHEMA.md`](../../../../SCHEMA.md#points_log).

## 6. Business integrity and uploads

- **B1 — Upload boundary:** Multipart ceilings, accepted media, decoding, metadata removal,
  dimensions, object naming, overwrite behavior, rollback, and deletion match
  [`API.md` Image Upload Flow](../../../../API.md#image-upload-flow). Route handlers use the owned
  storage adapter; Supabase SDK calls stay behind the integration boundary.
- **B2 — Storage exposure:** Review bucket policies, object visibility, path construction, and RLS
  through [`supabase`](../../supabase/SKILL.md). Client MIME metadata alone is not proof that decoded
  content is safe. Deployed policy and bucket settings are operational evidence.
- **B3 — Public identifiers:** External user/voucher DTOs use `qr_token` and do not expose internal
  `users.id` or `vouchers.id`. Token generation and uniqueness follow [`SCHEMA.md`](../../../../SCHEMA.md)
  and [`API.md`](../../../../API.md).
- **B4 — Money and ceilings:** Money remains integer VND; pricing, rounding, order-value ceilings,
  soft-delete constraints, and stable business errors come from their domain/API owners. Do not
  duplicate formulas or assumed limits here.

## 7. Browser, HTTP, and network policy

- **IN1 — Response headers:** Verify framing protection, `nosniff`, referrer policy, transport policy,
  and a CSP compatible with actual Next.js assets and integrations. Deployment evidence is needed to
  claim production headers; consult current official framework/hosting documentation for rollout.
- **IN2 — Permissions Policy:** Disable browser capabilities the application does not use while
  preserving documented camera, geolocation, map, and QR flows. Audit route behavior and browser
  support instead of applying a blanket policy.
- **IN3 — CORS:** Credentialed endpoints must not combine cookies with a wildcard allowed origin.
  Confirm any explicit allowlist and preflight behavior against the API consumers.
- **IN4 — Method semantics:** GET handlers remain read-only. Secret-authenticated cron GET routes are
  the documented scheduler exception; owner:
  [`SPECIFICATION.md`](../../../../SPECIFICATION.md#business-consistency-boundaries).

## 8. Privacy, errors, and logging

- **DP1 — Data minimization:** Logs, monitoring events, breadcrumbs, and request metadata exclude
  passwords, OTPs, tokens, cookies, secret headers, full request bodies, precise location, phone
  numbers, and stable user identifiers unless an owner documents a necessary privacy-safe form.
- **DP2 — Error contracts:** Known auth, validation, conflict, rate-limit, and business failures keep
  their exact [`API.md`](../../../../API.md) status/code/details contract. Unexpected failures return a
  generic internal error without Prisma schema, stack, upstream body, or secret material. A blanket
  rule that every `catch` returns 500 is incorrect.
- **DP3 — Monitoring:** Scrubbing, sampling, retention, access control, and alert delivery are checked
  against the configured provider. Static config cannot prove remote ingestion or alerting; report
  those claims `UNVERIFIED` without authorized operational evidence.

## 9. Next.js and hosting runtime

- **NX1 — Middleware coverage:** Compare current route inventory with existing middleware matchers
  and route-local guards. Add or change a matcher only when the owner requires coverage; middleware
  never replaces route-level authorization where the API contract requires it.
- **NX2 — Runtime completion:** Bound database and upstream work to the documented contract and the
  current hosting/provider limits. Do not prescribe hardcoded Vercel durations. Do not detach promises
  merely to return early: use a documented durable mechanism or await required work when completion
  affects correctness. Verify behavior with current official provider/framework documentation.
- **NX3 — Dependency boundary:** External SDKs remain behind project adapters/hooks so UI and business
  logic do not depend directly on providers. The adapter location follows
  [`SPECIFICATION.md` Runtime architecture](../../../../SPECIFICATION.md#runtime-architecture) and
  [`STRUCTURE.md`](../../../../STRUCTURE.md), not a universal `lib/` or API-route rule.

## 10. Cron and background jobs

- **CR1 — Authentication and idempotency:** Each cron endpoint validates the documented secret before
  work and is safe under retries/concurrency through status/expected-state conditions and bounded
  batches. Owner: [`API.md` Cron contract](../../../../API.md#cron--cron_secret-required).
- **CR2 — Scheduler ownership:** Supabase Cron is primary where specified; Vercel is only a documented
  backup. Compare code/config with the owner schedule without assuming every route belongs in
  `vercel.json`. Deployed schedules, timezone, secret injection, and execution history are
  `UNVERIFIED` without authorized runtime evidence.
- **CR3 — Test surfaces:** Inventory routes against [`API.md`](../../../../API.md). Remove or disable a
  debug/test endpoint only when it is not an intentional documented surface; do not infer deletion
  authority from this checklist.

## 11. Third-party integrations

- **TP1 — Key placement:** Keep private upstream credentials server-side. Public browser credentials
  may exist when the owned frontend flow requires them, such as Goong map style/tiles, with
  provider-supported restrictions. API-backed search/geocoding stays behind the documented proxy.
- **TP2 — Proxy safety:** Validate and encode inputs, constrain destinations, enforce documented
  timeouts and response sizes, and map upstream failures to the exact API contract without exposing
  upstream bodies, URLs containing keys, or secret headers.
- **TP3 — Provider assumptions:** Quotas, allowed origins, webhook verification, retry behavior, and
  data retention depend on the active integration. Verify them from current authoritative vendor
  documentation and remote configuration only when the task permits it.

## 12. Operational and release readiness

- **OR1 — Dependencies and lockfile:** Use the repository lockfile and workflow owner. Audit findings
  record command, scope, date, severity, exploitability, and remediation decision; do not promise that
  every advisory can be upgraded safely without owner review.
- **OR2 — Environment separation:** Compare `.env.local.example` with each authorized deployment
  environment without revealing values. Database, Redis, storage, monitoring, scheduler, and provider
  separation remain `UNVERIFIED` without remote evidence.
- **OR3 — Backup and recovery:** Record backup ownership, retention, encryption/access, and the latest
  successful restore test. A configured backup or dashboard screenshot alone does not prove recovery.
- **OR4 — Release gate:** Production release follows
  [`production-deploy`](../../production-deploy/SKILL.md), including its friends-tested-staging user
  confirmation. Security review does not authorize merge, migration, deployment, or release.

## Conditional appendix for changed surfaces

Apply only the rows touched by the feature; do not impose every row on every change.

| Changed surface | Additional audit claims | Owner |
|---|---|---|
| API route | Exact access class, method, input/error contract, object authorization, bounded work, applicable rate limit, transaction boundary, and middleware coverage | [`api-layer`](../../api-layer/SKILL.md) + exact [`API.md`](../../../../API.md) endpoint |
| External integration | Public/private credential classification, adapter boundary, validated outbound request, timeout, response/error mapping, provider restrictions, and env example | [`SPECIFICATION.md`](../../../../SPECIFICATION.md#runtime-architecture), [`STRUCTURE.md`](../../../../STRUCTURE.md), exact API owner |
| Cron job | Secret guard, idempotency/concurrency, bounded batches, owned schedule and backup semantics; deployed state `UNVERIFIED` without runtime evidence | [`API.md` Cron contract](../../../../API.md#cron--cron_secret-required) + [`supabase`](../../supabase/SKILL.md) |
| File upload | Owned multipart ceiling, decoded-file validation/transformation, safe object name, overwrite/rollback/deletion semantics, storage policy | [`API.md` Image Upload Flow](../../../../API.md#image-upload-flow) + [`supabase`](../../supabase/SKILL.md) |
| Schema/RLS | Existing-field audit, Prisma migration, least-privilege policy, data semantics, rollback/compatibility evidence | [`supabase`](../../supabase/SKILL.md) + [`SCHEMA.md`](../../../../SCHEMA.md) |
