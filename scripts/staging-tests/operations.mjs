import { randomUUID } from "node:crypto";
import { AmbiguousMutation } from "./http.mjs";
import { TestFailure, invariant } from "./errors.mjs";

export const operationId = () => `op_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

/** Dispatch one journaled mutation once, then reconcile instead of retrying uncertainty. */
export async function mutateOnce({ journal, type, recovery, send, reconcile, isKnownNotApplied = () => false }) {
  const id = operationId();
  journal.recordIntent(type, id, recovery);
  let response;
  try { response = await send(); }
  catch (error) {
    if (!(error instanceof AmbiguousMutation)) {
      journal.recordOutcome(type, id, "NOT_APPLIED", { code: "CLIENT_REJECTED" });
      throw error;
    }
  }
  if (response?.ok) {
    journal.recordOutcome(type, id, "APPLIED", { httpStatus: response.status });
    return response;
  }
  if (response && isKnownNotApplied(response)) {
    journal.recordOutcome(type, id, "NOT_APPLIED", { httpStatus: response.status, code: response.body?.code });
    return response;
  }
  let reconciliation = { state: "AMBIGUOUS" };
  if (reconcile) {
    try {
      const value = await reconcile(response);
      reconciliation = typeof value === "string" ? { state: value } : value;
    } catch { reconciliation = { state: "AMBIGUOUS" }; }
  }
  const state = reconciliation.state;
  invariant(["APPLIED", "NOT_APPLIED", "AMBIGUOUS"].includes(state), "INVALID_RECONCILIATION_STATE");
  journal.recordOutcome(type, id, state, { httpStatus: response?.status ?? null, code: response?.body?.code ?? null });
  if (state === "APPLIED") return response ?? reconciliation.response ?? { ok: true, status: 200, body: { data: reconciliation.data }, recovered: true };
  if (state === "NOT_APPLIED" && response) return response;
  throw new TestFailure("MUTATION_OUTCOME_AMBIGUOUS");
}
