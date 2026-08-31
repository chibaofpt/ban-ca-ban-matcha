// @vitest-environment node

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadAttestation } from "../../scripts/staging-tests/attestation.mjs";

describe("Attestation staging — file local ngắn hạn", () => {
  it("từ chối symlink thay vì đọc chứng cứ ngoài run root", () => {
    const root = mkdtempSync(path.join(tmpdir(), "attestation-"));
    const outside = path.join(root, "outside.json");
    try {
      writeFileSync(outside, "{}");
      symlinkSync(outside, path.join(root, "attestation.json"));
      expect(() => loadAttestation(root)).toThrow("ATTESTATION_FILE_INVALID");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
