import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getSettings: vi.fn(), updateSettings: vi.fn(),
  listCampaigns: vi.fn(), createCampaign: vi.fn(), getCampaign: vi.fn(), mutateCampaign: vi.fn(), replacePool: vi.fn(),
  createBox: vi.fn(), updateBox: vi.fn(), deleteBox: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: (...args: unknown[]) => mocks.getSession(...args) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/adminWelcomeRewardSettings", () => ({
  getAdminWelcomeRewardSettings: (...args: unknown[]) => mocks.getSettings(...args),
  updateAdminWelcomeRewardSettings: (...args: unknown[]) => mocks.updateSettings(...args),
}));
vi.mock("@/lib/adminRewardCampaign", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/adminRewardCampaign")>(),
  listAdminRewardCampaigns: (...args: unknown[]) => mocks.listCampaigns(...args),
  createAdminRewardCampaign: (...args: unknown[]) => mocks.createCampaign(...args),
  getAdminRewardCampaign: (...args: unknown[]) => mocks.getCampaign(...args),
  mutateAdminRewardCampaign: (...args: unknown[]) => mocks.mutateCampaign(...args),
  replaceAdminRewardPool: (...args: unknown[]) => mocks.replacePool(...args),
}));
vi.mock("@/lib/adminRewardBox", () => ({
  createAdminRewardBox: (...args: unknown[]) => mocks.createBox(...args),
  updateAdminRewardBox: (...args: unknown[]) => mocks.updateBox(...args),
  deleteAdminRewardBox: (...args: unknown[]) => mocks.deleteBox(...args),
}));

import { GET as getSettings, PUT as putSettings } from "@/app/api/admin/welcome-reward-settings/route";
import { GET as listCampaigns, POST as postCampaign } from "@/app/api/admin/reward-campaigns/route";
import { GET as getCampaign, PATCH as patchCampaign } from "@/app/api/admin/reward-campaigns/[id]/route";
import { PUT as putPool } from "@/app/api/admin/reward-campaigns/[id]/pool/route";
import { POST as postBox } from "@/app/api/admin/reward-campaigns/[id]/boxes/route";
import { DELETE as deleteBox, PATCH as patchBox } from "@/app/api/admin/reward-campaigns/[id]/boxes/[boxId]/route";

const admin = { id: "admin", role: "ADMIN" };
const campaign = { id: "11111111-1111-4111-8111-111111111111", name: "Tết" };
const context = { params: Promise.resolve({ id: campaign.id }) };
const boxContext = { params: Promise.resolve({ id: campaign.id, boxId: "22222222-2222-4222-8222-222222222222" }) };

function json(url: string, method: string, body: unknown) {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("API quản trị welcome reward", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getSession.mockResolvedValue(admin);
    mocks.getSettings.mockResolvedValue({ mode: "POINTS", fixed_package_id: null, active_campaign_id: null, revision: 0 });
    mocks.updateSettings.mockResolvedValue({ mode: "POINTS", fixed_package_id: null, active_campaign_id: null, revision: 1 });
    mocks.listCampaigns.mockResolvedValue([campaign]); mocks.createCampaign.mockResolvedValue(campaign);
    mocks.getCampaign.mockResolvedValue(campaign); mocks.mutateCampaign.mockResolvedValue(campaign); mocks.replacePool.mockResolvedValue(campaign);
    mocks.createBox.mockResolvedValue({ campaign, box: { id: "box", mouth_anchor_x: 0.5, mouth_anchor_y: 0.2 } });
    mocks.updateBox.mockResolvedValue({ campaign, box: { id: "box", mouth_anchor_x: 0.4, mouth_anchor_y: 0.2 } });
    mocks.deleteBox.mockResolvedValue({ deleted: true, revision: 2 });
  });

  it("trả 403 cho customer trước khi parse multipart", async () => {
    mocks.getSession.mockResolvedValue({ id: "customer", role: "CUSTOMER" });
    const request = new Request("http://localhost/api/admin/reward-campaigns/x/boxes", { method: "POST" });
    const parse = vi.spyOn(request, "formData");
    const response = await postBox(request, context);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
    expect(parse).not.toHaveBeenCalled();
  });

  it("trả 401 cho request chưa đăng nhập trước khi parse multipart", async () => {
    mocks.getSession.mockResolvedValue(null);
    const request = new Request("http://localhost/api/admin/reward-campaigns/x/boxes", { method: "POST" });
    const parse = vi.spyOn(request, "formData");
    const response = await postBox(request, context);
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("UNAUTHORIZED");
    expect(parse).not.toHaveBeenCalled();
  });

  it("từ chối multipart vượt Content-Length 4.5MB trước parser", async () => {
    const request = new Request("http://localhost/api/admin/reward-campaigns/x/boxes", {
      method: "POST", headers: { "content-length": String(4.5 * 1024 * 1024 + 1) },
    });
    const parse = vi.spyOn(request, "formData");
    const response = await postBox(request, context);
    expect(response.status).toBe(400);
    expect(parse).not.toHaveBeenCalled();
    expect(mocks.createBox).not.toHaveBeenCalled();
  });

  it.each([undefined, "", " ", "00", "+0", "1.0", "Infinity", "9007199254740992"])(
    "từ chối revision multipart không canonical %s thay vì bypass revision 0",
    async (revision) => {
      const form = new FormData();
      if (revision !== undefined) form.set("revision", revision);
      form.set("name", "Hộp sen");
      form.set("closed_image", new File(["a"], "closed.png", { type: "image/png" }));
      form.set("open_image", new File(["b"], "open.png", { type: "image/png" }));
      const response = await postBox(new Request("http://localhost", { method: "POST", body: form }), context);
      expect(response.status).toBe(400);
      expect(mocks.createBox).not.toHaveBeenCalled();
    },
  );

  it("từ chối campaign id sai trước JSON parser và workflow", async () => {
    const invalidContext = { params: Promise.resolve({ id: "not-a-uuid" }) };
    const detailResponse = await getCampaign(new Request("http://localhost"), invalidContext);
    expect(detailResponse.status).toBe(400);
    expect(mocks.getCampaign).not.toHaveBeenCalled();

    const patchRequest = json("http://localhost", "PATCH", { action: "PAUSE", revision: 0 });
    const patchParser = vi.spyOn(patchRequest, "json");
    expect((await patchCampaign(patchRequest, invalidContext)).status).toBe(400);
    expect(patchParser).not.toHaveBeenCalled();

    const poolRequest = json("http://localhost", "PUT", { revision: 0, items: [] });
    const poolParser = vi.spyOn(poolRequest, "json");
    expect((await putPool(poolRequest, invalidContext)).status).toBe(400);
    expect(poolParser).not.toHaveBeenCalled();
    expect(mocks.mutateCampaign).not.toHaveBeenCalled();
    expect(mocks.replacePool).not.toHaveBeenCalled();
  });

  it("từ chối campaign hoặc box id sai trước multipart và delete JSON parser", async () => {
    const invalidCampaign = { params: Promise.resolve({ id: "bad" }) };
    const createRequest = new Request("http://localhost", { method: "POST" });
    const createParser = vi.spyOn(createRequest, "formData");
    expect((await postBox(createRequest, invalidCampaign)).status).toBe(400);
    expect(createParser).not.toHaveBeenCalled();

    const invalidBox = { params: Promise.resolve({ id: campaign.id, boxId: "bad" }) };
    const patchRequest = new Request("http://localhost", { method: "PATCH" });
    const patchParser = vi.spyOn(patchRequest, "formData");
    expect((await patchBox(patchRequest, invalidBox)).status).toBe(400);
    expect(patchParser).not.toHaveBeenCalled();

    const deleteRequest = json("http://localhost", "DELETE", { revision: 0 });
    const deleteParser = vi.spyOn(deleteRequest, "json");
    expect((await deleteBox(deleteRequest, invalidBox)).status).toBe(400);
    expect(deleteParser).not.toHaveBeenCalled();
    expect(mocks.createBox).not.toHaveBeenCalled();
    expect(mocks.updateBox).not.toHaveBeenCalled();
    expect(mocks.deleteBox).not.toHaveBeenCalled();
  });

  it("đọc và cập nhật settings bằng contract cộng thêm", async () => {
    expect((await (await getSettings()).json()).data.settings.mode).toBe("POINTS");
    const response = await putSettings(json("http://localhost/api/admin/welcome-reward-settings", "PUT", {
      mode: "POINTS", revision: 0,
    }));
    expect(response.status).toBe(200);
    expect(mocks.updateSettings).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: "POINTS", revision: 0 }));
  });

  it("từ chối settings có field thừa", async () => {
    const response = await putSettings(json("http://localhost/api/admin/welcome-reward-settings", "PUT", { mode: "POINTS", revision: 0, extra: true }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
  });

  it("phục vụ list create detail transition và replace pool", async () => {
    expect((await listCampaigns()).status).toBe(200);
    expect((await postCampaign(json("http://localhost/api/admin/reward-campaigns", "POST", { name: " Tết " }))).status).toBe(201);
    expect((await getCampaign(new Request("http://localhost"), context)).status).toBe(200);
    expect((await patchCampaign(json("http://localhost", "PATCH", { action: "PAUSE", revision: 1 }), context)).status).toBe(200);
    const pool = [{ voucher_package_id: "33333333-3333-4333-8333-333333333333", quantity: 60, unlock_after_draws: 0 }];
    expect((await putPool(json("http://localhost", "PUT", { revision: 1, items: pool }), context)).status).toBe(200);
  });

  it("tạo sửa xóa box với multipart và revision", async () => {
    const createForm = new FormData();
    createForm.set("revision", "0"); createForm.set("name", "Hộp sen");
    createForm.set("closed_image", new File(["a"], "closed.png", { type: "image/png" }));
    createForm.set("open_image", new File(["b"], "open.png", { type: "image/png" }));
    const createResponse = await postBox(new Request("http://localhost", { method: "POST", body: createForm }), context);
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual({ data: {
      box: { id: "box", mouth_anchor_x: 0.5, mouth_anchor_y: 0.2 }, campaign,
    } });
    const editForm = new FormData(); editForm.set("revision", "1"); editForm.set("mouth_anchor_x", "0.4");
    const updateResponse = await patchBox(new Request("http://localhost", { method: "PATCH", body: editForm }), boxContext);
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({ data: {
      box: { id: "box", mouth_anchor_x: 0.4, mouth_anchor_y: 0.2 }, campaign,
    } });
    expect((await deleteBox(json("http://localhost", "DELETE", { revision: 2 }), boxContext)).status).toBe(200);
  });
});
