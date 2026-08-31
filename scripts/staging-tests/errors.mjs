/** A report-safe failure: messages must never contain raw API payloads or credentials. */
export class TestFailure extends Error {
  constructor(code, message = code) { super(message); this.code = code; this.status = "FAIL"; }
}

/** Missing live data is a coverage gap, not evidence that behavior passed. */
export class PrerequisiteMissing extends Error {
  constructor(code, message = code) { super(message); this.code = code; this.status = "PARTIAL"; }
}

/** Assert an independently specified result without printing private values. */
export function invariant(condition, code, message = code) {
  if (!condition) throw new TestFailure(code, message);
}

/** Require a real staging capability instead of creating fixtures to supply it. */
export function prerequisite(condition, code, message = code) {
  if (!condition) throw new PrerequisiteMissing(code, message);
}

/** Convert a closed local write gate into a non-transport failure while preserving its authoritative cause. */
export function assertWriteGate(assertWriteAllowed) {
  try { assertWriteAllowed(); }
  catch (cause) {
    const error = new TestFailure(cause?.code ?? "WRITE_GATE_CLOSED");
    error.name = "WriteGateClosed";
    error.cause = cause;
    throw error;
  }
}
