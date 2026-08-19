---
name: push-to-dev
description: >
  QA/QC completed code and commit/push the dev branch for a Vercel staging deployment.
  Use when the user explicitly asks to push or deploy dev, send code to staging, or invokes
  push-to-dev after coding. A request that only says "qa review" is review-only and must not push.
---

# Push to Dev (Staging Deployment)

> Solo-developer workflow: code directly on `dev` → QA passes → push `dev` → Vercel Preview
> deploys staging → friends test the staging link. Run this workflow only after an explicit user request.

## 1. Determine Mode and Release Scope

- If the user asks only for `qa review`, review and report, then stop. Do not commit or push.
- If the user explicitly asks to push or deploy `dev`, automatically commit and push after every gate passes.
- Work only on the `dev` branch. Do not switch branches, force-push, rebase, merge `main`, or resolve conflicts.
- Run `git fetch origin dev`, inspect `git status --short`, and compare local changes with `origin/dev`.
- Stop if local `dev` is behind `origin/dev`, if the current branch is not `dev`, or if the remote state would make the push non-fast-forward.
- Review staged, unstaged, and untracked files. Never automatically stage unreviewed untracked files, especially
  env files, scratch files, backups, or `ROLLBACK_*.sql` files. A new migration may be staged only after its SQL is reviewed.

## 2. Select and Validate the Staging Environment

- Treat the env files as purpose-specific; do not require them to contain identical keys:
  - `.env.local`: local interactive development and shared local values.
  - `.env.staging`: local Prisma/CLI commands that target the staging database.
  - `.env.prod`: production-only local checks; never load it in this skill.
  - `.env.local.example`: documented key inventory/template, never a runtime source of truth.
  - Vercel Preview variables: authoritative values for the deployed `dev` branch.
- Require `.env.staging` before any Prisma command. Check key names only and require both `DATABASE_URL` and
  `DIRECT_URL`; never print or include their values in a report.
- Confirm without logging values that staging and production database URLs are not identical. Block if the
  target cannot be distinguished safely.
- Never rely on Prisma's implicit `.env` lookup. Prefix direct Prisma checks with
  `npx.cmd dotenv -e .env.staging --`, or use an npm script that already loads `.env.staging`.
- Do not require shared application variables to exist in `.env.staging`; verify newly introduced application
  variables against `.env.local.example` and the Vercel Preview configuration instead.

## 3. QA/QC Gate

Read `AGENTS.md` and inspect the complete release diff. Apply any relevant order, voucher, pricing, API, and schema rules.

Run only checks that do not modify a database:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test
npm.cmd run resources:check
npx.cmd dotenv -e .env.staging -- prisma validate
git diff --check
```

- Do not run `npm run build`, `npm run build:staging`, `db push`, `migrate reset`, or any production migration during QA.
- Treat failed checks, whitespace errors, secrets in the diff, unexplained API/schema changes, or business-rule risks as **BLOCKED**.
- Report all QA findings in Vietnamese and stop when blocked. QA/push does not modify production
  code, auto-fix lint or expand scope; return failures to the implementer.

## 4. Schema Changes on Staging

Run this section only when `prisma/schema.prisma` changed.

1. Check whether a matching new directory exists under `prisma/migrations/`.
2. If no migration exists, create one for review only on staging:

   ```powershell
   npm.cmd run migrate:dev -- --create-only --name "descriptive_change_name"
   ```

   The `migrate:dev` script is authoritative here because it explicitly loads `.env.staging`. Do not replace it
   with a bare `prisma migrate dev` command.

3. If Prisma detects drift or requests a reset, stop and ask exactly:
   `Reset the staging database and lose all test data?`
   Never reset until the user gives a new, explicit confirmation. Until a seed exists, state that test data must be recreated manually.
4. Review the new SQL migration. Block changes involving `DROP`, `TRUNCATE`, `DELETE`, enum removal or rename,
   table/column rename, `ALTER COLUMN ... TYPE`, data rewrites, or any unapproved data-loss risk.
5. Commit the reviewed migration together with `prisma/schema.prisma` and the code. Never edit an already committed or applied migration.

After the `dev` push, Vercel Preview runs `prisma migrate deploy` against staging. Do not manually run a staging deploy migration in this skill.

## 5. Commit and Push Dev

Continue only when every QA gate passes.

1. Stage only reviewed release files:

   ```powershell
   git add -- <reviewed-file-1> <reviewed-file-2>
   git diff --cached --check
   git diff --cached
   ```

2. Create one concise commit message that describes the actual change. Do not amend an existing commit.
3. Push normally:

   ```powershell
   git push origin dev
   ```

Never use `git add .`, `git push --force`, or push another branch.

## 6. Staging Handoff

- Report the pushed commit SHA, new migrations, the flows friends should test, and the Vercel Preview URL when accessible.
- If Vercel MCP is available, check that the `dev` deployment is READY and inspect recent runtime logs.
- If Vercel cannot be checked automatically, report `Cannot verify Vercel automatically`; never assume success.
- A clear user statement that friends tested staging successfully is sufficient to invoke `production-deploy`.

## Hard Rules

- Never merge or push `main`.
- Never run `db push`, automatically run `migrate reset`, or run any Prisma command against production.
- Never generate or execute automatic rollback SQL.
- Write QA reports in Vietnamese. In explicit push/deploy mode, automatically commit and push `dev` only after a full PASS.
