---
name: security-checklist
description: Audit or harden security for Bạn Cá Bán Matcha before production. Use for explicit security reviews, pre-production checks, or security-sensitive implementation; load only the relevant checklist sections.
---

# Security Checklist

Use this skill for an explicit security audit or security-sensitive change. It guides review; it does not authorize live probes, credential access, remote mutations, deployment, or release. Follow `AGENTS.md`, the task's owner skills, and the permitted verification lane.

Read [references/checklist.md](references/checklist.md) for the requested scope. For a broad pre-production audit, read all sections. For a focused change, load only the related categories and appendix:

- secrets, auth, sessions, CSRF, validation: Categories 1–3;
- rate limits, races, points, uploads: Categories 4–6;
- headers, privacy, logging: Categories 7–8;
- Next.js routes, cron, proxies, operations: Categories 9–12;
- a new API, external service, cron, or upload: the matching appendix plus its category.

## Critical project invariants

- Authentication is custom phone/password auth using `jose` and httpOnly cookies. Never replace it with Supabase Auth.
- Login performs constant bcrypt work for every attempt, including unknown users. Preserve the exact API response contract owned by `API.md`; do not invent a different message policy in this checklist.
- Client price fields may be accepted only where the API contract uses them for stale-price comparison such as `PRICE_CHANGED`. Never trust them for totals: validate quantities and identifiers, reload authoritative menu/pricing data, and compute money on the server.
- Prisma owns schema and migrations. Multi-step database writes use `prisma.$transaction()`; domain rules remain in the pricing, order, and voucher owners.
- Protect secrets and PII, preserve RLS on exposed data, and keep external SDKs behind project adapters/hooks.
- Supabase Cron is the primary scheduler when specified by the API/platform owner. A Vercel schedule is only a documented backup when the owner explicitly defines it; do not require every cron route to appear in `vercel.json`.
- Audit evidence respects the task boundary. Mock/static checks do not prove live RLS, scheduler activation, deployed headers, provider configuration, or database concurrency.
- Production release follows `production-deploy` and still requires its user confirmation boundary.

## Reporting

For every reviewed item, report PASS, FAIL, NOT_APPLICABLE, or UNVERIFIED with evidence. Separate implementation defects from documentation drift and operational state. State what was inspected, what remains unproved, and which owner resource must change if the security requirement changes.
