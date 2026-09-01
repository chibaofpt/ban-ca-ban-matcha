#!/usr/bin/env node
import { attestStaging } from "./attest-control.mjs";
import { loadOperatorEnvironment } from "./operator.mjs";
import { createControlPlane } from "./vercel-control.mjs";
import { openReadDatabase } from "./database.mjs";

function deploymentArgument(argv) {
  const index = argv.indexOf("--deployment");
  if (index !== 0 || ![2, 4].includes(argv.length) || typeof argv[1] !== "string") throw new Error("ATTEST_DEPLOYMENT_ARGUMENT_REQUIRED");
  if (argv.length === 4 && argv[2] !== "--recover-run-id") throw new Error("ATTEST_RECOVERY_ARGUMENT_INVALID");
  return { deploymentId: argv[1], recoverRunId: argv[3] };
}

try {
  const { deploymentId, recoverRunId } = deploymentArgument(process.argv.slice(2));
  const env = loadOperatorEnvironment();
  const boundaries = createControlPlane();
  const result = await attestStaging({ deploymentId, recoverRunId, env, ...boundaries, openDatabase: openReadDatabase });
  console.log(JSON.stringify({ status: "PASS", deploymentId: result.evidence.deploymentId,
    deploymentSha: result.evidence.deploymentSha, expiresAt: result.evidence.expiresAt,
    provenanceMode: result.evidence.provenanceMode, deploymentSecretReadback: false }));
} catch (error) {
  const code = /^[A-Z0-9_]{1,80}$/.test(error?.message ?? "") ? error.message : "ATTEST_OPERATION_FAILED";
  console.error(code);
  process.exitCode = 1;
}
