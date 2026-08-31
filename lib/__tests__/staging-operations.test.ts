// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { mutateOnce } from "../../scripts/staging-tests/operations.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";
import { createOrderPacer } from "../../scripts/staging-tests/pacing.mjs";

describe("Mutation staging — journal và recovery", () => {
  it("rate window tính từ lúc dispatch thật sau refresh, không chỉ lúc đặt chỗ", async () => {
    let time = 0;
    const pacer = createOrderPacer({ now: () => time, deadline: 3_600_000, sleep: async (ms: number) => { time += ms; } });
    const reservation = await pacer.reserve("customer", 5);
    time = 30_000;
    reservation?.markDispatched?.();
    await pacer.reserve("customer", 1);
    expect(time).toBeGreaterThanOrEqual(630_000);
  });
  it("lượt tạo thứ sáu chờ hết 10 phút, không spam hoặc bỏ qua rate-limit", async () => {
    let time = 0;
    const pauses: number[] = [];
    const pacer = createOrderPacer({ now: () => time, deadline: 3_600_000,
      sleep: async (ms: number) => { pauses.push(ms); time += ms; },
    });
    await pacer.reserve("customer", 5);
    await pacer.reserve("customer", 1);
    expect(time).toBeGreaterThanOrEqual(600_000);
    expect(pauses.every(ms => ms <= 45_000)).toBe(true);
  });
  it("ghi intent trước dispatch và không retry khi timeout", async () => {
    const calls: string[] = [];
    const journal = {
      recordIntent: () => calls.push("intent"),
      recordOutcome: (_type: string, _id: string, state: string) => calls.push(state),
    };
    const send = vi.fn().mockImplementation(() => { calls.push("send"); throw new AmbiguousMutation(); });
    await expect(mutateOnce({ journal, type: "create", recovery: {}, send,
      reconcile: async () => { calls.push("reconcile"); return "AMBIGUOUS"; } })).rejects.toThrow("MUTATION_OUTCOME_AMBIGUOUS");
    expect(calls).toEqual(["intent", "send", "reconcile", "AMBIGUOUS"]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
