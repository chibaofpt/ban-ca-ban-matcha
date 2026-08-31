---
name: tdd
description: >
  Select and execute the appropriate test-first lane for Bạn Cá Bán Matcha features,
  implementation plans, API routes, business logic, services, refactors, significant
  workflows, and business bug fixes. Also use when the user asks to write, update, review,
  or plan tests. Skip synthetic tests for changes without executable behavior.
---

# Adaptive TDD

Choose the test lane that provides meaningful evidence, confirm the expected signal,
implement the smallest patch, and verify it. Never create `implementation_plan.md`,
`task.md`, or change-history files.

## When to Trigger

| Trigger | Required response |
|---|---|
| The user approves an implementation plan | Record the Test Plan in the current task; do not create a plan file |
| The user explicitly requests tests or logic verification | Select a test lane and cover the requested behavior |
| A feature or workflow adds meaningful behavior | Add focused behavior coverage before implementation |
| A business-logic bug requires multi-branch verification | Add a regression test that proves the defect |
| A refactor moves, splits, or replaces behavior | Add or confirm characterization coverage before structural edits |

## Test-Lane Decision

Record exactly one lane in the current task or approved plan before production edits:

| Lane | Use when | First check |
|---|---|---|
| `REQUIRED_RED` | New behavior, business/API/security logic, or a bug fix | Write or update a regression test and confirm it fails for the intended reason |
| `CHARACTERIZATION_FIRST` | Refactor, move, split, or behavior-preserving replacement | Capture current behavior and confirm the characterization test passes |
| `UPDATE_EXISTING` | Existing coverage should change with the approved behavior | Update the closest test and confirm a meaningful failure |
| `NOT_NEEDED` | Docs, metadata/config, pure style/layout, generated output, or another change without executable behavior | Explain why a test adds no signal and select static or targeted verification |

Business, API, and security behavior normally requires a regression test. Pure text, style,
layout, or documentation changes do not need artificial tests. If behavior is hidden behind
a shared utility and uncertainty remains, choose the safer executable lane.

When this skill runs inside `subagent-orchestration`, one implementer owns the entire test-
to-code loop. The independent reviewer audits the evidence but never edits tests or
production code.

## Required Workflow

### Step 1: Define Test Scope in the Current Task or Plan

Write a proportional **Test Plan** before production edits:

```markdown
## Test Plan

### Backend Tests

#### [test file path] — [behavior under test]
- `describe("...")` — context
  - `it("case 1")` — concise behavior
  - `it("case 2")` — concise behavior

### Frontend Tests (when applicable)

#### [test file path] — [behavior under test]
- `describe("...")` — context
  - `it("case 1")` — concise behavior
```

Use these criteria when deciding what needs executable coverage:

| Test | Usually do not add a dedicated test |
|---|---|
| Route handlers with validation, transition, pricing, or other business rules | Simple CRUD routes that only query and return data |
| Helpers or utilities with calculations such as cancellation or pricing | Configuration files and constants |
| Services that transform data | Page entry files such as `app/**/page.tsx` |
| Complex state logic or Zustand slices with side effects | UI-only components without logic |
| Validation schemas with custom transforms or refinements | Re-export files |

Cover relevant happy paths, authorization, validation, business rules, and edge cases. Omit
categories that do not apply.

### Step 2: Review the Lane and Test Plan

- Confirm that each test proves an approved behavior or protects an existing invariant.
- Reuse the closest domain test instead of creating duplicate coverage.
- For `NOT_NEEDED`, name the lint, type, static, snapshot, or targeted existing check that
  will replace a new test.
- If the test expectation conflicts with canonical resources or contracts, classify
  documentation drift versus implementation defect before editing either side.

### Step 3: Establish Red or Characterization Evidence

For `REQUIRED_RED` and `UPDATE_EXISTING`, write the complete test change before production
code and run it once:

- The test should fail because the approved behavior is missing or wrong.
- The test must compile and reach the intended assertion.
- Syntax, import, fixture, environment, or unrelated baseline failures are not valid red
  evidence.
- Mock external boundaries such as Prisma, auth, and external services, but do not mock the
  behavior being proven.

For `CHARACTERIZATION_FIRST`, capture the current contract and run it once before structural
changes. The meaningful evidence is a passing baseline; do not invert an assertion merely
to manufacture red.

Targeted command:

```bash
rtk node node_modules/vitest/vitest.mjs run <test-file-path>
```

### Step 4: Implement the Smallest Production Patch

Implement only the approved behavior and allowed files. Preserve repository contracts and
avoid unrelated refactors or test rewrites.

### Step 5: Reach Green and Run the Final Gate

- Re-run the targeted test after each coherent patch until it passes.
- Do not repeatedly run the full suite during implementation.
- At the final gate, run the repository-wide suite once together with the lint, type-check,
  and resource checks required by `AGENTS.md`.
- Separate pre-existing baseline failures from regressions introduced by the change.

```bash
rtk node node_modules/vitest/vitest.mjs run <test-file-path>
rtk node node_modules/vitest/vitest.mjs run
```

## Test File Organization

Select the runner that matches the evidence type. Hermetic node tests may double database or
external boundaries only when those systems are not the claim. Live staging is opt-in and excluded
from the default suite.

Before making a database claim, read
[references/database-testing.md](references/database-testing.md) and select `NONE`,
`STAGING_READ`, `STAGING_WRITE`, or `ISOLATED_MIGRATION`. Static source/schema checks do not prove
database execution, constraints, rollback, isolation, or data-plane authorization.

### Merge or Split Rules

- Merge new cases into an existing test file when they belong to the same domain. For
  example, add cancellation cases to `order-cancel.test.ts`.
- Create a new test file only when no suitable domain test exists, or the existing file is
  already over 300 lines and the new feature is independently substantial with more than
  10 test cases.

Keep the existing directory structure:

```text
lib/__tests__/                           Backend routes, helpers, and business logic
src/__tests__/
  components/{domain}/                  Frontend logic-only tests without React rendering
  services/                             Frontend service mock tests
  lib/                                  Frontend utilities and helpers
  pricing/                              Pricing-pipeline integration tests
```

Naming conventions:

- Backend: `lib/__tests__/{domain-feature}.test.ts`, such as `order-cancel.test.ts` or
  `vouchers.test.ts`.
- Frontend components: `src/__tests__/components/{domain}/{Feature}.logic.test.ts`.
- Frontend services: `src/__tests__/services/{domain}Service.test.ts`.

## Required Test Conventions

### Language

- Write `describe()` and `it()` descriptions in Vietnamese.
- Write code, comments, and variable names in English.

```typescript
describe("PATCH /api/staff/orders/[id] — huỷ đơn", () => {
  it("Staff không được hủy đơn → trả 400 INVALID_TRANSITION", async () => {
    // English code here
    const res = await PATCH(makeReq({ status: "CANCELLED" }), { ... });
    expect(res.status).toBe(400);
  });
});
```

### Mocking Pattern

Declare mocks before importing the subject:

```typescript
const mockGetSession = vi.fn();
const mockOrderFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: (...args: unknown[]) => mockOrderFindUnique(...args) },
    $transaction: vi.fn(),
  },
}));

import { PATCH } from "@/app/api/staff/orders/[id]/route";
```

### Transaction Mock Pattern

This pattern proves callback/application handling only. It does not prove database race safety,
locks, isolation, constraints, Decimal behavior, or rollback; those claims require the matching
real database evidence class from [references/database-testing.md](references/database-testing.md).

```typescript
mockTransaction.mockImplementation(
  async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      order: { findUnique: mockFn, update: mockFn },
      voucher: { findUnique: mockFn, update: mockFn },
      // Include only models used by the implementation.
    };
    return fn(tx);
  }
);
```

### Test Structure

Each `describe` block should organize only the applicable groups:

```typescript
describe("Tính năng / Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up common mocks.
  });

  // Group 1: Happy paths
  it("xử lý thành công trường hợp thứ nhất", async () => { ... });
  it("xử lý thành công trường hợp thứ hai", async () => { ... });

  // Group 2: Authentication and role errors
  it("trả 401 khi chưa đăng nhập", async () => { ... });
  it("trả 403 khi role không đủ", async () => { ... });

  // Group 3: Validation errors
  it("trả 400 khi input không hợp lệ", async () => { ... });

  // Group 4: Business-rule errors
  it("trả 422 khi vi phạm business rule", async () => { ... });

  // Group 5: Edge cases
  it("bỏ qua khi request khác đã hủy đơn", async () => { ... });
});
```

## Concurrency and Limit-Bypass Security Tests

Add the following cases when the implementation actually touches limits, balances, voucher
status, or parent/sub-item mappings. Do not add generic concurrency tests to unrelated CRUD
or UI work.

1. **Voucher or point limit races**
   - Place `count` and `balance` checks inside the transaction.
   - Pair the check with an appropriate locking or atomic conditional-update strategy.
   - Prove that concurrent requests exceeding the limit or balance fail or roll back.

2. **Double-spend state races**
   - For transitions such as `ACTIVE` to `RESERVED` or `REDEEMED`, use a conditional
     expected-state update such as `updateMany`.
   - Roll back or return the correct error when the updated row count is zero.
   - Prove that two requests cannot consume the same voucher or state transition.

3. **Cross-array input verification**
   - When applying a sub-item mapping such as an ADDON voucher, verify that the referenced
     sub-item ID exists in the parent item's submitted array.
   - Prove that an absent add-on ID returns the correct validation error.

## Completion Checklist

### Test Plan

- [ ] The current task contains a Test Plan or a documented `NOT_NEEDED` decision.
- [ ] Cases cover the applicable happy path, auth, validation, business, and edge behavior.
- [ ] The chosen test file is the closest existing domain file when one exists.

### Test Change

- [ ] Mocks are declared before imports.
- [ ] `vi.clearAllMocks()` runs in `beforeEach`.
- [ ] No TypeScript `any` is used.
- [ ] Test descriptions are in Vietnamese.
- [ ] Red or characterization evidence is meaningful and recorded.

### Implementation Completion

- [ ] The targeted test passes.
- [ ] The final full suite has no new regression, or baseline failures are explicitly separated.
- [ ] The completion report includes targeted/full test status and Resource Impact.

## Example Test Plan

```markdown
## Test Plan

### Backend Tests

#### `lib/__tests__/order-cancel.test.ts` — Add admin cancellation-rule cases
- `describe("PATCH /api/staff/orders/[id] — admin hủy đơn")`
  - `it("Staff cố hủy đơn → 400")` — only ADMIN may cancel
  - `it("Admin hủy COUNTER COMPLETED → hoàn điểm")` — reverse `order_complete`
  - `it("Số dư điểm không thấp hơn 0")` — do not allow a negative customer balance
  - `it("Admin hủy PICKUP COMPLETED → 400")` — block completed online cancellation
  - `it("Admin hủy PENDING → 200")` — allow cancellation before completion
  - `it("Khôi phục voucher RESERVED → ACTIVE")` — restore the voucher lifecycle

### Frontend Tests

#### `src/__tests__/services/orderService.test.ts` — Add `adminCancelOrder` coverage
- `describe("adminCancelOrder — hủy đơn bởi admin")`
  - `it("gọi PATCH với status CANCELLED")` — verify endpoint and payload
  - `it("ném lỗi khi API trả 400")` — verify error handling
```
