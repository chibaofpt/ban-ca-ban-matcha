---
name: subagent-orchestration
description: >
  Execute an approved implementation plan through an adaptive test-first implementer
  and an independent reviewer while minimizing duplicated context and token use. Use
  when the user asks for sub-agents, delegated implementation, parallel owners, an agent
  manager, or a separate implementation audit. Do not activate for ordinary single-agent
  work unless delegation is requested.
---

# Sub-agent Orchestration

Run an approved plan through one accountable implementation lane and one independent
review lane. Root owns scope, contracts, context packets, conflict resolution, and final
acceptance.

## Entry Gate

- Require an implementation plan approved by the user before spawning an implementer.
- If approval, expected behavior, or a material contract is missing, keep the work with
  Root and resolve the plan first.
- Record the repository change contract in the current task before production edits:

```text
Expected behavior:
Current failure:
Allowed production files:
Invariants that must not change:
Forbidden actions:
Tests:
Resource Impact:
```

- Never create `task.md`, `implementation_plan.md`, or change-history files.
- Use the smallest useful team. One sequential implementer and one reviewer is the default.
  Add parallel implementers only when ownership is genuinely disjoint.

## Exploration and Token Economy

### Recognize CodeGraph Automatically

Do not wait for the user to name CodeGraph. Root and every delegated agent must decide
whether it is warranted before their first code read.

Use CodeGraph first when any of these conditions applies:

- the agent is entering an unfamiliar codebase or domain;
- the task requires tracing a request, data, pricing, order, voucher, or state flow;
- symbol ownership, callers, consumers, or edit blast radius is not already known;
- the approved plan crosses layers or the owned production files are uncertain.

Make one focused query using the relevant flow endpoints, symbols, or file names. Use
`maxFiles: 8` by default and narrow a follow-up query instead of requesting a broad
repository survey. Treat returned source as already read; do not repeat it with `rg` or
raw file reads.

Skip CodeGraph for docs/config-only changes, a known isolated file, or content it does not
index. If the project is not indexed, stop calling CodeGraph for that session and use normal
repository tools; do not initialize an index without the user. If CodeGraph reports stale
edited files, read only those files directly until the index catches up.

Do not spawn a discovery agent merely to duplicate a CodeGraph lookup.

### Use RTK Without Adding Work

- Follow the repository RTK command policy for shell commands.
- Use RTK-filtered output as the default evidence; request raw output only when filtering
  hides a detail required to diagnose a failure.
- Do not run `rtk gain` during ordinary implementation. Use it only when the user requests
  a token-efficiency audit.
- Avoid duplicated file reads, repeated unchanged status checks, and repeated full suites.

## Choose the Test Lane

Follow the canonical TDD load predicate in `AGENTS.md`; do not duplicate or broaden it
here. When loaded, read `../tdd/SKILL.md` and classify every vertical slice, not the task
once. Use `AUDIT_ONLY` for read-only test analysis. Executable slices follow the TDD skill; a
`NOT_NEEDED` slice records either its no-signal reason and named verification, or the narrow
UI-only `MANUAL_UI_REQUIRED` exception with a named human before/after acceptance check. Do not
apply that exception to another executable slice merely to skip automated evidence.

One implementer owns both test changes and production implementation. Keeping the red-to-
green loop with one owner avoids duplicated discovery and a test-writer-to-coder handoff.

## Required Context Packets

Root keeps the full conversation. Give each sub-agent only one bounded packet and reference
repository paths instead of pasting long source files. Do not send discarded plans,
unrelated test output, or the full parent discussion.

### Implementer Packet

```text
Objective:
Approved plan and acceptance criteria:
Current failure:
Expected behavior:
Owned files:
Relevant contract:
Invariants:
Forbidden actions:
Test lane and targeted tests:
Confirmed public Test Seam and independent oracle per executable slice:
Allowed boundary doubles:
Evidence label per executable slice and claims explicitly not proved:
Manual UI acceptance requirement or NOT_APPLICABLE:
Exploration: CodeGraph required | conditional | not needed, with reason:
Verification commands:
Handoff format:
```

Default implementation preset, unless the user overrides it:

- model: `gpt-5.6-sol`;
- reasoning effort: `low` (the requested light implementation lane);
- context: `fork_turns="none"` with a self-contained packet.

The implementer must not spawn nested agents unless Root explicitly delegates that
authority.

### Independent Reviewer Packet

Start review only after the implementation handoff is stable. Give the reviewer:

```text
Approved plan and acceptance criteria:
Change contract and invariants:
Test-lane decision and red/green evidence:
Confirmed seams, independent oracles, and mock inventory:
Evidence labels, claims proved, and claims explicitly not proved:
Manual UI acceptance requirement or NOT_APPLICABLE:
Changed-file list or diff scope:
Targeted verification results:
Review focus:
Required finding format:
```

Do not send the implementer's private reasoning, confidence statement, or conclusions.
Default review preset, unless the user overrides it:

- model: `gpt-5.6-sol`;
- reasoning effort: `medium`;
- context: `fork_turns="none"` with the independent review packet.

The reviewer is read-only. It audits the entire implementation against the approved plan,
test choice, contracts, regressions, security, and resource impact. It must not edit files.
Each finding includes severity, exact file and line, evidence, and a minimal correction.
Return `No findings` when no actionable issue remains.

## Fork and Team Policy

- Prefer `fork_turns="none"` whenever the packet is self-contained.
- Otherwise fork only the few recent turns containing indispensable user wording.
- Use `fork_turns="all"` only when unresolved history is essential, and state why.
- Do not override model or reasoning effort except for the presets above, an explicit user
  requirement, or a higher-priority repository instruction.
- Freeze shared API, DTO, schema, and business contracts before parallel implementation.
- Never let two active agents edit the same file. Root owns shared contracts and conflicts.
- Run parallel implementers only with disjoint file ownership.
- QA starts after stable implementation handoffs, never in parallel with edits to the same
  scope.

## Implementation, Review, and Repair Loop

1. Root freezes the approved contract, chooses the test lane, and sends the implementer
   packet.
2. The implementer performs the selected red or characterization check, applies the
   smallest approved patch, and runs targeted verification until green.
3. The implementer hands off changed files, test evidence, caveats, and Resource Impact.
4. Root sends the reviewer the frozen contract, actual diff scope, seam/oracle,
   red or characterization, green, and mock inventory evidence.
5. Root batches all reviewer findings into one packet for the same implementer.
6. The implementer repairs the batch and returns updated targeted evidence.
7. The reviewer re-checks the repaired scope when findings were substantive.

The reviewer inspects the actual diff and all mocks/spies. It rejects mirror or tautological
tests, owned internal mocks, invalid red evidence, and transaction fakes presented as
database/concurrency proof. It also checks that the handoff explicitly distinguishes application
claims from claims not proved by a fake boundary or manual UI acceptance. Findings include
severity, exact file/line, evidence, and a minimal correction; return `No findings` only when
evidence is complete.

Default to at most two review/repair cycles. Re-plan instead of looping when the same class
of finding returns, scope must expand, ownership overlaps, or a contract is unclear.
Interrupt a stalled agent before reassignment, inspect partial edits, and give the replacement
only the exact remaining allowlist.

## Verification and Handoff

- Implementers run targeted checks for their owned changes.
- Run type-check, lint, resource checks, and the full suite once at the final gate, following
  repository rules. Do not run a production build in the agent implementation workflow.
- Root verifies the actual diff, seam/oracle and mock evidence, reviewer outcome, and
  resource impact. A sub-agent handoff is evidence, not completion by itself.
- Any production/test edit after the final full suite invalidates that gate.
- Keep handoffs concise: changed files, selected test lane, red/characterization and green
  results, final checks, evidence labels, claims proved, claims explicitly not proved, manual
  UI acceptance or NOT_APPLICABLE, reviewer findings and resolutions, caveats, and Resource
  Impact.
- Stop and return to Root when ownership overlaps, scope must expand, or implementation
  would diverge materially from the approved plan.
