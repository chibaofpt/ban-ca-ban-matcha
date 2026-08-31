#!/usr/bin/env node
import { attestStaging } from "./attest-control.mjs";
import { loadOperatorEnvironment } from "./operator.mjs";
import { createControlPlane } from "./vercel-control.mjs";
import { openReadDatabase } from "./database.mjs";

function deploymentArgument(argv) {
  const index = argv.indexOf("--deployment");
  if (index !== 0 || argv.length !== 2 || typeof argv[1] !== "string") throw new Error("ATTEST_DEPLOYMENT_ARGUMENT_REQUIRED");
  return argv[1];
}

try {
  const deploymentId = deploymentArgument(process.argv.slice(2));
  const env = loadOperatorEnvironment();
  const boundaries = createControlPlane();
  const result = await attestStaging({ deploymentId, env, ...boundaries, openDatabase: openReadDatabase });
  console.log(JSON.stringify({ status: "PASS", deploymentId: result.evidence.deploymentId,
    deploymentSha: result.evidence.deploymentSha, expiresAt: result.evidence.expiresAt,
    provenanceMode: result.evidence.provenanceMode, deploymentSecretReadback: false }));
} catch (error) {
  const code = /^[A-Z0-9_]{1,80}$/.test(error?.message ?? "") ? error.message : "ATTEST_OPERATION_FAILED";
  console.error(code);
  process.exitCode = 1;
}
