---
name: subagent-orchestration
description: >
  Coordinate delegated implementation and independent review when the user asks for
  sub-agents, parallel owners, an agent manager, or a separate implementation audit.
  Do not activate for ordinary single-agent work.
---

# Sub-agent Orchestration

Root owns scope, shared contracts, file ownership, conflicts, and final acceptance. Use the
smallest useful team: normally one implementer followed by one read-only reviewer. Optimize for
total work through acceptance, including repairs, rather than the first agent's token use.

## Before Delegation

- Existing task authorization covers delegation. Derive intended behavior and scope from the
  request; record the `AGENTS.md` change contract before production edits. Resolve material
  ambiguity before assigning dependent implementation. Never create task plans or changelogs.
- For code tasks, make the focused CodeGraph query required by `AGENTS.md` before direct code
  search. Treat returned source as read; do not spawn a duplicate discovery agent or build an
  absent index. Load only relevant owner resources and follow `RTK.md` for shell commands.
- Load `../tdd/SKILL.md` when `AGENTS.md` requires it. TDD owns lane, Test Seam, evidence, and
  verification decisions. One implementer owns both tests and the corresponding code change.

## Classify Each Task Before Choosing Agents

Assess clarity, affected files and consumers, domain risk, and verification burden after focused
exploration. Classify each independently owned slice, not just the parent task. API, schema,
auth, pricing, order, voucher, security, or cross-domain changes are high risk regardless of size.

| Class | Signals | Orchestrator recommendation | Implementer | Independent reviewer |
| --- | --- | --- | --- | --- |
| Bounded | Clear behavior; up to 3 production files; no contract change | GPT-5.6 Luna `max` or GPT-6.1 Sol `medium` | GPT-5.6 Luna `max` | GPT-6.1 Sol `medium` |
| Integrated | Several files or layers in one domain; contracts frozen | GPT-6.1 Sol `medium` | GPT-5.6 Luna `max` when scope is precise; otherwise GPT-6.1 Sol `high` | GPT-6.1 Sol `high` |
| High risk | Architecture, cross-domain work, or a sensitive contract | GPT-6.1 Sol `high` | GPT-6.1 Sol `high` or `xhigh` | GPT-6.1 Sol `xhigh`; `max` for the hardest cases |

When Luna is chosen, use `max` for quality. If GPT-5.6 is unavailable, use GPT-6.1 Sol at an
appropriate effort and report the substitution. Orchestrator recommendations apply when
selecting a model for a task; Root still owns acceptance with its current model.

Parallel implementation requires frozen shared API, DTO, schema, and business contracts plus
disjoint file ownership. Root owns shared files and conflicts. Otherwise, delegate sequentially.
Do not spawn nested agents unless Root explicitly delegates that authority.

## Packets and Handoff

Use `fork_turns="none"` and send bounded, self-contained packets with repository paths; use a
small recent-turn fork only when essential user wording cannot be captured safely. Full history
requires an explicit reason.

- Implementer packet: objective and acceptance criteria; change contract and owned files;
  relevant invariants and forbidden actions; TDD decisions or `Tests: NOT_NEEDED`; exploration
  already done, remaining reads, targeted verification, and required handoff.
- Reviewer packet, sent after the diff stabilizes: acceptance criteria, actual diff scope,
  invariants, verification evidence and limits, and review focus. Do not send the implementer's
  private reasoning or conclusions. Reviewer stays read-only and reports severity, exact
  file/line, evidence, and minimal correction for each finding; otherwise `No findings`.

The implementer returns changed files, targeted evidence, caveats, and Resource Impact. Root
inspects the actual diff and returns substantive findings or failed verification to the same
implementer. If a finding class repeats, scope expands, or ownership overlaps, reclassify and
re-plan; upgrade a Luna implementer to Sol when the task proves harder than its packet. Default
to at most two review/repair cycles. Interrupt a stalled agent before reassignment, inspect its
partial edits, and give the replacement only the remaining allowlist.

Follow `AGENTS.md` for final verification: targeted checks during implementation, then impacted
gates and one repository-wide hermetic suite on the final executable code/test tree when
required. Later edits invalidate that evidence. Docs-only work uses named verification with
`Tests: NOT_NEEDED`. Never run a production build in this workflow. Root reports changed files,
reviewer outcome, verification and limits, caveats, and Resource Impact; a sub-agent handoff
alone is not completion.
