---
name: push-to-dev
description: >
  Act as the QA/QC code reviewer for the complete release diff, then commit/push the dev branch
  for a Vercel staging deployment only after the review and verification gates pass. Use when the
  user explicitly asks to push or deploy dev, send code to staging, or invokes push-to-dev after
  coding. A request that only says "qa review" is review-only and must not push.
---

# Push to Dev (Staging Deployment)

> Solo-developer workflow: code directly on `dev` → QA passes → push `dev` → Vercel Preview
> deploys staging → friends test the staging link. Run this workflow only after an explicit user request.

## Default Role: QA/QC Code Reviewer

Invoking this skill always starts in reviewer mode, including when the user explicitly requests a
push. Treat the release diff as an implementation submitted for independent QA/QC review; a green
lint, type-check, or test suite is necessary evidence but is not sufficient approval to push.

Before commit or push, review the complete diff and trace every changed behavior through its relevant
callers, consumers, state transitions, persistence boundaries, and error paths. Determine whether the
implementation can introduce:

- regressions in existing user or staff flows;
- violations of order, voucher, pricing, points, API, schema, auth, or UI contracts;
- incorrect branching, stale state, invalid transitions, rounding errors, partial writes, races,
  double-spend, replay, or inconsistent customer/staff behavior;
- authorization bypass, IDOR, input-trust bugs, secret or PII exposure, unsafe file or external-service
  handling, resource exhaustion, or another realistically exploitable path;
- missing or weak regression tests, stale canonical resources, incompatible migrations, or consumers
  that were not updated with the implementation.

Use the changed behavior to select and read the relevant canonical resources and domain skills. Inspect
the surrounding code needed to validate the flow, not only the edited lines. Report findings with
severity, exact file and line, evidence, impact or exploitation path, and the smallest recommended
correction. Do not invent speculative findings without a concrete code path.

The reviewer is read-only: do not modify production code or tests, auto-fix findings, or expand the
release scope. Any unresolved correctness, business-rule, security, migration, or regression finding
blocks commit and push and must be returned to the implementer. Continue to the commit/push stage only
when this review has no blocking findings and every verification gate passes.

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

Perform the default-role code review above before interpreting automated checks as a PASS. Confirm that
the implementation matches its intended behavior, preserves existing invariants, updates all affected
consumers and canonical resources, and has proportional regression coverage. Automated checks do not
override an actionable manual-review finding.

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
- After every QA check passes, as the sole local-build exception, run `npx.cmd prisma generate; if ($LASTEXITCODE -eq 0) { npx.cmd dotenv -e .env.staging -- next build }` before staging files; it must not run migrations or load `.env.prod`.
- Treat failed checks, whitespace errors, secrets in the diff, unexplained API/schema changes, or business-rule risks as **BLOCKED**.
- Missing Supabase cron jobs on staging do not block a `dev` push when the release owner explicitly
  accepts that limitation. Record the limitation in the staging handoff; never infer that production
  is ready from a staging test that could not exercise scheduled lifecycle work.
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

Before staging files, committing, or pushing, tell the user clearly what this release changes. Base the
summary on the reviewed diff rather than commit messages or assumptions, and keep it understandable at
the behavior level. Include:

- the feature, fix, or workflow changed and the user/staff flows affected;
- the important implementation areas and files changed, grouped by purpose rather than dumped as a raw list;
- any API contract, schema/migration, environment, dependency, canonical resource, or test changes;
- the QA/QC verdict, verification results, known limitations, and remaining risks;
- the proposed commit message and the exact branch/remote that will receive the push.

Do not print secret values, connection strings, tokens, or sensitive customer data. If the reviewed diff
contains unrelated or unexplained changes, report them and block the push instead of hiding them in the
summary. In explicit push/deploy mode, this is a required pre-push briefing, not an additional approval
gate: continue automatically after presenting it when every gate is already PASS.

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

- Reconfirm the actual pushed change scope, report the pushed commit SHA, new migrations, the flows friends
  should test, and the Vercel Preview URL when accessible. Call out any difference from the pre-push briefing.
- If Vercel MCP is available, check that the `dev` deployment is READY and inspect recent runtime logs.
- If Vercel cannot be checked automatically, report `Cannot verify Vercel automatically`; never assume success.
- A clear user statement that friends tested staging successfully is sufficient to invoke `production-deploy`.

## Hard Rules

- Never merge or push `main`.
- Never run `db push`, automatically run `migrate reset`, or run any Prisma command against production.
- Never generate or execute automatic rollback SQL.
- Write QA reports in Vietnamese. In explicit push/deploy mode, automatically commit and push `dev` only after a full PASS.
