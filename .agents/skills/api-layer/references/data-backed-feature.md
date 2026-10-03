# Data-backed feature

Use this playbook when one feature crosses database, server and browser boundaries. The canonical
layer definitions remain in `SPECIFICATION.md`; this file supplies execution order and checks.

## Freeze the contract

Before editing, record:

- user action and expected visible result;
- persisted data read or written;
- API method, path, request and response DTO;
- business invariants and authorization;
- consumers that must remain compatible.

Load `SCHEMA.md` + `supabase` only when persistence semantics change. Load the affected domain skill
for business rules and `mobile-ux` only when interaction behavior changes.

## Implement inside out

1. **Persistence when needed:** update Prisma schema, migration and schema semantics together.
2. **Data access:** query/write through Prisma in server-only `lib/`; select only required fields and
   keep multi-step writes inside the workflow transaction.
3. **Domain workflow:** validate current server state, apply canonical business rules, perform data
   access and return an internal result.
4. **API route/cache:** parse and validate HTTP input, authenticate/authorize, use approved cache-aside
   for an eligible read, call the workflow, then map the result to the documented contract.
5. **Frontend service:** declare the URL and DTO types, call shared Axios `apiClient`, unwrap once and
   convert transport/server errors to the established service error.
6. **UI orchestration:** TanStack Query `queryFn`/`mutationFn` call the service and own remote
   loading, error, retry/refetch, invalidation and stale-response behavior.
7. **Leaf UI:** render values and emit callbacks through props.

Do not manufacture one file for every numbered step. A small feature may reuse existing schema,
workflow or UI boundaries; the ownership and direction still apply.

## Client request rule

`useEffect` is a lifecycle tool, not an HTTP or remote server-state layer.

- Reusable/cacheable reads use `useQuery`; mutations use `useMutation` when its lifecycle or cache
  invalidation is useful.
- Query and mutation functions call a service; event handlers trigger the mutation/refetch.
- Lifecycle synchronization that is not remote server state may call a service from `useEffect`.
- Views, components and hooks never import Axios or `apiClient`, call app API URLs with `fetch`, or
  assemble those URLs.
- Leaf UI never calls a service.

## Verify the slice

Trace one success and one relevant failure through:

`Prisma/data access -> workflow -> route contract -> service DTO/error -> UI state`

Confirm server-side rules are authoritative, no Prisma model leaks into the response, changed client
files contain no direct HTTP call outside `src/services`, and existing consumers keep their contract.
For a cached read, also trace cache miss, Redis failure and post-write invalidation. Use the repository
TDD gate for executable changes.
