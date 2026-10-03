---
name: supabase
description: Apply project-specific Supabase boundaries for Database, Storage, Realtime, RLS, Cron, keys, and data-plane security in Bạn Cá Bán Matcha. Use for Supabase platform work; Prisma remains the application schema owner.
---

# Supabase

## Project boundaries

- The app uses custom phone/password authentication with `jose` and httpOnly cookies. Do not introduce Supabase Auth or apply Supabase Auth JWT guidance to this application.
- Prisma owns application schema and migration history. Read `prisma/schema.prisma`, committed Prisma migrations, `SCHEMA.md`, and the relevant project owner before proposing a data change.
- Use `npm run migrate:dev` for authorized development migrations and commit `prisma/migrations`. Never use `prisma db push`, Supabase migration files, `db pull`, raw SQL, SQL Editor, or MCP SQL as a parallel application-schema workflow.
- Supabase platform work covers RLS, grants, Storage, Realtime publication, Cron, keys, and observable data-plane configuration. Remote inspection or mutation requires the task's authority; documentation guidance never grants it.
- When generic Supabase guidance conflicts with `AGENTS.md` or a project owner, the project rule wins.

## Security invariants

- Never expose `service_role`, secret keys, connection strings, or server-only credentials to a client bundle. Any `NEXT_PUBLIC_` value is public.
- Treat every table in an exposed schema as reachable through the Data API. Enable RLS and write policies for the project's actual access model; do not assume custom app sessions map to `auth.uid()`.
- Views can bypass RLS. Use `security_invoker` where supported or revoke exposed roles / place the view in an unexposed schema.
- Keep `security definer` functions outside exposed schemas. Remember that RLS `UPDATE` also needs row visibility, and Storage upsert needs the applicable insert/select/update policies.
- Isolate Supabase client SDK usage in a server adapter, client adapter, or hook. UI components consume the project interface rather than importing the SDK directly.

For an explicit security audit, load `security-checklist`. For Realtime, also load `supabase-realtime`. For Postgres performance work, load `supabase-postgres-best-practices` after this skill.

## Working method

1. Classify the task as application schema, Supabase platform configuration, data-plane observation, or client integration.
2. Read only the relevant project owner and current official Supabase documentation. Provider details are conditional evidence, not permission or project architecture.
3. State the exact local and remote scope before changes. Use current CLI `--help` when a CLI operation is actually authorized; do not guess commands or fall back to live SQL.
4. Verify with the lane allowed by `AGENTS.md` and the task. Mock-only or static-contract work must not be upgraded to a live query. Report what the evidence proves and does not prove.
5. Stop repeated retries after two or three materially identical failures; inspect the error and reconsider the approach.

## Conditional references

- Read [references/skill-feedback.md](references/skill-feedback.md) only when the user wants to send feedback upstream. Local skill review/fixes do not start a GitHub issue workflow.
- Use current [Supabase documentation](https://supabase.com/docs) for the specific platform feature when implementation depends on provider behavior.
