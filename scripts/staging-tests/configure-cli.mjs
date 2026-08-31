#!/usr/bin/env node
import { configureStagingDatabase } from "./configure.mjs";
import { loadOperatorEnvironment } from "./operator.mjs";
import { createControlPlane } from "./vercel-control.mjs";

function branchArgument(argv) {
  const index = argv.indexOf("--branch");
  if (index < 0 || index !== argv.lastIndexOf("--branch") || typeof argv[index + 1] !== "string"
    || argv.length !== 2) throw new Error("CONFIGURE_BRANCH_ARGUMENT_REQUIRED");
  return argv[index + 1];
}

try {
  const branch = branchArgument(process.argv.slice(2));
  const env = loadOperatorEnvironment();
  const boundaries = createControlPlane();
  const result = await configureStagingDatabase({ branch, env, ...boundaries });
  console.log(JSON.stringify({ status: result.status, branch, attestationGranted: false,
    deploymentCreated: false, deploymentSecretReadback: false }));
} catch (error) {
  const code = /^[A-Z0-9_]{1,80}$/.test(error?.message ?? "") ? error.message : "CONFIGURE_OPERATION_FAILED";
  console.error(code);
  process.exitCode = 1;
}
