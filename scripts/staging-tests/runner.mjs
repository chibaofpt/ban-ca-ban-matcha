import fs from "node:fs";
import { preflight } from "./preflight.mjs";
import { combineStatus } from "./core.mjs";
import { buildExecutionPlan } from "./planner.mjs";
import { createJournal } from "./journal.mjs";
import { credentials, loginActor, logoutActor } from "./actors.mjs";
import { actorBaseline, reconcileRun } from "./reconciliation.mjs";
import { createRunState, loadRunState } from "./run-state.mjs";
import { runSmokeJourney } from "./journeys/smoke.mjs";
import { runFullJourney } from "./journeys/full.mjs";
import { runOnlineLifecycle } from "./journeys/lifecycle.mjs";
import { runCounterJourneys } from "./journeys/counter.mjs";
import { runPaymentExpiry } from "./journeys/expiry.mjs";
import { runDeliveryJourney } from "./journeys/delivery.mjs";
import { runVoucherConcurrency } from "./journeys/concurrency.mjs";
import { runVoucherAuthorization } from "./journeys/authorization.mjs";
import { runAdminCancelVoucherReuse } from "./journeys/admin-cancel.mjs";
import { runLifecycleConcurrency } from "./journeys/lifecycle-concurrency.mjs";
import { runExchangeConcurrency } from "./journeys/exchange-concurrency.mjs";
import { runBundleJourney } from "./journeys/bundle.mjs";
import { runFinalVoucherLifecycle } from "./journeys/final-voucher.mjs";
import { runVoucherEligibilityJourney } from "./journeys/eligibility.mjs";
import { runFinalFreeshipLifecycle } from "./journeys/final-freeship.mjs";
import { runFreeshipEligibilityJourney } from "./journeys/freeship-eligibility.mjs";
import { runFinalItemVoucherLifecycles } from "./journeys/final-item-vouchers.mjs";
import { runFinalBundleLifecycle } from "./journeys/final-bundle.mjs";
import { createAuthPacer, createOrderPacer, createStaffOrderPacer,
  createVoucherExchangePacer } from "./pacing.mjs";
import { prepareLongRunningActor } from "./session-renewal.mjs";
import { PrerequisiteMissing, TestFailure, invariant, prerequisite } from "./errors.mjs";

const ENV_NAMES = [
  "NEXT_PUBLIC_APP_ENV", "VERCEL_ENV", "TEST_BASE_URL", "PRODUCTION_BASE_URL",
  "TEST_STAGING_SUPABASE_REF", "NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "DIRECT_URL",
  "TEST_DEPLOYMENT_ID", "TEST_DEPLOYMENT_SHA", "TEST_CUSTOMER_A_PHONE", "TEST_CUSTOMER_A_PASSWORD",
  "TEST_CUSTOMER_B_PHONE", "TEST_CUSTOMER_B_PASSWORD", "TEST_ADMIN_PHONE", "TEST_ADMIN_PASSWORD",
  "TEST_STAFF_PHONE", "TEST_STAFF_PASSWORD", "TEST_MAX_RUNTIME_MINUTES",
];
const ACTOR_SLOT_RELEASE = Symbol("actorSlotRelease");

/** Conservative fully provisioned create-attempt ceiling after price batching. */
export const FULL_PROFILE_CREATE_ATTEMPTS = Object.freeze({
  customerAExpiry: 1,
  customerB: Object.freeze({ full: 16, voucherConcurrency: 2, adminCancel: 2, delivery: 3,
    onlineLifecycle: 1, lifecycleConcurrency: 2, counter: 0, bundle: 2, eligibility: 4,
    finalVoucher: 1, finalItemVouchers: 3, finalBundle: 1, finalFreeship: 1, freeshipEligibility: 1 }),
});

const PENDING_FULL_CASES = [];

const IMPLEMENTED_FULL_CASES = new Set([
  "plain-pickup-cancel", "menu-price-matrix", "price-changed", "online-lifecycle", "cancel-reuse",
  "counter-cash", "counter-transfer", "authorization", "payment-expiry", "concurrency", "points-reversal", "voucher-matrix",
]);

const PARTIAL_FULL_CASES = {};

function implementationAwarePlan(plan) {
  const cases = plan.cases.map(item => {
    const dataReady = item.runnable;
    if (IMPLEMENTED_FULL_CASES.has(item.id)) {
      return { ...item, dataReady, implementationStatus: "IMPLEMENTED", runnable: dataReady };
    }
    const missingCoverage = PARTIAL_FULL_CASES[item.id];
    if (missingCoverage) {
      return { ...item, dataReady, implementationStatus: "PARTIAL", missingCoverage, runnable: false };
    }
    return { ...item, dataReady, implementationStatus: "NOT_IMPLEMENTED", runnable: false };
  });
  const dataReadyCases = cases.filter(item => item.dataReady).map(item => item.id);
  const implementedCases = cases.filter(item => item.implementationStatus === "IMPLEMENTED").map(item => item.id);
  const executableCases = cases.filter(item => item.runnable).map(item => item.id);
  return { ...plan, cases, summary: { ...plan.summary, dataReadyCases, implementedCases,
    pendingImplementationCases: [...PENDING_FULL_CASES], executableCases, runnableCases: executableCases } };
}

function conservativeSchedule(env, customer) {
  const runtimeLimitMinutes = Number(env.TEST_MAX_RUNTIME_MINUTES || 60);
  invariant(Number.isInteger(runtimeLimitMinutes) && runtimeLimitMinutes > 0 && runtimeLimitMinutes <= 60,
    "RUN_TIME_BUDGET_INVALID");
  const customerBCreateAttemptCeiling = Object.values(FULL_PROFILE_CREATE_ATTEMPTS.customerB)
    .reduce((total, count) => total + count, 0);
  const initialAttempts = Math.min(5, customer?.recentOrderCount ?? 0);
  const earliestLastCustomerBCreateMs = Math.floor((initialAttempts + customerBCreateAttemptCeiling - 1) / 5) * 601_000;
  return { customerBCreateAttemptCeiling, earliestLastCustomerBCreateMs, runtimeLimitMinutes,
    rateWindowFitsWithCleanupReserve: earliestLastCustomerBCreateMs + 60_000 <= runtimeLimitMinutes * 60_000,
    cleanupReserveMs: 60_000, includesHttpLatency: false };
}

async function executeJourney(journey, context) {
  try { return await journey(context); }
  catch (error) {
    // Missing data must not bypass final reconciliation. Other errors stop writes.
    if (!(error instanceof PrerequisiteMissing)) throw error;
    return { status: "PARTIAL", code: error.code, cases: [] };
  }
}

/** Copy only supported configuration. @param {Record<string, string | undefined>} source */
export function runnerEnvironment(source = process.env) {
  return Object.fromEntries(ENV_NAMES.map(name => [name, source[name]]));
}

/** Execute the full profile without treating incomplete required coverage as PASS. */
export async function executeFull({ runRoot, runId, env, attestation, fetchImpl = fetch, openDatabase,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onWait = () => {} }) {
  const minutes = Number(env.TEST_MAX_RUNTIME_MINUTES || 60);
  invariant(Number.isInteger(minutes) && minutes > 0 && minutes <= 60, "RUN_TIME_BUDGET_INVALID");
  const deadline = now() + minutes * 60_000;
  const context = await preflight({ env, attestation, profile: "full", requirePushSandbox: true, fetchImpl, openDatabase });
  let expiryTask;
  let fatalWriteError;
  try {
    prerequisite(!context.plan.blockers.length, context.plan.blockers[0] ?? "FULL_PREFLIGHT_BLOCKED");
    const customer = context.actors.customerB;
    prerequisite(customer?.user, "FULL_CUSTOMER_ACCOUNT_INVALID");
    fs.mkdirSync(runRoot, { recursive: true });
    const journal = createJournal({ fs, rootDir: runRoot, runId, now: () => new Date(now()) });
    const participants = Object.entries(context.actors).filter(([, state]) => state?.user);
    // Journey baselines include earlier run mutations; the global audit baseline never changes.
    const freshActorStates = async () => Object.fromEntries(await Promise.all(
      Object.entries(context.actors).map(async ([name, state]) => [name, state?.user
        ? { ...state, ...await context.db.actorState(state.user.id) } : state])));
    const actorIds = Object.fromEntries(participants.map(([name, state]) => [name, state.user.id]));
    const runState = createRunState({ fs, runDir: journal.runDir, initial: {
      profile: "full", actorIds, baselines: Object.fromEntries(participants.map(([name, state]) => [name, actorBaseline(state)])),
      catalogFingerprint: context.catalog.fingerprint,
      target: { origin: new URL(env.TEST_BASE_URL).origin, supabaseRef: env.TEST_STAGING_SUPABASE_REF, deploymentId: env.TEST_DEPLOYMENT_ID },
    } });
    // Initial rows do not expose rejected attempts. Reserve their entire current window conservatively.
    const initialAttempts = Object.fromEntries(participants.map(([, state]) => [state.user.id,
      Array.from({ length: Math.min(5, state.recentOrderCount ?? 0) }, () => now())]));
    const pacerOptions = { now, sleep, deadline, onWait, initialAttempts };
    const pacer = createOrderPacer(pacerOptions);
    const dispatchPacer = createOrderPacer(pacerOptions);
    const authPacer = createAuthPacer({ now, sleep, deadline, onWait });
    const staffOrderPacer = createStaffOrderPacer({ now, sleep, deadline, onWait });
    const voucherExchangePacer = createVoucherExchangePacer({ now, sleep, deadline, onWait });
    const beforeDispatch = async ({ method, pathname }) => {
      if (method === "POST" && ["/api/auth/login", "/api/auth/refresh"].includes(pathname)) await authPacer.reserve();
    };
    const activeActorSlots = new Map();
    const acquireActorSlot = async name => {
      while (activeActorSlots.has(name)) await activeActorSlots.get(name);
      let release;
      const held = new Promise(resolve => { release = resolve; });
      activeActorSlots.set(name, held);
      return () => { if (activeActorSlots.get(name) === held) activeActorSlots.delete(name); release(); };
    };
    const actorLifecycle = {
      async login(options) {
        if (fatalWriteError) throw fatalWriteError;
        const release = await acquireActorSlot(options.name);
        try {
          if (fatalWriteError) throw fatalWriteError;
          const assertWriteAllowed = () => { if (fatalWriteError) throw fatalWriteError; };
          const actor = await loginActor({ ...options, assertWriteAllowed, beforeDispatch: async request => {
            await beforeDispatch(request);
            if (options.name === "staff" && request.method === "POST" && request.pathname === "/api/staff/orders") {
              await staffOrderPacer.reserve();
            }
            if (request.method === "POST" && request.pathname === "/api/profile/vouchers/exchange") {
              await voucherExchangePacer.reserve(options.expectedUserId);
            }
          } });
          const prepared = prepareLongRunningActor({ actor, userId: options.expectedUserId, db: context.db,
            journal, dispatchPacer, now, assertWriteAllowed });
          prepared[ACTOR_SLOT_RELEASE] = release;
          return prepared;
        } catch (error) { release(); throw error; }
      },
      async logout(actor, ...args) {
        try {
          if (fatalWriteError) throw fatalWriteError;
          return await logoutActor(actor, ...args);
        }
        finally { actor[ACTOR_SLOT_RELEASE]?.(); delete actor[ACTOR_SLOT_RELEASE]; }
      },
    };
    expiryTask = executeJourney(runPaymentExpiry, { runId, runDir: journal.runDir, journal, runState, db: context.db,
      catalog: context.catalog, actorStates: context.actors, credentials: credentials(env), customerName: "customerA",
      origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now, sleep, deadline, onWait,
    }).then(value => {
      if (value.status === "FAIL") fatalWriteError ??= new TestFailure(value.code ?? "CONCURRENT_EXPIRY_FAILED");
      return { value };
    }, error => {
      fatalWriteError ??= error;
      return { error };
    });
    const exchangeConcurrency = await executeJourney(runExchangeConcurrency, { runId, runDir: journal.runDir,
      journal, runState, db: context.db, catalog: context.catalog, customerState: customer,
      credential: credentials(env).customerB, origin: new URL(env.TEST_BASE_URL).origin,
      plan: context.plan, fetchImpl, actorLifecycle, now,
    });
    const result = exchangeConcurrency.status === "FAIL"
      ? { status: "PARTIAL", code: "FULL_STOPPED_AFTER_EXCHANGE_RACE_FAILURE", cases: [], gaps: [] }
      : await executeJourney(runFullJourney, { runId, runDir: journal.runDir, journal, runState, db: context.db,
      catalog: context.catalog, customerState: customer, credential: credentials(env).customerB,
      origin: new URL(env.TEST_BASE_URL).origin, plan: context.plan, fetchImpl, actorLifecycle, pacer,
      });
    const bundle = exchangeConcurrency.status === "FAIL" || result.status === "FAIL"
      ? { status: "PARTIAL", code: "BUNDLE_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runBundleJourney, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: context.actors, credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now,
      });
    let upstreamFailed = [exchangeConcurrency, result, bundle].some(item => item.status === "FAIL");
    const concurrency = upstreamFailed
      ? { status: "PARTIAL", code: "CONCURRENCY_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runVoucherConcurrency, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, customerState: customer, credential: credentials(env).customerB,
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer,
      });
    // Shared-actor journeys must snapshot A/admin only after expiry has released their sessions.
    const expiryOutcome = await expiryTask;
    if (expiryOutcome.error) throw expiryOutcome.error;
    const expiry = expiryOutcome.value;
    if (fatalWriteError) throw fatalWriteError;
    const eligibility = upstreamFailed || concurrency.status === "FAIL"
      ? { status: "PARTIAL", code: "ELIGIBILITY_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runVoucherEligibilityJourney, { runId, runDir: journal.runDir, journal, runState,
        db: context.db, catalog: context.catalog, actorStates: await freshActorStates(), credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now,
      });
    upstreamFailed ||= eligibility.status === "FAIL";
    const authorization = upstreamFailed || concurrency.status === "FAIL"
      ? { status: "PARTIAL", code: "AUTHORIZATION_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runVoucherAuthorization, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: context.actors, credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer,
      });
    const adminCancel = upstreamFailed || concurrency.status === "FAIL" || authorization.status === "FAIL"
      ? { status: "PARTIAL", code: "ADMIN_CANCEL_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runAdminCancelVoucherReuse, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: context.actors, credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer,
      });
    const delivery = upstreamFailed || concurrency.status === "FAIL" || authorization.status === "FAIL" || adminCancel.status === "FAIL"
      ? { status: "PARTIAL", code: "DELIVERY_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runDeliveryJourney, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, customerState: customer, credential: credentials(env).customerB,
        origin: new URL(env.TEST_BASE_URL).origin, plan: context.plan, fetchImpl, actorLifecycle, pacer,
      });
    // Delivery may acquire the planned FREESHIP voucher; negative eligibility consumes no additional inventory.
    const freeshipEligibility = upstreamFailed || concurrency.status === "FAIL" || authorization.status === "FAIL"
      || adminCancel.status === "FAIL" || delivery.status === "FAIL"
      ? { status: "PARTIAL", code: "FREESHIP_ELIGIBILITY_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runFreeshipEligibilityJourney, { runId, runDir: journal.runDir, journal, runState,
        db: context.db, catalog: context.catalog, actorStates: await freshActorStates(), credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now,
      });
    upstreamFailed ||= freeshipEligibility.status === "FAIL";
    const online = upstreamFailed || concurrency.status === "FAIL" || authorization.status === "FAIL"
      || adminCancel.status === "FAIL" || delivery.status === "FAIL"
      ? { status: "PARTIAL", code: "LIFECYCLE_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runOnlineLifecycle, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: context.actors, credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer,
      });
    const lifecycleRace = [exchangeConcurrency, result, bundle, eligibility, freeshipEligibility,
      concurrency, authorization, adminCancel, delivery, online]
      .some(item => item.status === "FAIL")
      ? { status: "PARTIAL", code: "LIFECYCLE_RACE_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runLifecycleConcurrency, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: context.actors, credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now, deadline,
      });
    const counter = upstreamFailed || concurrency.status === "FAIL" || authorization.status === "FAIL"
      || adminCancel.status === "FAIL" || delivery.status === "FAIL" || online.status === "FAIL"
      || lifecycleRace.status === "FAIL"
      ? { status: "PARTIAL", code: "COUNTER_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runCounterJourneys, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: context.actors, credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now, deadline,
      });
    const finalVoucher = [exchangeConcurrency, result, bundle, eligibility, freeshipEligibility, concurrency, authorization, adminCancel, delivery,
      online, lifecycleRace, counter, expiry].some(item => item.status === "FAIL")
      ? { status: "PARTIAL", code: "FINAL_VOUCHER_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runFinalVoucherLifecycle, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: await freshActorStates(), credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now,
      });
    const finalItems = [exchangeConcurrency, result, bundle, eligibility, freeshipEligibility, concurrency, authorization,
      adminCancel, delivery, online, lifecycleRace, counter, expiry, finalVoucher].some(item => item.status === "FAIL")
      ? { status: "PARTIAL", code: "FINAL_ITEM_VOUCHERS_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runFinalItemVoucherLifecycles, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: await freshActorStates(), credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now,
      });
    const finalBundle = [exchangeConcurrency, result, bundle, eligibility, freeshipEligibility, concurrency, authorization,
      adminCancel, delivery, online, lifecycleRace, counter, expiry, finalVoucher, finalItems].some(item => item.status === "FAIL")
      ? { status: "PARTIAL", code: "FINAL_BUNDLE_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runFinalBundleLifecycle, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: await freshActorStates(), credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now,
      });
    const finalFreeship = [exchangeConcurrency, result, bundle, eligibility, freeshipEligibility, concurrency, authorization, adminCancel,
      delivery, online, lifecycleRace, counter, expiry, finalVoucher, finalItems, finalBundle].some(item => item.status === "FAIL")
      ? { status: "PARTIAL", code: "FINAL_FREESHIP_STOPPED_AFTER_FAILURE", cases: [] }
      : await executeJourney(runFinalFreeshipLifecycle, { runId, runDir: journal.runDir, journal, runState, db: context.db,
        catalog: context.catalog, actorStates: await freshActorStates(), credentials: credentials(env),
        origin: new URL(env.TEST_BASE_URL).origin, fetchImpl, actorLifecycle, pacer, now,
      });
    const exact = loadRunState({ fs, runDir: journal.runDir });
    const reconciliation = await reconcileRun({ db: context.db, baselines: exact.baselines, actorIds: exact.actorIds,
      runSessionIds: exact.runSessionIds, markers: exact.markers, voucherIds: exact.voucherIds,
      initialCatalogFingerprint: exact.catalogFingerprint,
    });
    invariant(reconciliation.ok, "FULL_FINAL_RECONCILIATION_FAILED");
    const itemTypes = ["product-discount", "addon", "item"];
    const finalItemCases = finalItems.cases.length ? finalItems.cases : itemTypes.map(type => ({
      id: `online-final-${type}-redemption`, status: finalItems.status, ...(finalItems.code ? { code: finalItems.code } : {}),
    }));
    const finalBundleCases = finalBundle.cases.length ? finalBundle.cases : [{ id: "online-final-bundle-redemption",
      status: finalBundle.status, ...(finalBundle.code ? { code: finalBundle.code } : {}) }];
    const pending = PENDING_FULL_CASES.map(id => ({ id, status: "PARTIAL", code: `REQUIRED_CASE_NOT_IMPLEMENTED:${id}` }));
    return { ...result, status: combineStatus([exchangeConcurrency.status, result.status, concurrency.status, authorization.status, adminCancel.status,
      bundle.status, eligibility.status, delivery.status, online.status, lifecycleRace.status, counter.status, expiry.status,
      finalVoucher.status, finalItems.status, finalBundle.status, finalFreeship.status, freeshipEligibility.status,
      context.plan.gaps.length || pending.length ? "PARTIAL" : "PASS"]),
      cases: [{ id: "concurrent-exchange", status: exchangeConcurrency.status,
        ...(exchangeConcurrency.code ? { code: exchangeConcurrency.code } : {}) }, ...exchangeConcurrency.cases,
        ...result.cases, { id: "bundle-voucher-lifecycle", status: bundle.status, ...(bundle.code ? { code: bundle.code } : {}) },
        ...bundle.cases, { id: "voucher-concurrency", status: concurrency.status, ...(concurrency.code ? { code: concurrency.code } : {}) },
        ...concurrency.cases, { id: "voucher-eligibility", status: eligibility.status, ...(eligibility.code ? { code: eligibility.code } : {}) },
        ...eligibility.cases, { id: "voucher-authorization", status: authorization.status, ...(authorization.code ? { code: authorization.code } : {}) },
        ...authorization.cases, { id: "admin-cancel-voucher", status: adminCancel.status, ...(adminCancel.code ? { code: adminCancel.code } : {}) },
        ...adminCancel.cases, { id: "delivery-freeship", status: delivery.status, ...(delivery.code ? { code: delivery.code } : {}) },
        ...delivery.cases, { id: "freeship-min-order-rejection", status: freeshipEligibility.status,
          ...(freeshipEligibility.code ? { code: freeshipEligibility.code } : {}) },
        ...freeshipEligibility.cases.filter(item => item.id !== "freeship-min-order-rejection"),
        { id: "online-lifecycle", status: online.status, ...(online.code ? { code: online.code } : {}) },
        ...online.cases, { id: "concurrent-lifecycle", status: lifecycleRace.status,
          ...(lifecycleRace.code ? { code: lifecycleRace.code } : {}) },
        ...lifecycleRace.cases, { id: "counter-lifecycle", status: counter.status, ...(counter.code ? { code: counter.code } : {}) },
        ...counter.cases, { id: "payment-expiry", status: expiry.status, ...(expiry.code ? { code: expiry.code } : {}) },
        ...expiry.cases, { id: "final-voucher-journey", status: finalVoucher.status,
          ...(finalVoucher.code ? { code: finalVoucher.code } : {}) },
        ...(finalVoucher.cases.some(item => item.id === "online-final-voucher-redemption") ? []
          : [{ id: "online-final-voucher-redemption", status: finalVoucher.status,
            ...(finalVoucher.code ? { code: finalVoucher.code } : {}) }]),
        ...finalVoucher.cases, ...finalItemCases, ...finalBundleCases,
        { id: "online-final-freeship-redemption", status: finalFreeship.status,
          ...(finalFreeship.code ? { code: finalFreeship.code } : {}) },
        ...finalFreeship.cases.filter(item => item.id !== "online-final-freeship-redemption"), ...pending],
      reasons: [...new Set([...(exchangeConcurrency.code ? [exchangeConcurrency.code] : []),
        ...(result.gaps ?? []).map(item => item.code), ...(result.code ? [result.code] : []),
        ...(bundle.code ? [bundle.code] : []),
        ...(eligibility.code ? [eligibility.code] : []), ...eligibility.cases.filter(item => item.code).map(item => item.code),
        ...(freeshipEligibility.code ? [freeshipEligibility.code] : []),
        ...(finalFreeship.code ? [finalFreeship.code] : []), ...finalFreeship.cases.filter(item => item.code).map(item => item.code),
        ...(finalVoucher.code ? [finalVoucher.code] : []), ...finalVoucher.cases.filter(item => item.code).map(item => item.code),
        ...(finalItems.code ? [finalItems.code] : []), ...finalItemCases.filter(item => item.code).map(item => item.code),
        ...(finalBundle.code ? [finalBundle.code] : []), ...finalBundleCases.filter(item => item.code).map(item => item.code),
        ...(concurrency.code ? [concurrency.code] : []), ...(delivery.code ? [delivery.code] : []),
        ...(authorization.code ? [authorization.code] : []),
        ...(adminCancel.code ? [adminCancel.code] : []),
        ...(online.code ? [online.code] : []), ...(lifecycleRace.code ? [lifecycleRace.code] : []),
        ...(counter.code ? [counter.code] : []),
        ...(expiry.code ? [expiry.code] : []), ...expiry.cases.filter(item => item.code).map(item => item.code),
        ...context.plan.gaps, ...pending.map(item => item.code)])],
      summary: { ...result.summary, exchangeConcurrency: exchangeConcurrency.summary,
        bundle: bundle.summary, eligibility: eligibility.summary, finalVoucher: finalVoucher.summary,
        finalItems: finalItems.summary ?? { ordersCompleted: 0, pointsAwarded: 0 },
        finalBundle: finalBundle.summary ?? { ordersCompleted: 0 },
        finalFreeship: finalFreeship.summary, freeshipEligibility: freeshipEligibility.summary,
        concurrency: concurrency.summary, authorization: authorization.summary,
        adminCancel: adminCancel.summary, delivery: delivery.summary,
        online: online.summary, lifecycleRace: lifecycleRace.summary, counter: counter.summary, expiry: expiry.summary },
      plan: context.plan.summary,
      reconciliation: { orderCount: reconciliation.orderCount, activeUseCount: reconciliation.activeUseCount },
    };
  } catch (error) {
    if (/AMBIGUOUS/.test(error?.code ?? "")) fatalWriteError ??= error;
    throw error;
  } finally {
    if (expiryTask) await expiryTask;
    await context.db.close();
  }
}

/** Execute the read-only planning profile and close its database oracle. */
export async function executePlan({ env, attestation, fetchImpl = fetch, openDatabase }) {
  const context = await preflight({ env, attestation, profile: "full", requirePushSandbox: false, fetchImpl, openDatabase });
  try {
    const full = implementationAwarePlan(context.plan);
    full.summary.conservativeSchedule = conservativeSchedule(env, context.actors.customerB);
    for (const id of PENDING_FULL_CASES) full.gaps.push(`REQUIRED_CASE_NOT_IMPLEMENTED:${id}`);
    if (PENDING_FULL_CASES.length) full.status = "PARTIAL";
    const smoke = buildExecutionPlan({ profile: "smoke", catalog: context.catalog, actors: context.actors });
    const pushVerified = context.evidence.pushMode === "log_only" && context.evidence.pushGuardVerified === true;
    if (!pushVerified) { smoke.gaps.push("PUSH_SANDBOX_NOT_VERIFIED"); smoke.status = "PARTIAL"; }
    return {
      status: combineStatus([smoke.status, full.status]),
      reasons: [...new Set([...smoke.gaps.map(code => `SMOKE:${code}`), ...full.gaps.map(code => `FULL:${code}`)])],
      summary: { smoke: smoke.summary, full: full.summary },
      cases: { smoke: smoke.cases, full: full.cases },
      blockers: { smoke: smoke.blockers, full: full.blockers },
      attestation: {
        deploymentId: context.evidence.deploymentId,
        deploymentSha: context.evidence.deploymentSha,
        verifiedAt: context.evidence.verifiedAt,
        pushSandboxVerified: pushVerified,
      },
    };
  } finally { await context.db.close(); }
}

/** Execute the write-enabled, repeatable customer smoke profile against verified staging. */
export async function executeSmoke({ runRoot, runId, env, attestation, fetchImpl = fetch, openDatabase }) {
  const context = await preflight({ env, attestation, profile: "smoke", requirePushSandbox: true, fetchImpl, openDatabase });
  try {
    fs.mkdirSync(runRoot, { recursive: true });
    const journal = createJournal({ fs, rootDir: runRoot, runId, now: () => new Date() });
    const customer = context.actors.customerA;
    prerequisite(customer?.user, "SMOKE_CUSTOMER_ACCOUNT_INVALID");
    const baselines = { customerA: actorBaseline(customer) };
    const actorIds = { customerA: customer.user.id };
    const runState = createRunState({ fs, runDir: journal.runDir, initial: {
      profile: "smoke", baselines, actorIds, catalogFingerprint: context.catalog.fingerprint,
      target: { origin: new URL(env.TEST_BASE_URL).origin, supabaseRef: env.TEST_STAGING_SUPABASE_REF, deploymentId: env.TEST_DEPLOYMENT_ID },
    } });
    const result = await executeJourney(runSmokeJourney, {
      runId,
      runDir: journal.runDir,
      journal,
      runState,
      db: context.db,
      catalog: context.catalog,
      customerState: customer,
      credential: credentials(env).customerA,
      origin: new URL(env.TEST_BASE_URL).origin,
      plan: context.plan,
      fetchImpl,
    });
    const exact = loadRunState({ fs, runDir: journal.runDir });
    const reconciliation = await reconcileRun({
      db: context.db,
      baselines: exact.baselines,
      actorIds: exact.actorIds,
      runSessionIds: exact.runSessionIds,
      markers: exact.markers,
      voucherIds: exact.voucherIds,
      initialCatalogFingerprint: exact.catalogFingerprint,
    });
    invariant(reconciliation.ok, "SMOKE_FINAL_RECONCILIATION_FAILED");
    return {
      ...result,
      reasons: [],
      plan: context.plan.summary,
      reconciliation: { orderCount: reconciliation.orderCount, activeUseCount: reconciliation.activeUseCount },
    };
  } finally { await context.db.close(); }
}
