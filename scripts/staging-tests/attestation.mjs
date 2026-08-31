import fs from "node:fs";
import path from "node:path";
import { TestFailure, invariant } from "./errors.mjs";

export const ATTESTATION_NAME = "attestation.json";

/** Load the short-lived control-plane proof stored under the ignored run root. */
export function loadAttestation(runRoot) {
  const root = path.resolve(runRoot);
  const file = path.resolve(root, ATTESTATION_NAME);
  invariant(path.dirname(file) === root, "ATTESTATION_PATH_INVALID");
  if (!fs.existsSync(file)) throw new TestFailure("CONTROL_PLANE_ATTESTATION_MISSING");
  const stat = fs.lstatSync(file);
  invariant(stat.isFile() && !stat.isSymbolicLink(), "ATTESTATION_FILE_INVALID");
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new TestFailure("CONTROL_PLANE_ATTESTATION_INVALID"); }
}
