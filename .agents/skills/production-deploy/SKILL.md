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
- Run `rtk git fetch origin main dev`. Require a clean worktree and require local `dev` to match `origin/dev`.
- Stop for uncommitted changes, untracked files, remote divergence, or a potential merge conflict.
- Review `origin/main...origin/dev`: commits, changed files, schema, migrations, API/business logic,
  and newly referenced `process.env.*` names. Never print secret values.
- Treat env files as purpose-specific rather than requiring identical contents:
  - `.env.local`: local interactive development and shared local values.
  - `.env.staging`: local staging Prisma/CLI commands only.
  - `.env.prod`: read-only local production validation and backup access; never use it to deploy a migration.
  - `.env.local.example`: documented key inventory/template, not a runtime source of truth.
  - Vercel Preview and Production variables: authoritative values for cloud deployments.
- Require `.env.prod` for production schema validation. Check key names only and require `DATABASE_URL` and
  `DIRECT_URL`; never print their values. Confirm without logging values that they do not match the staging URLs.
- Run:

  ```powershell
  rtk npm run lint
  rtk proxy npx.cmd tsc --noEmit
  rtk npm run test
  rtk npm run resources:check
  rtk proxy npx.cmd dotenv -e .env.prod -- prisma validate
  ```

  Any failure is **BLOCKED**.

## 2. Migration and Environment Gate

- List migrations present in `dev` but absent from `main`, then read each new `migration.sql`.
  This Git diff is the review inventory, not proof of which migrations a database has applied.
- From the clean checkout of the exact reviewed `origin/dev` revision, inspect migration status
  read-only against both environments before merging:

  ```powershell
  rtk proxy npx.cmd dotenv -e .env.staging -- prisma migrate status
  rtk proxy npx.cmd dotenv -e .env.prod -- prisma migrate status
  ```

  Capture output privately and report only migration names/status; redact connection details.
  Compare the committed migration directories with each database's migration history. Staging must
  have the release migrations applied before its user acceptance can satisfy this gate. Production
  may have expected pending migrations: `migrate status` can exit nonzero for pending migrations,
  so classify the result rather than treating that exit code alone as a failure.
- Require the production pending set to match the reviewed, staging-tested release migrations.
  An empty set is valid for a code-only release. Block failed migrations, divergent/missing history,
  unexpected pending migrations, or unavailable status evidence until reconciled. Do not infer
  status from directory timestamps or deployment success alone. Review a newly added compatibility
  migration even when its directory sorts before migrations already recorded as applied.
- Keep every migration file after deployment and user acceptance. Prisma records applied migrations
  in `_prisma_migrations`; `migrate deploy` applies pending migrations, not the whole history on each
  release. Fresh/shadow replay still needs the complete ordered history. Never delete files to
  prevent reruns or edit an applied file to fix a replay failure.
- If the Prisma schema changed without a matching migration, block the release.
- Allow only additive, backward-compatible migrations already tested on staging, such as new tables,
  safely nullable/defaulted columns, or indexes with no evident locking risk.
- Block migrations containing `DROP`, `TRUNCATE`, `DELETE`, enum removal or rename, table/column rename,
  `ALTER COLUMN ... TYPE`, `NOT NULL` without a backfill, a unique constraint over populated data,
  a data rewrite, or another material lock/data-loss risk. These require a separate migration plan and
  cannot be bypassed with a simple confirmation.
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
rtk npm run backup:prod
rtk git switch main
rtk git pull --ff-only origin main
rtk git merge --no-ff origin/dev -m "chore: release dev to production"
rtk git push origin main
rtk git switch dev
```

- Require `PRODUCTION_BACKUP_OK` before merging; report its path and SHA256. If backup fails, stop without
  merging or changing any backup artifact. A backup never overrides another failed gate.
- Never force-push.
- If the merge conflicts, do not resolve it automatically. Abort the merge to restore the clean pre-merge
  state, then report the conflict to the user.
- After the push, let Vercel Production deploy automatically. Do not run a local production migration.

## 4. Verification and Failure Handling

- Use the available Vercel plugin/MCP to verify that the `main` deployment is READY and inspect its
  build/migration logs and recent runtime logs for the released commit.
- Re-run the read-only production `prisma migrate status` check from that released revision.
  Confirm every migration in the pre-release pending set is now applied, with no failed or pending
  release migration. If status cannot be verified, report release verification incomplete; do not
  declare `RELEASED` from Vercel READY alone.
- Record the user's production smoke-test result when supplied. Keep the complete migration history
  after that confirmation; no migration cleanup/delete step follows acceptance.
- If no suitable plugin/tool is available, report `Cannot verify Vercel automatically` and ask the user
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
Migration status:    pre-release pending names / post-release up to date / unverified
Production smoke:    user confirmed / awaiting user / FAIL
Production backup:   N/A / PASS — local path and SHA256 / FAIL
Environment vars:    N/A / confirmed / not confirmed
Merge and push:      PASS / FAIL
Vercel verification: READY / Cannot verify / FAIL

VERDICT: RELEASED / BLOCKED — reason
```

## Hard Rules

- Never merge `main` when any gate fails or is blocked.
- Backup is create-only: never restore, modify, move, rename, delete, or automatically use it after an error;
  stop, report the failure, and let the user decide.
- Never reset production, copy staging data to production, or edit/delete an applied migration.
- Never roll back the database automatically. A Vercel rollback rolls back code, not schema or data.
