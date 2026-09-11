---
name: subagent-orchestration
description: >
  Execute delegated implementation through a focused implementer and an independent reviewer.
  Use when the user asks for sub-agents, parallel owners, an agent manager, or a separate
  implementation audit. Do not activate for ordinary single-agent work.
---

# Sub-agent Orchestration

Root owns scope, shared contracts, file ownership, conflict resolution, and final acceptance.
Use the smallest useful team: normally one implementer followed by one read-only reviewer.

## Entry and Scope

- Existing task authorization applies to docs, research, review, and other non-production work;
  do not require a separate implementation-plan approval merely because work is delegated.
- Before production edits, agree the intended behavior and production scope with the user and
  record the repository change contract from `AGENTS.md`. Resolve missing or materially ambiguous
  contracts before delegating dependent implementation.
- Never create `task.md`, `implementation_plan.md`, or change-history files.
- Freeze shared API, DTO, schema, and business contracts before parallel implementation. Give
  active editors disjoint file ownership; Root owns shared files and conflicts.

## Context and Exploration

Follow `AGENTS.md` for CodeGraph and resource routing. A code task begins with one focused
CodeGraph query unless it is docs-only or no index exists. A known isolated production file is
still a code task; query its symbol, callers, or consumers before direct reads. Treat returned
source as read, narrow follow-ups, and read directly only missing or stale content. Do not spawn a
discovery agent to repeat that lookup or initialize a missing index.

Follow `RTK.md` for shell commands. Avoid repeated reads, unchanged status checks, and repeated
repository-wide suites.

## Testing Ownership

`tdd` is the sole owner of lane selection, Test Seam records, mock boundaries, evidence labels,
manual UI acceptance, red/characterization/green procedure, and claims proved or not proved. Load
`../tdd/SKILL.md` when the predicate in `AGENTS.md` applies, then include its resulting decisions
in the agent packets. One implementer owns both tests and the corresponding production change.

## Agent Packets

Send bounded, self-contained packets and repository paths. Do not paste long source, discarded
plans, unrelated output, or the full parent discussion.

Implementer packet:

```text
Objective and acceptance criteria:
Change contract and owned files:
Relevant contracts and invariants:
Forbidden actions:
TDD decisions and targeted verification, or Tests: NOT_NEEDED:
Exploration already completed and remaining reads:
Required handoff:
```

Default implementer preset: `gpt-5.6-sol`, reasoning `low`, `fork_turns="none"`. The implementer
must not spawn nested agents unless Root delegates that authority.

After implementation stabilizes, send an independent reviewer:

```text
Acceptance criteria and frozen change contract:
Actual diff scope:
Relevant contracts and invariants:
TDD evidence and limitations, or Tests: NOT_NEEDED:
Targeted verification results:
Review focus and finding format:
```

Default reviewer preset: `gpt-5.6-sol`, reasoning `medium`, `fork_turns="none"`. Do not send the
implementer's private reasoning or conclusions. The reviewer must remain read-only and report each
actionable finding with severity, exact file/line, evidence, and a minimal correction; otherwise
return `No findings`.

Use a small recent-turn fork only when indispensable user wording cannot be represented safely in
the packet. Use full history only when unresolved history is essential and state why. Do not
override the presets except for an explicit user request or higher-priority repository instruction.

## Implement, Review, Repair

1. Root assigns the frozen scope and TDD decisions to the implementer.
2. The implementer returns changed files, targeted evidence, caveats, and Resource Impact.
3. Root verifies the actual diff, then sends stable evidence and scope to the reviewer.
4. Root batches substantive findings back to the same implementer and requests a reviewer re-check.

Default to at most two review/repair cycles. Re-plan when a finding class repeats, scope expands,
ownership overlaps, or a contract remains unclear. Interrupt a stalled agent before reassignment,
inspect partial edits, and give the replacement only the remaining allowlist.

Final verification follows `AGENTS.md`: targeted checks during implementation, then impacted gates
and one repository-wide hermetic suite on the final executable code/test tree when required. Docs-only
work uses its named verification and does not acquire a full-suite obligation. A later production or
test edit invalidates executable final-gate evidence. Never run a production build in this workflow.

Root's handoff reports the actual changed files, reviewer outcome, verification, evidence limits,
caveats, and Resource Impact. A sub-agent handoff alone is not completion.
