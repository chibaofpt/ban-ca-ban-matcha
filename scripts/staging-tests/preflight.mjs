import { createApi } from "./http.mjs";
import { validateStaticTarget, validateTarget } from "./core.mjs";
import { TestFailure, invariant, prerequisite } from "./errors.mjs";
import { openReadDatabase } from "./database.mjs";
import { publicCatalogFingerprintFromApi, publicCatalogFingerprintFromDatabase } from "./fingerprints.mjs";
import { buildExecutionPlan } from "./planner.mjs";
import { credentials } from "./actors.mjs";

const requiredRoles = { customerA: "CUSTOMER", customerB: "CUSTOMER", admin: "ADMIN", staff: "STAFF" };

async function publicReads(api) {
  const [menu, powders, packages, store] = await Promise.all([
    api.request("/api/menu"), api.request("/api/powders"), api.request("/api/voucher-packages"), api.request("/api/store-status"),
  ]);
  for (const result of [menu, powders, packages, store]) invariant(result.ok, "PUBLIC_PREFLIGHT_FAILED");
  return { menu: menu.body, powders: powders.body, packages: packages.body, store: store.body };
}

/** Execute only reads and return the frozen inputs required by one live profile. */
export async function preflight({ env, attestation, profile, requirePushSandbox = false, fetchImpl, openDatabase = openReadDatabase }) {
  const staticTarget = validateStaticTarget(env);
  if (!staticTarget.ok) throw new TestFailure("UNSAFE_STATIC_TARGET", staticTarget.errors.join("; "));
  const api = createApi({ origin: staticTarget.apiOrigin, fetchImpl });
  const db = openDatabase(env.DATABASE_URL);
  try {
    const [publicData, catalog] = await Promise.all([publicReads(api), db.catalog()]);
    invariant(typeof publicData.store?.data?.is_open === "boolean", "STORE_STATUS_CONTRACT_INVALID");
    catalog.storeStatus = publicData.store.data;
    const databaseFingerprint = publicCatalogFingerprintFromDatabase(catalog);
    const apiDatabaseFingerprint = publicCatalogFingerprintFromApi(publicData.menu, publicData.powders);
    const evidence = { ...attestation, databaseFingerprint, apiDatabaseFingerprint };
    const target = validateTarget(env, evidence, requirePushSandbox);
    if (!target.ok) throw new TestFailure("UNSAFE_RUNTIME_TARGET", target.errors.join("; "));
    if (profile === "recover") return { db, api, catalog, evidence };
    const configured = credentials(env);
    const actors = {};
    for (const [name, credential] of Object.entries(configured)) {
      if (!credential.phone) { actors[name] = null; continue; }
      const actor = await db.actor(credential.phone);
      prerequisite(actor && actor.role === requiredRoles[name], `ACTOR_INVALID_${name.toUpperCase()}`);
      const state = await db.actorState(actor.id);
      const [orders, recent] = await Promise.all([db.pendingForUsers([actor.id]), db.recentOrders(actor.id)]);
      actors[name] = {
        ...state, addresses: actor.addresses, orders, recentOrderCount: recent.length, actor,
        credentialReady: Boolean(credential.phone && credential.password),
      };
    }
    const plan = buildExecutionPlan({ profile, catalog, actors });
    if (!requirePushSandbox && (attestation.pushMode !== "log_only" || attestation.pushGuardVerified !== true)) {
      plan.gaps.push("PUSH_SANDBOX_NOT_VERIFIED"); plan.status = "PARTIAL";
    }
    catalog.apiMenu = publicData.menu.data;
    return { db, api, catalog, publicData, actors, plan, evidence };
  } catch (error) {
    await db.close();
    throw error;
  }
}
