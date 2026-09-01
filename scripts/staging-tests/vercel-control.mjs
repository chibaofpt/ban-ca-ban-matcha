import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { readVerifiedFile } from "./operator.mjs";

function failure(code) { throw new Error(code); }

function command(executable, args, input, spawn, cwd) {
  const result = spawn(executable, args, { cwd, input, encoding: "utf8", windowsHide: true,
    timeout: 45_000, maxBuffer: 6 * 1024 * 1024, shell: false });
  if (result.error || result.status !== 0) failure("VERCEL_CONTROL_COMMAND_FAILED");
  return result.stdout;
}

/** Resolve an installed npm JavaScript entrypoint without invoking a command shell. */
export function resolveNpmCli({ execPath = process.execPath, source = process.env, fsImpl = fs } = {}) {
  const candidates = [source.npm_execpath, path.join(path.dirname(execPath), "node_modules/npm/bin/npm-cli.js")];
  for (const candidate of candidates) {
    if (!candidate || !path.isAbsolute(candidate) || path.basename(candidate) !== "npm-cli.js") continue;
    try {
      if (fsImpl.statSync(candidate).isFile()) return candidate;
    } catch { /* Try the next installed runtime location. */ }
  }
  failure("VERCEL_CONTROL_NPM_INSTALL_REQUIRED");
}

function parseJson(value) {
  try { return JSON.parse(value); }
  catch { failure("VERCEL_CONTROL_RESPONSE_INVALID"); }
}

function createdRow(response) {
  if (!response || !Array.isArray(response.created) || response.created.length !== 1
    || !Array.isArray(response.failed) || response.failed.length !== 0) {
    failure("VERCEL_CONTROL_CREATE_RESPONSE_INVALID");
  }
  return response.created[0];
}

/** Create portable authenticated Vercel and Git boundaries for staging configuration. */
export function createControlPlane({ cwd = process.cwd(), spawn = spawnSync,
  execPath = process.execPath, source = process.env, fsImpl = fs } = {}) {
  const invoke = (args, body) => command(execPath,
    [resolveNpmCli({ execPath, source, fsImpl }), "exec", "--yes", "--package=vercel@59.10.0", "--", "vercel", ...args],
    body === undefined ? undefined : JSON.stringify(body), spawn, cwd);
  const api = (endpoint, method = "GET", body) => parseJson(invoke(["api", endpoint, "--raw", "--method", method,
    ...(body === undefined ? [] : ["--input", "-"])], body));
  const linkage = () => {
    const file = path.join(cwd, ".vercel", "project.json");
    const linked = parseJson(readVerifiedFile(file));
    if (typeof linked.projectId !== "string" || typeof linked.orgId !== "string") failure("VERCEL_LINKAGE_INVALID");
    return { projectId: linked.projectId, teamId: linked.orgId };
  };
  return {
    git: {
      async currentBranch() {
        return command("git", ["-c", `safe.directory=${cwd.replaceAll("\\", "/")}`,
          "branch", "--show-current"], undefined, spawn, cwd).trim();
      },
      async head() { return command("git", ["rev-parse", "HEAD"], undefined, spawn, cwd).trim(); },
      async status() { return command("git", ["status", "--porcelain", "--untracked-files=all"], undefined, spawn, cwd); },
      async pushBlob() { return command("git", ["rev-parse", "HEAD:lib/push.ts"], undefined, spawn, cwd).trim(); },
      async trackedFile(file) { return command("git", ["show", `HEAD:${file}`], undefined, spawn, cwd); },
    },
    vercel: {
      async linkage() { return linkage(); },
      async project({ projectId, teamId }) { return api(`/v9/projects/${projectId}?teamId=${teamId}`); },
      async inventory({ projectId, teamId }) {
        return api(`/v10/projects/${projectId}/env?teamId=${teamId}&target=preview`);
      },
      async deployment({ deploymentId, teamId }) {
        return api(`/v13/deployments/${deploymentId}?teamId=${teamId}`);
      },
      async deployments({ projectId, teamId, branch, sha }) {
        const query = new URLSearchParams({ projectId, teamId, target: "preview", branch, sha });
        return api(`/v6/deployments?${query}`);
      },
      async readableConfig({ projectId, teamId, branch }) {
        const response = api(`/v3/env/pull/${projectId}/preview/${encodeURIComponent(branch)}?teamId=${teamId}&source=env-pull`);
        const inventory = api(`/v10/projects/${projectId}/env?teamId=${teamId}&target=preview`);
        return { values: response.env, rows: inventory.envs, pagination: inventory.pagination };
      },
      async upsertSensitive({ projectId, teamId, branch, key, value, existingId }) {
        const body = { key, value, type: "sensitive", target: ["preview"], gitBranch: branch,
          customEnvironmentIds: [] };
        if (existingId) {
          command(execPath, [resolveNpmCli({ execPath, source, fsImpl }), "exec", "--yes",
            "--package=vercel@59.10.0", "--", "vercel", "env", "update", key, "preview", branch,
            "--sensitive", "--yes"], value, spawn, cwd);
          const inventory = await this.inventory({ projectId, teamId });
          if (!Array.isArray(inventory?.envs) || inventory.pagination?.next) failure("VERCEL_CONTROL_UPDATED_ENV_INVALID");
          const candidates = inventory.envs.filter(row => row.key === key && row.gitBranch === branch);
          if (candidates.length !== 1) failure("VERCEL_CONTROL_UPDATED_ENV_INVALID");
          const updated = candidates[0];
          const customEnvironmentIds = Object.hasOwn(updated, "customEnvironmentIds")
            ? updated.customEnvironmentIds : [];
          if (updated.id !== existingId || updated.type !== "sensitive" || !Array.isArray(updated.target)
            || updated.target.length !== 1 || updated.target[0] !== "preview"
            || !Array.isArray(customEnvironmentIds) || customEnvironmentIds.length !== 0) {
            failure("VERCEL_CONTROL_UPDATED_ENV_INVALID");
          }
          return { ...updated, customEnvironmentIds };
        }
        return createdRow(api(`/v10/projects/${projectId}/env?teamId=${teamId}`, "POST", [body]));
      },
    },
  };
}
