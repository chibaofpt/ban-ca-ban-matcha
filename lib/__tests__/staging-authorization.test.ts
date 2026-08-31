// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { runVoucherAuthorization } from "../../scripts/staging-tests/journeys/authorization.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";

describe("Staging voucher authorization", () => {
  it("customer A không thể tạo order bằng voucher của customer B và không actor nào đổi state", async () => {
    const voucher = { id: "voucher-b", qr_token: "00000000-0000-4000-8000-000000000001", voucher_type: "DISCOUNT",
      status: "ACTIVE", discount_type: "FIXED", discount_value: 5_000, min_order_vnd: 0, expires_at: null };
    const states = {
      customerA: { user: { id: "a", role: "CUSTOMER", points_balance: 50 }, sessions: [{ id: "old-a" }], vouchers: [], ledger: [], grants: [] },
      customerB: { user: { id: "b", role: "CUSTOMER", points_balance: 100 }, sessions: [{ id: "old-b" }], vouchers: [voucher], ledger: [], grants: [] },
    };
    const requests: Array<{ path: string; body?: Record<string, unknown> }> = [];
    const journal = createJournal({ rootDir: "D:/journal-double", runId: "run_12345678", now: () => new Date(),
      fs: { mkdirSync() {}, appendFileSync() {} } });
    const catalog = { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true,
      matcha_powder_id: "powder", sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
      powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
      liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }],
      defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] };
    const result = await runVoucherAuthorization({ runId: "run_12345678", runDir: "unused", origin: "https://test.invalid",
      catalog, journal, runState: { addMarker() {}, addVoucher() {}, addSession() {} }, pacer: { reserve: vi.fn() },
      actorStates: { customerA: { ...structuredClone(states.customerA), actor: { id: "a" } },
        customerB: { ...structuredClone(states.customerB), actor: { id: "b" } } },
      credentials: { customerA: { phone: "+8491", password: "pw", role: "CUSTOMER" } },
      db: { actorState: vi.fn(async (id: "a" | "b") => structuredClone(id === "a" ? states.customerA : states.customerB)),
        ordersByMarkers: vi.fn(async () => []), catalog: vi.fn(async () => ({ fingerprint: "catalog" })) },
      actorLifecycle: { async login() {
        states.customerA.sessions.push({ id: "run-a" });
        return { name: "customerA", sessionId: "run-a", api: { async request(path: string, options: { body?: Record<string, unknown> }) {
          requests.push({ path, body: options.body }); return { ok: false, status: 404, body: { code: "NOT_FOUND" } };
        } } };
      }, async logout() { states.customerA.sessions = [{ id: "old-a" }]; } },
    });
    expect(result).toMatchObject({ status: "PASS", cases: [{ id: "authorization-cross-customer-voucher", status: "PASS" }] });
    expect(requests).toHaveLength(1);
    expect(requests[0].body?.discount_voucher_ids).toEqual([voucher.qr_token]);
    expect(states).toEqual({
      customerA: expect.objectContaining({ sessions: [{ id: "old-a" }], vouchers: [], ledger: [] }),
      customerB: expect.objectContaining({ sessions: [{ id: "old-b" }], vouchers: [voucher], ledger: [] }),
    });
  });

  it("không nhận ownership hoặc huỷ đơn cũ trùng marker authorization", async () => {
    const voucher = { id: "voucher-b", qr_token: "00000000-0000-4000-8000-000000000001", voucher_type: "DISCOUNT",
      status: "ACTIVE", discount_type: "FIXED", discount_value: 5_000, min_order_vnd: 0, expires_at: null };
    const states = {
      a: { user: { id: "a", role: "CUSTOMER", points_balance: 50 }, sessions: [], vouchers: [], ledger: [], grants: [] },
      b: { user: { id: "b", role: "CUSTOMER", points_balance: 100 }, sessions: [], vouchers: [voucher], ledger: [], grants: [] },
    };
    const marker = "[STAGING:run_12345678:cross-customer-voucher]";
    const old = { id: "old", user_id: "a", status: "PENDING", note: marker };
    const addMarker = vi.fn();
    const request = vi.fn();
    const result = await runVoucherAuthorization({ runId: "run_12345678", runDir: "unused", origin: "https://test.invalid",
      catalog: { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true,
        matcha_powder_id: "powder", sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
      powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
      liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }],
      defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] },
      journal: {}, runState: { addMarker, addVoucher: vi.fn(), addSession: vi.fn() }, pacer: { reserve: vi.fn() },
      actorStates: { customerA: { ...structuredClone(states.a), actor: { id: "a" } },
        customerB: { ...structuredClone(states.b), actor: { id: "b" } } },
      credentials: { customerA: { phone: "+8491", password: "pw", role: "CUSTOMER" } },
      db: { actorState: vi.fn(async (id: "a" | "b") => structuredClone(states[id])),
        ordersByMarkers: vi.fn(async () => [structuredClone(old)]), catalog: vi.fn(async () => ({ fingerprint: "catalog" })) },
      actorLifecycle: { login: vi.fn(async () => ({ name: "customerA", api: { request } })), logout: vi.fn() },
    });
    expect(result).toMatchObject({ status: "FAIL", code: "CROSS_CUSTOMER_MARKER_COLLISION" });
    expect(addMarker).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(old.status).toBe("PENDING");
  });
});
