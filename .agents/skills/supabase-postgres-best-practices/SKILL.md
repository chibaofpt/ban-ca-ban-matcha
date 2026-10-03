---
name: supabase-postgres-best-practices
description: Review or optimize PostgreSQL queries, indexes, schema choices, connections, or database performance in Bạn Cá Bán Matcha after loading the project Supabase and Prisma ownership boundaries.
license: MIT
metadata:
  author: supabase
  version: "1.1.1"
  organization: Supabase
  date: January 2026
  abstract: Supabase-maintained PostgreSQL performance reference library, routed through this project's Prisma and verification constraints.
---

# Supabase Postgres Best Practices

Load the project `supabase` skill first. These references are advisory material for PostgreSQL performance; they do not override Prisma schema ownership, custom auth, approved migration workflow, or the mock/static verification boundary in `AGENTS.md`.

## Use

1. Identify the concrete query, index, connection, locking, or RLS performance concern.
2. Read only the matching files in `references/`; use [references/_sections.md](references/_sections.md) as the category index.
3. Compare provider guidance with `prisma/schema.prisma`, committed migrations, `SCHEMA.md`, the relevant service/query code, and project tests.
4. Propose or implement only within the task's authorized scope. Schema/index changes use the project `supabase` and Prisma workflow; do not execute raw SQL, provider migrations, advisors, `EXPLAIN ANALYZE`, or live database probes unless explicitly authorized.
5. Verify with the lane allowed by `AGENTS.md`. Static inspection can establish query shape or index presence; it cannot establish production cardinality, planner choice, latency, locks, or pool behavior.

## Reference categories

| Priority | Category | Prefix |
|---|---|---|
| Critical | Query performance | `query-` |
| Critical | Connection management | `conn-` |
| Critical | Security and RLS | `security-` |
| High | Schema design | `schema-` |
| Medium-high | Concurrency and locking | `lock-` |
| Medium | Data access patterns | `data-` |
| Low-medium | Monitoring and diagnostics | `monitor-` |
| Low | Advanced features | `advanced-` |

Provider examples may use SQL or Supabase Auth concepts to explain PostgreSQL. Translate them to Prisma and this project's custom auth model; do not copy them as application architecture.
