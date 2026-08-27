---
name: production-deploy
description: >
  Merge dev into main and release Vercel Production after the user confirms friends tested
  staging successfully. Use when the user explicitly asks to deploy or release production,
  merge main, or invokes production-deploy after staging testing.
---

# Production Deploy (Dev to Main)

> Solo-developer workflow: friends test the Vercel Preview from `dev` → the user confirms testing
> passed and requests production deployment → merge `dev` into `main` → Vercel Production runs
> `prisma migrate deploy`. Production receives the same migration history and schema as staging;
> staging data is never copied to production.

## 1. Entry Gate

- Merge only after the user explicitly confirms staging testing passed. If the user asks only to inspect production,
  perform a read-only preflight and stop without merging.
- Run `git fetch origin main dev`. Require a clean worktree and require local `dev` to match `origin/dev`.
- Stop for uncommitted changes, untracked files, remote divergence, or a potential merge conflict.
- Review `origin/main...origin/dev`: commits, changed files, schema, migrations, API/business logic,
  and newly referenced `process.env.*` names. Never print secret values.
- Treat env files as purpose-specific rather than requiring identical contents:
  - `.env.local`: local interactive development and shared local values.
  - `.env.staging`: local staging Prisma/CLI commands only.
  - `.env.prod`: read-only local production validation only; never use it to deploy a migration.
  - `.env.local.example`: documented key inventory/template, not a runtime source of truth.
  - Vercel Preview and Production variables: authoritative values for cloud deployments.
- Require `.env.prod` for production schema validation. Check key names only and require `DATABASE_URL` and
  `DIRECT_URL`; never print their values. Confirm without logging values that they do not match the staging URLs.
- Run:

  ```powershell
  npm.cmd run lint
  npx.cmd tsc --noEmit
  npm.cmd run test
  npm.cmd run resources:check
  npx.cmd dotenv -e .env.prod -- prisma validate
  ```

  Any failure is **BLOCKED**.

## 2. Migration and Environment Gate

- List migrations present in `dev` but absent from `main`, then read each new `migration.sql`.
- If the Prisma schema changed without a matching migration, block the release.
- Allow only additive, backward-compatible migrations already tested on staging, such as new tables,
  safely nullable/defaulted columns, or indexes with no evident locking risk.
- Block migrations containing `DROP`, `TRUNCATE`, `DELETE`, enum removal or rename, table/column rename,
  `ALTER COLUMN ... TYPE`, `NOT NULL` without a backfill, a unique constraint over populated data,
  a data rewrite, or another material lock/data-loss risk. These require a separate migration plan and
  cannot be bypassed with a simple confirmation.
- If any new migration exists, ask the user to confirm that a production backup was checked in the
  Supabase Dashboard. Stop if the user cannot confirm it. Do not run production migrations locally.
- Require both `cancel-expired-orders` and `clean-sessions` Supabase cron jobs to be installed and
  smoke-tested against the production deployment. This gate is mandatory even when staging was
  explicitly allowed to run without those schedules.
- If the code introduces an application environment variable, require it in `.env.local.example` and list only
  its name. Require user confirmation that it is configured in both Vercel Preview and Production. Do not block
  merely because a shared application variable is intentionally absent from `.env.staging` or `.env.prod`.
- Never use `db push`, `migrate dev`, `migrate reset`, `migrate resolve`, or generated rollback SQL on production.
  Vercel Production alone runs `migrate deploy` from committed migration files.

## 3. Merge and Deploy

Continue only when every gate passes and the user explicitly requested production deployment.

```powershell
git switch main
git pull --ff-only origin main
git merge --no-ff origin/dev -m "chore: release dev to production"
git push origin main
git switch dev
```

- Never force-push.
- If the merge conflicts, do not resolve it automatically. Abort the merge to restore the clean pre-merge
  state, then report the conflict to the user.
- After the push, let Vercel Production deploy automatically. Do not run a local production migration.

## 4. Verification and Failure Handling

- If Vercel MCP is available, verify that the `main` deployment is READY and inspect recent runtime logs.
- If Vercel cannot be checked automatically, report `Cannot verify Vercel automatically` and ask the user
  to open the production link for a smoke test.
- If a production migration or deployment fails, do not roll back the database, generate `ROLLBACK_*.sql`,
  or run `migrate resolve`. Report the commit SHA, affected migration, and error. The user decides between
  a forward fix and restoring a verified backup.

## Final Report

Write the report in Vietnamese:

```text
=== PRODUCTION RELEASE REPORT ===
Staging test:        PASS / not confirmed
Code checks:         PASS / FAIL
Migration safety:    N/A / PASS / BLOCKED
Production backup:   N/A / user confirmed / not confirmed
Environment vars:    N/A / confirmed / not confirmed
Merge and push:      PASS / FAIL
Vercel verification: READY / Cannot verify / FAIL

VERDICT: RELEASED / BLOCKED — reason
```

## Hard Rules

- Never merge `main` when any gate fails or is blocked.
- Never reset production, copy staging data to production, or edit an applied migration.
- Never roll back the database automatically. A Vercel rollback rolls back code, not schema or data.
