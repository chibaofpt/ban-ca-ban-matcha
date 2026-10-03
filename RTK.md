# Shell output policy

Use `rtk` for shell commands it supports, for example `rtk git status`, `rtk rg`,
`rtk npm run resources:check`. For other commands use `rtk proxy <executable> <args>`.
PowerShell cmdlets need a PowerShell executable behind the proxy; read project text as UTF-8.

Use filtered output unless truncation hides evidence needed for the task; then request the
specific raw output with `rtk proxy`. Never treat omitted lines as a complete audit.

If RTK is unavailable or cannot run a command, state the limitation and use that command directly;
do not install tooling or expand the task just to satisfy the wrapper. Tool APIs such as patching
are not shell commands. RTK does not change permissions or authorize builds, tests or migrations.

Use `rtk gain` only for a requested RTK usage audit. Document size comparisons do not require it.
