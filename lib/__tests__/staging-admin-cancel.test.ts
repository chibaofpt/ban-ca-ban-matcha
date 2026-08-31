// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { runAdminCancelVoucherReuse } from "../../scripts/staging-tests/journeys/admin-cancel.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";

describe("Staging ADMIN cancel voucher", () => {
  it("ADMIN huỷ pending trả voucher, customer tạo lại được rồi tự huỷ", async () => {
    const voucher = { id: "v", qr_token: "00000000-0000-4000-8000-000000000001", voucher_type: "DISCOUNT", status: "ACTIVE",
      discount_type: "FIXED", discount_value: 5_000, min_order_vnd: 0, expires_at: null };
    const states = {
      customerB: { user: { id: "b", role: "CUSTOMER", points_balance: 100 }, sessions: [{ id: "old-b" }], vouchers: [voucher], ledger: [], grants: [] },
      admin: { user: { id: "admin", role: "ADMIN", points_balance: 0 }, sessions: [{ id: "old-admin" }], vouchers: [], ledger: [], grants: [] },
    };
    const orders = new Map<string, Record<string, unknown>>();
    const api = (name: "customerB" | "admin") => ({ async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
      if (name === "customerB" && path === "/api/orders" && options.method === "POST") {
        voucher.status = "RESERVED"; const marker = String(options.body?.note); const id = `o-${orders.size + 1}`;
        const order = { id, user_id: "b", status: "PENDING", order_type: "PICKUP", note: marker,
          subtotal_vnd: 17_000, total_voucher_discount_vnd: 5_000, total_vnd: 12_000, shipping_fee_vnd: 0,
          freeship_discount_vnd: 0, grand_total_vnd: 12_000, discountVouchers: [{ voucher_id: "v" }],
          items: (options.body?.items as Array<Record<string, unknown>>).map(item => ({ ...item })) };
        orders.set(id, order); return { ok: true, status: 201, body: { data: structuredClone(order) } };
      }
      const id = path.split("/").at(-1)!; const order = orders.get(id)!;
      if (!options.method || options.method === "GET") return { ok: true, status: 200, body: { data: structuredClone(order) } };
      if (options.method === "PATCH" && order.status === "PENDING") {
        order.status = "CANCELLED"; voucher.status = "ACTIVE";
        return { ok: true, status: 200, body: { data: structuredClone(order) } };
      }
      throw new Error("Unexpected request");
    } });
    const journal = createJournal({ rootDir: "D:/journal-double", runId: "run_12345678", now: () => new Date(),
      fs: { mkdirSync() {}, appendFileSync() {} } });
    const catalog = { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true, matcha_powder_id: "powder",
      sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }], powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
      liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }], defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] };
    const result = await runAdminCancelVoucherReuse({ runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", catalog, journal,
      runState: { addMarker() {}, addVoucher() {}, addSession() {} }, pacer: { reserve: vi.fn() },
      actorStates: { customerB: { ...structuredClone(states.customerB), actor: { id: "b" } },
        admin: { ...structuredClone(states.admin), actor: { id: "admin" } } },
      credentials: { customerB: { phone: "+849", password: "pw" }, admin: { phone: "+848", password: "pw" } },
      actorLifecycle: { async login({ name }: { name: "customerB" | "admin" }) {
        states[name].sessions.push({ id: `run-${name}` }); return { name, sessionId: `run-${name}`, api: api(name) };
      }, async logout(actor: { name: "customerB" | "admin" }) {
        states[actor.name].sessions = [{ id: actor.name === "customerB" ? "old-b" : "old-admin" }];
      } },
      db: { actorState: vi.fn(async (id: string) => structuredClone(id === "b" ? states.customerB : states.admin)),
        ordersByMarkers: vi.fn(async (markers: string[]) => structuredClone([...orders.values()].filter(order => markers.includes(String(order.note))))),
        order: vi.fn(async (id: string) => structuredClone(orders.get(id))), vouchers: vi.fn(async () => structuredClone([voucher])),
        activeUses: vi.fn(async () => voucher.status === "RESERVED" ? [{ id: [...orders.values()].find(order => order.status === "PENDING")?.id }] : []),
        catalog: vi.fn(async () => ({ fingerprint: "catalog" })) },
    });
    expect(result, JSON.stringify(result)).toMatchObject({ status: "PASS", summary: { ordersCreated: 2, adminCancellations: 1 } });
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(voucher.status).toBe("ACTIVE");
    expect(states.customerB.user.points_balance).toBe(100);
  });
});
