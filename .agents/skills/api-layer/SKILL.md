---
name: api-layer
description: >
  Implement or review a data-backed feature across server data access, domain workflow,
  HTTP routes, frontend services and DTO handling. Use for API paths, methods, payloads,
  response errors, service calls or DB-to-UI flow. Schema-only, business-formula and
  UI-only work use their own owners.
---

# API Layer

Owns HTTP implementation procedure. [API.md](../../../API.md) owns the public contract;
[SPECIFICATION.md](../../../SPECIFICATION.md#runtime-architecture) owns layer responsibilities;
[STRUCTURE.md](../../../STRUCTURE.md) owns placement and imports.

Axios remains the required browser HTTP client behind the shared `apiClient`. Removing a copied
Axios example from this skill does not remove that convention.

## Read for the task

- Read API `Response Shape`, `Contract Stability`, `Error Codes` and the affected endpoint.
  Add auth, pagination, upload or rate-limit sections only when relevant. Do not read every endpoint.
- Load a domain skill only when changing its rules: order lifecycle, voucher eligibility or pricing.
- Schema changes additionally need `SCHEMA.md` and the project `supabase` skill. An ordinary service
  edit does not require a migration audit.
- For a feature spanning database to UI, read
  [Data-backed feature](references/data-backed-feature.md). Skip it for a route-only or service-only
  change whose boundaries are already clear.
- Test selection and evidence belong to `AGENTS.md` → `tdd`; this skill adds no separate test gate.

## Preserve the contract

Inventory the affected route, service callers, DTOs and focused tests before editing. Reuse existing
paths and fields. Follow API `Contract Stability` for a necessary breaking change; do not rename a
feature merely to improve terminology. Public user/voucher identifier compatibility is defined
there, not a blanket ban on every entity's ID.

## Frontend service

- Use the existing `apiClient` in `src/lib/api/client.ts`; URLs belong to the domain service's
  `const URL = { ... } as const`. Declare service return types and unwrap `{ data: T }` once.
- TanStack Query owns remote server-state lifecycle. A `queryFn` or `mutationFn` calls an exported
  service function; reuse an existing query-key constant and audience/domain prefix.
- Views, components and hooks call exported domain service functions. They must not import Axios or
  `apiClient`, call `fetch` against app API routes, or construct API URLs.
- Prefer `useQuery` for reusable/cacheable reads and `useMutation` when its lifecycle or invalidation
  is useful. A `useEffect` may call a service only for lifecycle synchronization not modeled as
  remote server state; it still never performs HTTP directly and handles stale response/cancellation.
- Preserve current client refresh/interceptor behavior. Do not introduce a default base URL or
  global `Content-Type`; multipart headers are request-specific.
- `ApiError<TDetails>` in `contracts/api.ts` is a payload type, not a runtime error class.
  The canonical `ApiServiceError` in `src/lib/api/serviceError.ts` uses the server's
  `error` as standard `Error.message`, and retains HTTP `status`, `code` and optional `details`.
  Preserve `details.reason`, including `422 BUSINESS_RULE_VIOLATION`; keep transport failures
  distinct when no server response exists. Do not create a second shared runtime error class.
- Views and domain feature containers call services; leaf UI receives props. The service maps
  transport/DTOs and does not re-evaluate prices, availability, expiry or order eligibility.

## Backend route

- Follow the endpoint's actual input kind and access policy: JSON, multipart, query or route params;
  public/auth/cron endpoints do not inherit a CUSTOMER-only sample handler.
- Validate input with the existing Zod schema; handle malformed JSON with `.catch(() => null)`.
  Authenticate and authorize before protected business logic or writes. Do not impose one universal
  parse/auth ordering on unrelated endpoints; preserve the documented access and error contract.
- Keep database/business work in its server owner. Multi-step writes use `prisma.$transaction()`;
  the domain owner defines the transaction boundary and retry behavior.
- Return the documented success envelope, status and error code. Extra error payload belongs in
  `details`, never `data`. Use API `Error Codes` plus endpoint-specific reasons, not a copied table.

## Server data access and domain workflow

- The backend step that talks to the database is the **data access boundary**. Implement it in
  server-only `lib/` with Prisma or the transaction client; never expose Prisma models to the client.
- Domain workflow composes data access, business rules and transaction boundaries. API routes call
  that workflow and stay focused on HTTP concerns.
- Do not create a repository class for every table. Split a query/repository module only when it is
  reused, complex, or makes ownership and transactions clearer.
- Server Components use an appropriate `lib/` read workflow directly. They do not call the app's
  own API over HTTP.

## Server cache

- Redis cache-aside is an optional read optimization between the route and authoritative workflow;
  it does not replace validation, authorization, database reads required for correctness, or Query.
- Current approved cache scope and failure behavior live in
  [SPECIFICATION Server cache boundary](../../../SPECIFICATION.md#server-cache-boundary). New cached
  routes require explicit freshness, key, TTL and invalidation ownership.
- Use `lib/redis.ts`, `lib/cache.ts` and `lib/cacheInvalidation.ts`; never import Upstash directly
  in routes. Invalidate only after a successful database write.

## Handoff

Report affected paths/consumers and contract preservation or approved migration. Update `API.md`
when the public contract changes; update architecture, schema or placement only if those owners
also changed. Use the repository completion gate for test evidence and Resource Impact.
