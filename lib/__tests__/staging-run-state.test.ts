// @vitest-environment node

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createRunState, loadRunState } from "../../scripts/staging-tests/run-state.mjs";

describe("Staging run state — recovery manifest append-only", () => {
  it("khôi phục exact markers, vouchers và sessions mà không lưu credential", () => {
    const runDir = mkdtempSync(path.join(tmpdir(), "bcbm-state-"));
    try {
      const state = createRunState({ fs, runDir, initial: {
        actorIds: { customerA: "user" }, baselines: { customerA: {} }, catalogFingerprint: "catalog",
      } });
      state.addMarker("[STAGING:run_12345678:plain]");
      state.addVoucher("voucher-internal");
      state.addSession("customerA", "session-id");
      const restored = loadRunState({ fs, runDir });
      expect(restored).toMatchObject({
        markers: ["[STAGING:run_12345678:plain]"], voucherIds: ["voucher-internal"],
        runSessionIds: { customerA: ["session-id"] },
      });
      expect(fs.readFileSync(path.join(runDir, "state.ndjson"), "utf8")).not.toMatch(/password|refresh_token|cookie/i);
    } finally { rmSync(runDir, { recursive: true, force: true }); }
  });
});
