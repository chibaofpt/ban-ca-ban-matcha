import { vi } from "vitest";
import { createApi } from "../../scripts/staging-tests/http.mjs";
import { buildExecutionPlan } from "../../scripts/staging-tests/planner.mjs";
import type { openReadDatabase } from "../../scripts/staging-tests/database.mjs";
import type { preflight } from "../../scripts/staging-tests/preflight.mjs";

type ReadDatabase = ReturnType<typeof openReadDatabase>;

/** Complete the read-only DB boundary; unexpected calls fail instead of manufacturing rows. */
export function readDatabaseDouble(overrides: Partial<ReadDatabase> = {}): ReadDatabase {
  const unexpected = () => { throw new Error("Unexpected database read in test"); };
  return {
    catalog: vi.fn(unexpected), actor: vi.fn(unexpected), actorState: vi.fn(unexpected),
    session: vi.fn(unexpected), sessionById: vi.fn(unexpected), order: vi.fn(unexpected),
    ordersByMarkers: vi.fn(unexpected), pendingForUsers: vi.fn(unexpected), recentOrders: vi.fn(unexpected),
    vouchers: vi.fn(unexpected), activeUses: vi.fn(unexpected), close: vi.fn(async () => {}), ...overrides,
  };
}

/** A structurally real preflight result for runner-wiring tests, with no network access. */
export function preflightDouble(db: Partial<ReadDatabase> = {}): Extract<Awaited<ReturnType<typeof preflight>>, { publicData: object }> {
  const catalog = { items: [], packages: [], fingerprint: "catalog" };
  return {
    db: readDatabaseDouble(db), catalog, actors: {}, evidence: {},
    api: createApi({ origin: "https://verified.vercel.app", fetchImpl: async () => { throw new Error("Unexpected HTTP in runner wiring test"); } }),
    publicData: { menu: {}, powders: {}, packages: {}, store: {} },
    plan: buildExecutionPlan({ profile: "full", catalog, actors: {} }),
  };
}
