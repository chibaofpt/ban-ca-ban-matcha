import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "ADMIN" as string | null,
  powder: { id: "11111111-1111-4111-8111-111111111111", name: "A", is_available: true,
    reference_latte_item_id: "22222222-2222-4222-8222-222222222222" as string | null, image_url: null, powderSizeConfigs: [] },
  fusions: [] as Array<{ id: string; name: string; category: string; is_available: boolean;
    default_powder_id: string | null; replacement_powder_id: string | null }>,
  latteAvailability: {} as Record<string, boolean>,
  writes: [] as Array<Record<string, unknown>>,
}));
const candidates = [
  { id: "33333333-3333-4333-8333-333333333333", name: "B", is_available: true },
  { id: "44444444-4444-4444-8444-444444444444", name: "C", is_available: true },
];
const powderDb = {
  findUnique: vi.fn(async () => state.powder),
  findUniqueOrThrow: vi.fn(async () => state.powder),
  findFirst: vi.fn(async () => state.powder),
  findMany: vi.fn(async () => candidates),
  update: vi.fn(async ({ data }: { data: Partial<typeof state.powder> }) => {
    state.writes.push({ powder: data }); Object.assign(state.powder, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))); return state.powder;
  }),
};
const menuDb = {
  findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, category: "latte", name: "Latte A",
    is_available: state.latteAvailability[where.id] ?? state.powder.is_available, matcha_powder_id: state.powder.id, default_base_liquid_id: null,
    sizes: [], fusionAllowedPowders: [], allowedBaseLiquids: [], updated_at: new Date() })),
  findMany: vi.fn(async () => state.fusions),
  findUniqueOrThrow: vi.fn(async () => ({ id: state.powder.reference_latte_item_id, category: "latte", name: "Latte A",
    is_available: state.powder.is_available, sizes: [], fusionAllowedPowders: [], allowedBaseLiquids: [], updated_at: new Date() })),
  update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    state.writes.push({ menu: where.id, data });
    if (typeof data.is_available === "boolean") state.latteAvailability[where.id] = data.is_available;
    Object.assign(state.fusions.find((row) => row.id === where.id) ?? {}, data); return {};
  }),
  updateMany: vi.fn(async ({ where, data }: { where: { default_powder_id: string }; data: Record<string, unknown> }) => {
    state.writes.push({ menus: where, data });
    for (const row of state.fusions) if (row.default_powder_id === where.default_powder_id) Object.assign(row, data);
    return { count: state.fusions.length };
  }),
};
const tx = { matchaPowder: powderDb, menuItem: menuDb };
const transaction = vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx));
vi.mock("@/lib/auth", () => ({ getSession: async () => state.role ? { id: "admin", role: state.role } : null }));
vi.mock("@/lib/prisma", () => ({ prisma: { get matchaPowder() { return powderDb; }, get menuItem() { return menuDb; }, $transaction: (...args: Parameters<typeof transaction>) => transaction(...args),
  defaultSizeConfig: { findMany: async () => [] }, milkType: { findMany: async () => [] } } }));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateMenuCaches: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureServerException: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeMenuImages: vi.fn(), parseMenuImagePath: vi.fn() }));
vi.mock("@/lib/catalog/catalogImage", () => ({
  prepareCatalogImage: async () => ({ newPath: null, oldPath: null }), catalogImageValidationMessage: () => null,
}));

import { PUT as powderPut, DELETE as powderDelete } from "@/app/api/admin/powders/[id]/route";
import { PUT as menuPut } from "@/app/api/admin/menu/[id]/route";

function request(body?: Record<string, unknown>, method = "PUT") {
  return new Request("http://localhost/api/admin/powders/a", { method,
    ...(body && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
}
function put(body: Record<string, unknown>, fromMenu = false) {
  const id = fromMenu ? state.powder.reference_latte_item_id : state.powder.id;
  if (!id) throw new Error("Missing reference Latte in fixture");
  return (fromMenu ? menuPut : powderPut)(request(body), {
    params: Promise.resolve({ id }),
  });
}
function mappings() { return state.fusions.map((row) => ({ menu_item_id: row.id, replacement_powder_id: candidates[0].id })); }

describe("Fusion — chuyển bột thay thế tường minh", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.role = "ADMIN"; state.powder.id = "11111111-1111-4111-8111-111111111111"; state.powder.is_available = true; state.powder.reference_latte_item_id = "22222222-2222-4222-8222-222222222222"; state.writes = [];
    state.fusions = [true, false].map((is_available, index) => ({
      id: `55555555-5555-4555-8555-55555555555${index}`, name: `Fusion ${index}`, category: "fusion",
      is_available, default_powder_id: state.powder.id, replacement_powder_id: null,
    }));
    state.latteAvailability = {};
    transaction.mockImplementation(async (operation) => operation(tx));
  });

  it.each([
    [true, false, false], [false, true, false],
    [true, false, true], [false, true, true],
    [false, undefined, false],
  ] as const)("full edit đổi neo giữ Latte cũ (ban đầu=%s, trạng thái=%s, bỏ neo=%s)", async (initial, desired, detach) => {
    const oldLatteId = state.powder.reference_latte_item_id!;
    const newLatteId = "77777777-7777-4777-8777-777777777777";
    state.powder.is_available = initial;
    if (!initial) for (const row of state.fusions) row.replacement_powder_id = candidates[0].id;
    state.latteAvailability = { [oldLatteId]: initial, [newLatteId]: !initial };
    const response = await put({
      name: "A", reference_latte_item_id: detach ? null : newLatteId,
      ...(desired !== undefined && { is_available: desired }),
      ...((desired ?? initial) === false && { fusion_powder_replacements: mappings() }),
    });
    expect(response.status).toBe(200);
    expect(state.powder.is_available).toBe(desired ?? initial);
    expect(state.powder.reference_latte_item_id).toBe(detach ? null : newLatteId);
    expect(state.latteAvailability[oldLatteId]).toBe(initial);
    if (!detach) expect(state.latteAvailability[newLatteId]).toBe(desired ?? initial);
  });

  it("full edit bỏ qua availability giữ bột inactive và replacement", async () => {
    state.powder.is_available = false;
    for (const row of state.fusions) row.replacement_powder_id = candidates[0].id;
    const response = await put({ name: "A mới" });
    expect(response.status).toBe(200);
    expect(state.powder.is_available).toBe(false);
    expect(state.fusions.map((row) => row.replacement_powder_id)).toEqual([candidates[0].id, candidates[0].id]);
    expect(state.writes.some((write) => "menu" in write || "menus" in write)).toBe(false);
  });

  it("full edit đổi neo và ngưng thiếu mapping không ghi dữ liệu", async () => {
    const oldLatteId = state.powder.reference_latte_item_id;
    const response = await put({ name: "A", is_available: false,
      reference_latte_item_id: "77777777-7777-4777-8777-777777777777" });
    expect(response.status).toBe(422);
    expect(state.powder.reference_latte_item_id).toBe(oldLatteId);
    expect(state.writes).toEqual([]);
  });

  it.each([false, true])("ngưng từ powder hoặc Latte trả tất cả Fusion và không ghi (Latte=%s)", async (fromMenu) => {
    const response = await put({ is_available: false }, fromMenu);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "BUSINESS_RULE_VIOLATION", details: {
      reason: "FUSION_POWDER_REPLACEMENT_REQUIRED", powder_id: state.powder.id,
      fusion_items: state.fusions.map(({ id, name, is_available, default_powder_id, replacement_powder_id }) => ({ id, name, is_available, default_powder_id, replacement_powder_id })),
      available_powders: candidates.map(({ id, name }) => ({ id, name })),
    } });
    expect(state.writes).toEqual([]);
  });

  it.each([false, true])("xác nhận mapping cho cả Fusion đang ngưng và giữ gốc (Latte=%s)", async (fromMenu) => {
    const response = await put({ is_available: false, fusion_powder_replacements: mappings() }, fromMenu);
    expect(response.status).toBe(200);
    expect(state.powder.is_available).toBe(false);
    expect(state.fusions.map((row) => [row.default_powder_id, row.replacement_powder_id, row.is_available]))
      .toEqual([[state.powder.id, candidates[0].id, true], [state.powder.id, candidates[0].id, false]]);
    expect(state.writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ menu: state.powder.reference_latte_item_id, data: expect.objectContaining({ is_available: false }) }),
    ]));
  });

  it.each(["missing", "duplicate", "extra", "self", "inactive"] as const)("từ chối mapping %s và giữ nguyên dữ liệu", async (kind) => {
    const choices = mappings();
    if (kind === "missing") choices.pop();
    if (kind === "duplicate") choices[1] = { ...choices[0] };
    if (kind === "extra") choices.push({ menu_item_id: candidates[1].id, replacement_powder_id: candidates[0].id });
    if (kind === "self") choices[0].replacement_powder_id = state.powder.id;
    if (kind === "inactive") choices[0].replacement_powder_id = "66666666-6666-4666-8666-666666666666";
    const response = await put({ is_available: false, fusion_powder_replacements: choices });
    expect(response.status).toBe(422); expect(state.writes).toEqual([]);
  });

  it("catalog mới không còn ứng viên đã chọn trả lại sheet thay vì ghi", async () => {
    powderDb.findMany.mockResolvedValueOnce([candidates[1]]);
    const response = await put({ is_available: false, fusion_powder_replacements: mappings() });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ details: { available_powders: [{ id: candidates[1].id, name: "C" }] } });
    expect(state.writes).toEqual([]);
  });

  it("không có Fusion liên quan thì ngưng bình thường", async () => {
    state.fusions = [];
    expect((await put({ is_available: false })).status).toBe(200);
    expect(state.powder.is_available).toBe(false);
  });

  it("full edit và DELETE cũ không bypass xác nhận replacement", async () => {
    expect((await put({ name: "A mới", is_available: false })).status).toBe(422);
    expect((await powderDelete(request(undefined, "DELETE"), { params: Promise.resolve({ id: state.powder.id }) })).status).toBe(422);
    expect(state.writes).toEqual([]);
    const response = await powderDelete(request({ fusion_powder_replacements: mappings() }, "DELETE"),
      { params: Promise.resolve({ id: state.powder.id }) });
    expect(response.status).toBe(200); expect(state.powder.is_available).toBe(false);
  });

  it("bật gốc xóa replacement của gốc và không đổi trạng thái Fusion", async () => {
    state.powder.is_available = false;
    for (const row of state.fusions) row.replacement_powder_id = candidates[0].id;
    const response = await put({ is_available: true });
    expect(response.status).toBe(200);
    expect(state.fusions.map((row) => [row.replacement_powder_id, row.is_available])).toEqual([[null, true], [null, false]]);
  });

  it("chuỗi A sang B sang C không đổi gốc A và bật B không kéo Fusion về B", async () => {
    const originalA = state.powder.id;
    state.powder.id = candidates[0].id;
    for (const row of state.fusions) row.replacement_powder_id = candidates[0].id;
    const choices = state.fusions.map((row) => ({ menu_item_id: row.id, replacement_powder_id: candidates[1].id }));
    expect((await put({ is_available: false, fusion_powder_replacements: choices })).status).toBe(200);
    expect((await put({ is_available: true })).status).toBe(200);
    expect(state.fusions.map((row) => [row.default_powder_id, row.replacement_powder_id]))
      .toEqual([[originalA, candidates[1].id], [originalA, candidates[1].id]]);
  });

  it("full save trạng thái không đổi giữ replacement", async () => {
    state.powder.is_available = false;
    for (const row of state.fusions) row.replacement_powder_id = candidates[0].id;
    expect((await put({ name: "A mới", is_available: false })).status).toBe(200);
    expect(state.fusions.map((row) => row.replacement_powder_id)).toEqual([candidates[0].id, candidates[0].id]);
  });

  it.each([null, "CUSTOMER"])("chặn role %s trước workflow", async (role) => {
    state.role = role;
    expect((await put({ is_available: false, fusion_powder_replacements: mappings() })).status).toBe(401);
    expect(state.writes).toEqual([]);
  });

  it("P2034 retry trước khi callback trả kết quả ứng dụng thành công", async () => {
    transaction.mockRejectedValueOnce(Object.assign(new Error("serialization"), { code: "P2034" }));
    expect((await put({ is_available: false, fusion_powder_replacements: mappings() })).status).toBe(200);
    expect(state.powder.is_available).toBe(false);
  });

  it("P2034 hết retry trả lỗi và không báo thành công", async () => {
    transaction.mockRejectedValue(Object.assign(new Error("serialization"), { code: "P2034" }));
    expect((await put({ is_available: false, fusion_powder_replacements: mappings() })).status).toBe(409);
    expect(state.writes).toEqual([]);
  });

  it("bật từ Latte đang ngưng sửa pair lệch và xóa replacement của gốc", async () => {
    for (const row of state.fusions) row.replacement_powder_id = candidates[0].id;
    menuDb.findUnique.mockResolvedValueOnce({
      id: state.powder.reference_latte_item_id!, category: "latte", name: "Latte A", is_available: false,
      matcha_powder_id: state.powder.id, default_base_liquid_id: null, sizes: [], fusionAllowedPowders: [], allowedBaseLiquids: [], updated_at: new Date(),
    }).mockResolvedValueOnce({
      id: state.powder.reference_latte_item_id!, category: "latte", name: "Latte A", is_available: false,
      matcha_powder_id: state.powder.id, default_base_liquid_id: null, sizes: [], fusionAllowedPowders: [], allowedBaseLiquids: [], updated_at: new Date(),
    });
    expect((await put({ is_available: true }, true)).status).toBe(200);
    expect(state.fusions.map((row) => row.replacement_powder_id)).toEqual([null, null]);
  });
  it.each(["PUT", "DELETE"])("retry %s reports only the committed Latte reference", async (method) => {
    let attempt = 0;
    transaction.mockImplementation(async (operation) => {
      attempt += 1;
      const availableBefore = state.powder.is_available;
      const fusionsBefore = state.fusions.map((row) => ({ ...row }));
      const result = await operation(tx);
      if (attempt === 1) {
        // Simulate a rolled-back attempt and a concurrent reference removal at the DB boundary.
        state.powder.is_available = availableBefore;
        state.powder.reference_latte_item_id = null;
        state.fusions = fusionsBefore;
        state.writes = [];
        throw Object.assign(new Error("serialization"), { code: "P2034" });
      }
      return result;
    });
    const payload = { is_available: false, fusion_powder_replacements: mappings() };
    const response = method === "DELETE"
      ? await powderDelete(request(payload, "DELETE"), { params: Promise.resolve({ id: state.powder.id }) })
      : await put(payload);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.reference_latte_item_id).toBeNull();
    expect(body.data).not.toHaveProperty("disabled_latte_id");
    expect(transaction).toHaveBeenCalledTimes(2);
  });

});
