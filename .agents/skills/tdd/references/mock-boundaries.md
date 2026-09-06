# Mock Boundaries and Evidence Claims

Read this reference only when a backend-first `node` test doubles a system boundary, models a
contention outcome, or reports a rate-limit or frontend-service claim. The project strategy does not
run staging, live, or isolated-database tests. Do not add such infrastructure merely to close an
evidence gap.

## Boundary Rule

Run owned application logic for real: business pricing, validation, authorization policy, state
transitions, and domain helpers. The following may be replaced with a typed, operation-specific
double only when they are not the subject of the claim:

| Boundary | What the double may supply | What remains real |
|---|---|---|
| Prisma/database or `$transaction` acquisition | Query/update result, controlled error, transaction callback entry | Route/service branch, validation, authorization, error mapping, and returned response |
| Redis | Stateful counter/key result or controlled availability error | Key derivation, configured limit/window policy, decision and response mapping |
| Session/cookie acquisition | Identity or absence of a session | Authorization policy and role checks after acquisition |
| Clock/random/UUID | Deterministic instant or identifier | Expiry/window/business policy using that value |
| External API, storage, filesystem | Adapter result or failure | Adapter caller's handling and caller-visible result |

Keep the fake small and stateful enough to expose the declared branch. Do not replace an owned
calculator, validation schema, authorization rule, transition function, or subject internal.

## Evidence Labels

Use one label in the Test Seam and completion report. Each label limits, rather than inflates,
the claim.

| Label | Supports | Explicitly does not support |
|---|---|---|
| `APPLICATION_LOGIC` | Real application branching, validation, authorization, state handling, and response/error mapping around a boundary result | PostgreSQL constraints, transactions, locks, isolation, rollback, Decimal behavior, or actual concurrency |
| `SIMULATED_RACE_OUTCOME` | The application handles a controlled winner/loser result consistently | That a real database/Redis race, lock, isolation level, atomic update, or rollback occurred |
| `RATE_LIMIT_POLICY` | Key/window policy and caller-visible handling using a stateful fake Redis counter | Redis command atomicity, production availability, cross-process consistency, or actual distributed enforcement |
| `FRONTEND_CONTRACT` | Service URL/method/payload, successful response/DTO unwrapping, and preservation of server error status, `error`, `code`, and `details` | Rendered UI, accessibility, layout, touch behavior, or server/database execution |
| `STATIC_ARTIFACT` | A source/schema/SQL artifact has the required textual or structural guardrail | Runtime execution, migration application, PostgreSQL semantics, or deployed behavior |
| `MANUAL_UI_REQUIRED` | A manual acceptance check is required for the stated UI/UX behavior | Automated proof of that visual or interactive behavior |

## Controlled Contention Outcomes

Use controlled outcomes to prove application handling, not database behavior:

- `count: 0` from an expected-state conditional update models a loser. It can prove that the
  application returns its intended conflict/transition response; it cannot prove that a real
  concurrent update chose the winner.
- `P2002` models a unique-constraint loser. It can prove that the application maps the caught
  error to the documented response; it cannot prove the real schema constraint or winner state.
- `P2034` models a serialization-conflict/retry outcome. It can prove retry/exhaustion handling
  and its documented response; it cannot prove real serializable execution or rollback.

For a simulated two-request case, use a stateful fake and explicit gates so one invocation gets
the declared winner result and the other gets the declared loser result. Label it
`SIMULATED_RACE_OUTCOME`, name the exact controlled outcomes, and state that live contention is
not proved.

## Rate-limit Fakes

Use a stateful fake Redis implementation that retains the declared counter and expiry for the
test. Exercise the real key derivation and configured policy with sequential attempts, including
the threshold and reject attempt. Label this `RATE_LIMIT_POLICY`. A fixed mocked return value or
call count is not sufficient evidence of the policy, and the result must not be described as
proof of real Redis atomicity or distributed enforcement.

## Frontend Service Errors and Manual UI

Frontend service tests should assert the outbound URL, method, payload, successful response/DTO
unwrapping, and the preserved server status, error message, code, and optional details. For a
business-rule error, retain `BUSINESS_RULE_VIOLATION` and `details.reason`; do not collapse it to
a generic client message.

When a UI-only rendered or interactive slice is executable but outside the approved automated
scope, select the TDD `NOT_NEEDED` manual-UI exception, record `MANUAL_UI_REQUIRED`, and name a
concise human before/after check (for example, the state to reach and the visible/interactive
result). Do not call this a no-behavior slice or claim an automated pass; do not add
DOM/component coverage just to satisfy this record. Backend, service, shared-calculator, and
non-UI pure-security slices in the same task retain their own automated lanes.

## Evidence Gap

If acceptance requires real database locks, isolation, rollback, schema constraints, migrations,
RLS, actual distributed rate limiting, or a live third-party effect, report the gap plainly:

```text
Claims proved: <application-level result>
Claims explicitly not proved: <external/database property>
Reason: The project strategy uses mock-only backend evidence and no live or isolated database target.
Manual/authorization needed: user approval for a separately scoped real-environment strategy.
```

This is a limitation report, not a request to silently create runners, fixtures, database
infrastructure, staging access, or new test files. No coverage target or every-file test rule
follows from an evidence gap.
