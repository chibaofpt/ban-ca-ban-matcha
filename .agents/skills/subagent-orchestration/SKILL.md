---
name: subagent-orchestration
description: >
  Coordinate sub-agents with minimal context and clear ownership. Use when the user asks
  to use sub-agents, split work among agents, create Backend/Frontend/QA agents, delegate
  parallel work, assign an agent manager, or have a separate agent review implementation.
  Do not activate for ordinary single-agent work unless delegation is requested.
---

# Sub-agent Orchestration

Minimize duplicated context while preserving ownership, verification, and user intent.

## Before Delegating

- Root keeps the full conversation. Give each sub-agent only the information needed for one bounded task.
- Freeze shared API, DTO, schema, and business contracts before parallel implementation.
- Use the smallest useful team. Do not delegate a small single-owner change merely for parallelism.
- Never let two active agents edit the same file. Root owns shared contracts and conflict resolution.

## Required Context Packet

Every delegated task must include:

```text
Objective:
Current failure:
Expected behavior:
Owned files:
Relevant contract:
Invariants:
Forbidden actions:
Targeted tests:
Handoff format:
```

Reference repository paths and let the agent inspect them. Do not paste long source files,
discarded plans, unrelated test output, or the full parent discussion.

## Fork and Team Policy

- Prefer `fork_turns="none"` when the packet is self-contained.
- Otherwise fork only the smallest number of recent turns that contain material user wording.
- Do not use `fork_turns="all"` unless unresolved history is essential; Root must state why.
- Do not override model or reasoning effort without an explicit requirement.
- Sub-agents must not spawn nested agents unless Root explicitly delegates that authority.
- Run independent implementers in parallel only with disjoint file ownership.
- Start QA after stable implementation handoffs. QA is review-only and receives the frozen
  contract, changed-file list, acceptance criteria, and repro/test commands—not full history.

## Verification and Handoff

- Implementers run targeted checks for owned changes.
- Root or final QA runs type-check, lint, resource checks, and the full suite once at the final gate.
- Batch QA findings by owner; avoid one repair cycle per individual finding.
- Keep handoffs concise: changed files, test results, caveats, and resource impact.
- Stop and return to Root when ownership overlaps, a contract is unclear, or scope must expand.

