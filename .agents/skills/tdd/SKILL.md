---
name: tdd
description: >
  Select focused backend-first test evidence for Bạn Cá Bán Matcha when a task changes
  executable behavior, public contracts, business rules, security, persistence branches, or
  behavior-preserving structure. Use AUDIT_ONLY for read-only test review; UI/UX acceptance
  remains manual rather than synthetic component coverage.
---

# Backend-first TDD

Protect caller-visible behavior through public seams. Work vertically: one meaningful case,
the smallest production patch, then the next case. Never create `implementation_plan.md`,
`task.md`, or change-history files.

## Load and Choose a Lane

Load this skill when the user requests tests/TDD/test review, or a vertical slice changes
runtime output, status/error shape, validation, authorization, pricing, state transitions,
persistence branches, external effects, security, or behavior-preserving structure. An approved
plan alone does not trigger it. For a task with no executable signal, record
`Tests: NOT_NEEDED — <reason>; verification: <named check>`.

Record exactly one lane for each vertical slice before production edits:

| Lane | Use when | First evidence |
|---|---|---|
| `AUDIT_ONLY` | Read-only test review | Inspect the seam, oracle, doubles, and existing claims without editing |
| `REQUIRED_RED` | New behavior, business/API/security logic, or a bug fix | A regression case fails for the intended missing behavior |
| `CHARACTERIZATION_FIRST` | Refactor, move, split, or behavior-preserving replacement | A case captures and passes with current behavior |
| `UPDATE_EXISTING` | Approved behavior changes existing coverage | The closest relevant case fails meaningfully after its update |
| `NOT_NEEDED` | No automated test is required: either no executable behavior/public-contract/security/data/state/validation change, or a UI-only rendered/interactive slice outside the approved automated scope | State the no-signal reason, or record `MANUAL_UI_REQUIRED` with a named human before/after acceptance check |

Pure documentation, comments, formatting, static assets, and purely visual CSS can be
`NOT_NEEDED`. A UI-only rendered or interactive slice is executable behavior, not a no-signal
slice: use the narrow `NOT_NEEDED` manual-UI exception with `MANUAL_UI_REQUIRED`, a named human
before/after acceptance check, and no claim that an automated pass proves it. Missing
infrastructure or a difficult seam is never a reason to skip an otherwise automated-eligible
slice. Do not manufacture red/green evidence for `AUDIT_ONLY`.

## Project Testing Strategy

Automated evidence is backend-first and hermetic. Use only the `node` and
`static-contract` runners. Do not add, select, or represent staging, isolated-database, live,
or DOM/UI runs as evidence for this strategy.

Test real owned application behavior: pricing/calculators, validation, authorization policy,
state transitions, and domain helpers. Double only system boundaries when that boundary is not
the behavior being proved: Prisma/database and transaction acquisition, Redis, session/cookie
acquisition, clock/random/UUID, filesystem/storage, and external APIs through their adapter.
The route or service must still execute its real owned policy after the boundary returns.

Frontend automated tests are limited to service outbound payloads, successful response/DTO
unwrapping, and returned error handling, plus shared pure calculators and non-UI pure security
helpers. UI/UX, rendered interaction, accessibility, touch behavior, layout, and animation use
the `NOT_NEEDED` manual-UI exception: record `MANUAL_UI_REQUIRED` and a named human before/after
acceptance check. They are not a reason to invent component tests or to claim there is no
executable behavior.

Read [references/mock-boundaries.md](references/mock-boundaries.md) only when a test doubles a
database, Redis, session, time, or external API boundary, models a race outcome, makes a rate
limit claim, or needs to state an evidence gap. It defines the permitted claim labels.

## Test Seam Record

Before test or production edits, record this for each executable slice:

```text
Test Seam:
- Slice/capability:
- Lane:
- Public entry point:
- Observable result:
- Independent oracle/source:
- Real owned collaborators:
- Boundary doubles and reason:
- Evidence label:
- Manual UI check: NOT_APPLICABLE | <acceptance check>
- Test path and runner:
- Confirmed by: <user request, approved plan, or canonical contract>
```

Use route request/response, exported domain calculator/service, frontend service result and
outbound contract, server-side domain-state entry point, or another caller-visible entry point.
Do not add private imports or test-only exports. Derive expected values from a literal worked
example, acceptance criterion, canonical rule, or independently derived fixture—not the subject,
its helpers, constants, or copied control flow.

## Vertical Red/Green Loop

1. Write a proportional Test Plan in the current task, naming applicable happy-path,
   authorization, validation, business-rule, and edge cases. Reuse the closest domain test.
2. For automated-eligible `REQUIRED_RED` and `UPDATE_EXISTING` slices, write one complete case
   and run it before the corresponding production change. It must compile, reach the intended
   assertion, and fail for the approved behavior—not setup or baseline noise.
3. For automated-eligible `CHARACTERIZATION_FIRST` slices, run the passing baseline before
   structural edits. Do not invert an assertion merely to create red evidence. UI-only manual
   slices use their named human before/after check instead of synthetic red/green evidence.
4. Apply only the smallest approved patch; rerun the targeted case to green before writing the
   next case.
5. After all targeted cases are green, follow the final-gate policy in `AGENTS.md`: run impacted
   checks and one final repository-wide hermetic suite on the final code/test tree. Any later
   production or test edit invalidates that gate. Do not run a build, dev server, browser, or
   database test as part of this workflow.

Targeted commands use the available runners:

```bash
rtk npm run test:node -- <test-file-path>
rtk npm run test:contract -- <test-file-path>
```

Use `node` for routes, domain services, server-side domain-state logic, pure logic, frontend
service contracts, and non-UI security helpers. Use `static-contract` only for source/schema/SQL
artifact guardrails; it cannot prove runtime behavior.

## Test Conventions

- Write `describe()` and `it()` names in Vietnamese; keep code, variables, and comments in
  English. Do not use TypeScript `any`.
- Declare each boundary double before importing the subject and reset it in `beforeEach`.
- Prefer typed, operation-specific fakes over generic conditional fetch mocks.
- Reject mirror tests, tautological expected values, internal spies, private imports, incidental
  call-order/count assertions, and snapshots used as business, pricing, or security oracles.
- Do not impose an arbitrary coverage percentage or an every-file test mandate. Add evidence
  only where the approved behavior needs it.

## Completion Record

Before handoff, report:

```text
Lane per slice:
Confirmed public seam and independent oracle:
Boundary doubles:
Evidence label and targeted command, or manual before/after acceptance: key result:
Claims proved:
Claims explicitly not proved:
Manual UI acceptance: NOT_APPLICABLE | required check:
Changed files:
Impacted checks and final hermetic-suite result (or NOT_NEEDED reason):
Resource Impact:
```

The independent reviewer audits the actual diff, seam/oracle, doubles, evidence label, and the
claims-not-proved field. A fake transaction, fake Redis, or simulated interleaving must never be
reported as proof of locks, isolation, rollback, constraint enforcement, actual concurrency, or
the live external service.
