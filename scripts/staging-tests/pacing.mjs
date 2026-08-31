import { prerequisite, invariant } from "./errors.mjs";

/**
 * @typedef {object} PacerOptions
 * @property {() => number} [now]
 * @property {(ms: number) => Promise<unknown>} [sleep]
 * @property {number} deadline
 * @property {(event: {code: string, remainingMs: number}) => void} [onWait]
 */

/** Reserve shared login/refresh capacity before raw HTTP dispatch.
 * @param {PacerOptions} options
 */
export function createAuthPacer({ now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  deadline, onWait = () => {} }) {
  let attempts = [];
  let queue = Promise.resolve();
  async function reserveSlot() {
    while (true) {
      attempts = attempts.filter(at => now() - at < 61_000);
      const readyAt = attempts.length >= 10 ? attempts[attempts.length - 10] + 61_000 : now();
      prerequisite(Number.isFinite(deadline) && Math.max(now(), readyAt) + 30_000 < deadline,
        "AUTH_TIME_BUDGET_INSUFFICIENT");
      if (now() >= readyAt) break;
      onWait({ code: "AUTH_RATE_WINDOW_WAIT", remainingMs: readyAt - now() });
      await sleep(Math.min(45_000, readyAt - now()));
    }
    attempts.push(now());
  }
  return { async reserve() {
    const current = queue.then(reserveSlot);
    queue = current.catch(() => {});
    return current;
  } };
}

/** Reserve shared staff counter-create capacity before raw HTTP dispatch.
 * @param {PacerOptions} options
 */
export function createStaffOrderPacer({ now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  deadline, onWait = () => {} }) {
  let attempts = [];
  let queue = Promise.resolve();
  async function reserveSlot() {
    while (true) {
      attempts = attempts.filter(at => now() - at < 61_000);
      const readyAt = attempts.length >= 30 ? attempts[attempts.length - 30] + 61_000 : now();
      prerequisite(Number.isFinite(deadline) && Math.max(now(), readyAt) + 30_000 < deadline,
        "STAFF_ORDER_TIME_BUDGET_INSUFFICIENT");
      if (now() >= readyAt) break;
      onWait({ code: "STAFF_ORDER_RATE_WINDOW_WAIT", remainingMs: readyAt - now() });
      await sleep(Math.min(45_000, readyAt - now()));
    }
    attempts.push(now());
  }
  return { async reserve() {
    const current = queue.then(reserveSlot);
    queue = current.catch(() => {});
    return current;
  } };
}

/** Reserve per-account voucher-exchange capacity before raw HTTP dispatch.
 * @param {PacerOptions} options
 */
export function createVoucherExchangePacer({ now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), deadline, onWait = () => {} }) {
  const attempts = new Map();
  const queues = new Map();
  async function reserveSlot(userId) {
    invariant(userId, "VOUCHER_EXCHANGE_RESERVATION_INVALID");
    let recent;
    while (true) {
      recent = (attempts.get(userId) ?? []).filter(at => now() - at < 61_000);
      const readyAt = recent.length >= 5 ? recent[recent.length - 5] + 61_000 : now();
      prerequisite(Number.isFinite(deadline) && Math.max(now(), readyAt) + 30_000 < deadline,
        "VOUCHER_EXCHANGE_TIME_BUDGET_INSUFFICIENT");
      if (now() >= readyAt) break;
      onWait({ code: "VOUCHER_EXCHANGE_RATE_WINDOW_WAIT", remainingMs: readyAt - now() });
      await sleep(Math.min(45_000, readyAt - now()));
    }
    attempts.set(userId, [...recent, now()]);
  }
  return { async reserve(userId) {
    const queue = queues.get(userId) ?? Promise.resolve();
    const current = queue.then(() => reserveSlot(userId));
    queues.set(userId, current.catch(() => {}));
    return current;
  } };
}

/** Reserve order-attempt capacity before a journey; failed requests also consume local slots. */
export function createOrderPacer({ now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), deadline, onWait = () => {}, initialAttempts = {} }) {
  const attempts = new Map(Object.entries(initialAttempts).map(([id, times]) => [id, times.map(at => ({ at }))]));
  let queue = Promise.resolve();
  const windowMs = 600_000;
  async function reserveSlots(userId, count, minRemainingMs) {
    invariant(userId && Number.isInteger(count) && count >= 1 && count <= 5, "ORDER_RESERVATION_INVALID");
    let recent;
    while (true) {
      recent = (attempts.get(userId) ?? []).filter(entry => now() - entry.at <= windowMs).sort((a, b) => a.at - b.at);
      const readyAt = recent.length + count > 5 ? recent[recent.length + count - 6].at + windowMs + 1_000 : now();
      prerequisite(Math.max(now(), readyAt) + minRemainingMs < deadline, "RUN_TIME_BUDGET_INSUFFICIENT");
      if (now() >= readyAt) break;
      const pause = Math.min(45_000, readyAt - now());
      onWait({ code: "ORDER_RATE_WINDOW_WAIT", remainingMs: readyAt - now() });
      await sleep(pause);
    }
    const booked = Array.from({ length: count }, () => ({ at: now() }));
    attempts.set(userId, [...recent, ...booked]);
    return { markDispatched() { for (const entry of booked) entry.at = now(); } };
  }
  return {
    async reserve(userId, count = 1, minRemainingMs = 30_000) {
      const current = queue.then(() => reserveSlots(userId, count, minRemainingMs));
      queue = current.catch(() => {});
      return current;
    },
  };
}
