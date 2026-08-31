# Database Testing

Read this reference when a test claim depends on PostgreSQL, Prisma persistence, Supabase
data-plane behavior, or when choosing whether the authorized staging database is appropriate.

## Project Authorization Boundary

The project allows its staging database to be used as a test target. This standing choice
allows agents to select a staging evidence class; it does not authorize production access,
unbounded writes, schema reset, broad cleanup, or unrelated remote mutations.

Production and an unidentified database are always forbidden test targets. Fail closed when
the target cannot be proven to be staging. Never print database URLs, passwords, tokens, or
service-role credentials in commands, logs, fixtures, or reports.

## Evidence Classes

| Class | Select when | What it can prove | Runner boundary |
|---|---|---|---|
| `NONE` | The behavior is deterministic before persistence or the database is only an external boundary | Validation, branching, payloads, pure pricing/state logic | Hermetic `node` or `dom`; an explicit database double is allowed only when the database behavior is not the claim |
| `STAGING_READ` | The claim needs deployed schema/data, API-to-database consistency, read queries, or a non-mutating smoke check | Real query compatibility and current staging read behavior | `npm run test:live:staging`; may use API and read-only Prisma queries after verifying both point to the same staging dataset |
| `STAGING_WRITE` | The claim needs real inserts/updates, constraints, transaction rollback, Decimal round-trip, cascades, or concurrency | Application persistence behavior on PostgreSQL staging | Dedicated opt-in write test, serial by default, with scoped fixtures and verified cleanup |
| `ISOLATED_MIGRATION` | The claim concerns applying migrations, DDL, backfill safety, rollback/replay, RLS/grants, or destructive failure recovery | Migration execution and schema/data-plane semantics | Supabase Preview Branch or disposable local PostgreSQL; never the shared persistent staging database |

Static source/schema/SQL checks remain `static-contract`; they are useful guardrails but are
not a database evidence class.

## When a Real Database Test Is Required

Choose `STAGING_WRITE` or `ISOLATED_MIGRATION` when the acceptance claim depends on any of:

- unique, foreign-key, check, exclusion, or database-generated constraints;
- transaction commit/rollback, isolation, locks, atomicity, or concurrent write conflicts;
- Prisma `Decimal` or timestamp/default round-trips;
- cascade/restrict behavior or database triggers/functions;
- migration order, replay, backfill, grants, RLS, or role-specific access.

Do not add a database test merely because production code calls Prisma. Use `NONE` when a
test only needs to prove validation, authorization decisions before persistence, deterministic
calculation, UI behavior, or request/response mapping. A Prisma mock may prove application
branches, but the completion report must not upgrade that result into a PostgreSQL claim.

## Staging Read Protocol

1. Require `NEXT_PUBLIC_APP_ENV=staging` and an explicit `TEST_BASE_URL`.
2. Verify that the API and direct database connection describe the same dataset before using
   them as a combined oracle.
3. Use selects only. Do not call mutation endpoints as part of a read test.
4. Keep the test outside `npm test`; run it only through the live staging command.

The existing pricing live suite is `STAGING_READ`.

## Staging Write Protocol

Use this class only when the task explicitly needs real persistence evidence.

1. Record the tables, operations, fixture ownership, retention/cleanup strategy, maximum rows,
   and finite account budget in the Test Seam before executing.
2. Generate a unique run ID and tag every created record through a test-owned identifier that
   the public contract already supports. Do not add production columns only for tests.
3. Use dedicated test users/records; never modify or delete pre-existing or untagged rows.
4. Pin an immutable preview deployment and prove that its API catalog and the read-only database
   oracle identify the same staging dataset. A mutable alias or an environment variable name is
   not target proof. Write profiles also require verified sandbox/log-only external effects.
5. Append a durable intent before every mutation. A lost or 5xx response has an unknown outcome:
   reconcile the exact marker/account/package/order before continuing and never retry while the
   outcome remains ambiguous.
6. Run serially unless concurrency is the behavior under test. A concurrency case uses exactly
   the declared contenders, keeps the winner reserved until both settle, and proves the loser
   left no partial write before releasing the winner.
7. Cleanup temporary state by exact run identifiers in `finally` and recovery, then query to
   verify it is gone. Temporary state includes run-created sessions, nonterminal orders, and
   voucher reservations. Never use broad `deleteMany`, `TRUNCATE`, wildcard cleanup, or
   time-range deletion.
8. Business audit records are a deliberate exception to deletion cleanup. Retain tagged terminal
   orders, issued/redeemed voucher history, and immutable points-ledger rows when deletion would
   violate the production lifecycle. Cleanup means reaching an allowed terminal state and
   releasing reservations; it does not mean erasing audit. Prove that old ledger rows are
   unchanged and that the balance difference equals the sum of newly appended deltas.
9. If cleanup or reconciliation fails, stop all further writes, report the exact non-secret run
   marker, and do not retry with a broader operation. Recovery must be idempotent and must not
   release a voucher held by a later order.
10. Disable or sandbox external effects such as push, SMS, email, payment, and storage unless
    that integration is the explicitly authorized subject.

Classify the profile result explicitly: `PASS` only when every required case for that profile
ran and final reconciliation is clean; `PARTIAL` for a declared data/quota/capability gap with
no observed invariant failure; `FAIL` for a behavior mismatch, unsafe target, ambiguous
mutation, or unresolved temporary state. `FAIL` always overrides `PARTIAL`; skipped cases never
turn a full profile into `PASS`.

Do not place write tests in the current read-only live config. Add a dedicated staging-write
runner/config and command only together with the first real write test, journal, and recovery harness.

## Migration and Security Protocol

Shared persistent staging may verify the application after an approved migration deployment,
but it must not be reset or used to rehearse destructive DDL. For migration execution, use a
Supabase Preview Branch or disposable local PostgreSQL, apply the committed Prisma migrations
in order, seed only synthetic fixtures, run the assertions, and delete/reset only that isolated
environment.

Never run `prisma db push`. Never run `prisma migrate reset`, `DROP`, `TRUNCATE`, destructive
backfills, or migration-history repair against shared staging. RLS/grant claims must execute
through the intended database role or exposed API; a privileged Prisma connection that bypasses
RLS cannot prove end-user authorization.

## Completion Evidence

Report:

```text
Database evidence class:
Target proof:
Read/write/DDL scope:
Fixture ownership and maximum rows:
Retained audit records:
Temporary-state cleanup/recovery result or NOT_APPLICABLE:
Claim proved:
Claims explicitly not proved:
```
