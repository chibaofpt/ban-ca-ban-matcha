import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWelcomeRewardInTransaction,
  getWelcomeReward,
  openWelcomeReward,
  WelcomeRewardError,
  type WelcomeRewardDatabase,
} from "@/lib/welcomeReward";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REWARD_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";
const BOX_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const FIXED_NOW = new Date("2026-06-01T08:00:00.000Z");
const FIXED_PACKAGE_ID = "66666666-6666-4666-8666-666666666666";

function packageFixture(id: string, menuItemId: string, voucherType: "ITEM" | "DISCOUNT" = "ITEM") {
  return {
    id, name: `Package ${id}`, voucher_type: voucherType, acquisition_mode: "NONE", visibility: "PRIVATE",
    points_cost: 0, is_active: true, quantity: null, max_per_user: 1, expires_after_days: 14,
    discount_type: voucherType === "DISCOUNT" ? "FIXED" : null, discount_value: voucherType === "DISCOUNT" ? 10_000 : null,
    product_discount_mode: null, menu_item_id: voucherType === "ITEM" ? menuItemId : null,
    eligible_sizes: [], reference_size: null, size: null, matcha_powder_id: null, milk_type_id: null,
    included_addon_option_ids: [], addon_option_id: null, covered_price_vnd: null,
    covered_delivery_fee_vnd: null, min_order_vnd: null, max_discount_vnd: null, ends_at: null,
    bundleRule: null, menuItemScopes: [], addonOptionScopes: [], addonOption: null,
  } as const;
}

function catalogRows() {
  return {
    menuItems: [
      { id: "menu-on", name: "Bánh còn bán", category: "extras", is_available: true, unit_price_vnd: 20_000,
        matcha_powder_id: null, default_powder_id: null, default_base_liquid_id: null,
        sizes: [], fusionAllowedPowders: [], allowedBaseLiquids: [] },
      { id: "menu-off", name: "Bánh đã nghỉ", category: "extras", is_available: false, unit_price_vnd: 20_000,
        matcha_powder_id: null, default_powder_id: null, default_base_liquid_id: null,
        sizes: [], fusionAllowedPowders: [], allowedBaseLiquids: [] },
    ],
    powders: [], baseLiquids: [], addonOptions: [],
  };
}

function registrationTx(mode: "POINTS" | "FIXED_VOUCHER" | "GACHA", fixedMenuItemId = "menu-on") {
  const account = { pointsBalance: 37 };
  const pointsLogs: Array<Record<string, unknown>> = [];
  const outcomes: Array<Record<string, unknown>> = [];
  const outcomeCreate = vi.fn(({ data }: { data: Record<string, unknown> }) => {
    outcomes.push(data);
    return Promise.resolve(data);
  });
  const rewardCreate = vi.fn().mockResolvedValue({ id: REWARD_ID });
  const vouchers: Array<Record<string, unknown>> = [];
  const packages = new Map([[FIXED_PACKAGE_ID, packageFixture(FIXED_PACKAGE_ID, fixedMenuItemId)]]);
  const rows = catalogRows();
  const tx = {
    welcomeReward: { findFirst: vi.fn().mockResolvedValue(null), create: rewardCreate, update: vi.fn() },
    welcomeRewardSettings: { findUnique: vi.fn().mockResolvedValue({
      mode,
      fixed_package_id: FIXED_PACKAGE_ID,
      activeCampaign: mode === "GACHA" ? {
        id: CAMPAIGN_ID, status: "ACTIVE", poolItems: [{ id: "pool", quantity: 1 }],
      } : null,
    }) },
    rewardOutcome: { create: outcomeCreate, groupBy: vi.fn().mockResolvedValue([]) },
    user: { update: vi.fn(({ data }: { data: { points_balance: { increment: number } } }) => {
      account.pointsBalance += data.points_balance.increment;
      return Promise.resolve({ points_balance: account.pointsBalance });
    }) },
    pointsLog: { create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      pointsLogs.push(data);
      return Promise.resolve({ id: "log" });
    }) },
    voucherPackage: { findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(packages.get(where.id) ?? null)) },
    voucher: {
      count: vi.fn().mockResolvedValue(0), findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const voucher = { id: `voucher-${vouchers.length + 1}`, qr_token: `token-${vouchers.length + 1}`, ...data };
        vouchers.push(voucher);
        return Promise.resolve(voucher);
      }),
    },
    voucherGrant: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    menuItem: { findMany: vi.fn().mockResolvedValue(rows.menuItems) },
    matchaPowder: { findMany: vi.fn().mockResolvedValue(rows.powders) },
    milkType: { findMany: vi.fn().mockResolvedValue(rows.baseLiquids) },
    addonOption: { findMany: vi.fn().mockResolvedValue(rows.addonOptions) },
  };
  return { tx, outcomeCreate, rewardCreate, vouchers, outcomes, account, pointsLogs };
}

describe("Tạo welcome reward khi đăng ký", () => {
  beforeEach(() => vi.clearAllMocks());

  it("thiếu settings trao đúng 5 điểm và outcome hoàn tất", async () => {
    const { tx, outcomeCreate } = registrationTx("POINTS");
    tx.welcomeRewardSettings.findUnique.mockResolvedValue(null);
    const result = await createWelcomeRewardInTransaction(tx as never, USER_ID);
    expect(result).toEqual({ id: REWARD_ID, mode: "POINTS", status: "COMPLETED", outcome_kind: "POINTS" });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { points_balance: { increment: 5 } } });
    expect(tx.pointsLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ delta: 5, reason: "welcome_bonus" }) }));
    expect(outcomeCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "POINTS", points_log_id: "log" }) }));
  });

  it("FIXED_VOUCHER phát hành snapshot thật và gắn outcome bằng nguồn WELCOME_GIFT", async () => {
    const { tx, vouchers, outcomes } = registrationTx("FIXED_VOUCHER");
    const result = await createWelcomeRewardInTransaction(tx as never, USER_ID, FIXED_NOW);
    expect(result).toEqual({ id: REWARD_ID, mode: "FIXED_VOUCHER", status: "COMPLETED", outcome_kind: "VOUCHER" });
    expect(vouchers).toEqual([expect.objectContaining({
      id: "voucher-1", user_id: USER_ID, package_id: FIXED_PACKAGE_ID, issued_via: "WELCOME_GIFT",
      voucher_type: "ITEM", menu_item_id: "menu-on", status: "ACTIVE",
      expires_at: new Date("2026-06-15T08:00:00.000Z"),
    })]);
    expect(outcomes).toEqual([expect.objectContaining({
      welcome_reward_id: REWARD_ID, user_id: USER_ID, kind: "VOUCHER", voucher_id: "voucher-1",
    })]);
  });

  it("FIXED_VOUCHER không khả dụng fallback đúng POINTS", async () => {
    const { tx, vouchers, outcomes, account, pointsLogs } = registrationTx("FIXED_VOUCHER", "menu-off");
    const initialPointsBalance = account.pointsBalance;
    await expect(createWelcomeRewardInTransaction(tx as never, USER_ID, FIXED_NOW)).resolves.toEqual({
      id: REWARD_ID, mode: "POINTS", status: "COMPLETED", outcome_kind: "POINTS",
    });
    expect(vouchers).toEqual([]);
    expect(account.pointsBalance - initialPointsBalance).toBe(5);
    expect(pointsLogs).toEqual([{
      user_id: USER_ID, delta: 5, reason: "welcome_bonus", performed_by: null,
    }]);
    expect(outcomes).toEqual([{
      welcome_reward_id: REWARD_ID, user_id: USER_ID, kind: "POINTS",
      campaign_id: null, box_id: null, points_log_id: "log", request_id: null,
    }]);
    expect(tx.welcomeReward.update).toHaveBeenCalledWith({ where: { id: REWARD_ID }, data: { mode: "POINTS" } });
  });

  it("GACHA active có allocation chỉ tạo entitlement pending", async () => {
    const { tx } = registrationTx("GACHA");
    await expect(createWelcomeRewardInTransaction(tx as never, USER_ID)).resolves.toEqual({
      id: REWARD_ID, mode: "GACHA", status: "PENDING", outcome_kind: null,
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.voucher.create).not.toHaveBeenCalled();
  });

  it("GACHA depleted fallback thành entitlement POINTS hoàn tất", async () => {
    const { tx } = registrationTx("GACHA");
    tx.rewardOutcome.groupBy.mockResolvedValue([{ pool_item_id: "pool", _count: { _all: 1 } }]);
    await expect(createWelcomeRewardInTransaction(tx as never, USER_ID)).resolves.toMatchObject({
      mode: "POINTS", status: "COMPLETED", outcome_kind: "POINTS",
    });
  });
});

function pendingReward(overrides: Record<string, unknown> = {}) {
  return {
    id: REWARD_ID, user_id: USER_ID, mode: "GACHA", campaign_id: CAMPAIGN_ID, outcome: null,
    campaign: {
      id: CAMPAIGN_ID, name: "Mở hộp", status: "ACTIVE", revision: 2,
      boxes: [{ id: BOX_ID }],
      poolItems: [
        { id: "rare", voucher_package_id: "rare-package", quantity: 1, unlock_after_draws: 1 },
        { id: "normal", voucher_package_id: "normal-package", quantity: 3, unlock_after_draws: 0 },
      ],
    },
    ...overrides,
  };
}

function drawDatabase(
  reward = pendingReward(),
  used = [{ pool_item_id: "normal", _count: { _all: 1 } }],
  rareMenuItemId = "menu-off",
) {
  let current: { [key: string]: unknown; outcome: unknown } = reward;
  const vouchers: Array<Record<string, unknown>> = [];
  const rows = catalogRows();
  const packages = new Map([
    ["rare-package", packageFixture("rare-package", rareMenuItemId)],
    ["normal-package", packageFixture("normal-package", "menu-on")],
  ]);
  const tx = {
    welcomeReward: { findFirst: vi.fn().mockImplementation(() => Promise.resolve(current)) },
    rewardOutcome: {
      findUnique: vi.fn().mockResolvedValue(null), groupBy: vi.fn().mockResolvedValue(used),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        current = { ...current, outcome: {
          pool_item_id: null,
          campaign_id: null,
          box_id: null,
          draw_number: null,
          ...data,
          voucher: data.voucher_id ? {
            id: data.voucher_id,
            user_id: USER_ID,
            issued_via: "GACHA_REWARD",
            package_id: data.pool_item_id === "rare" ? "rare-package" : "normal-package",
          } : null,
          pointsLog: data.points_log_id ? { user_id: USER_ID, delta: 5, reason: "welcome_bonus" } : null,
        } };
        return Promise.resolve(current.outcome);
      }),
    },
    rewardCampaign: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { update: vi.fn() },
    pointsLog: { create: vi.fn().mockResolvedValue({ id: "log" }) },
    voucherPackage: { findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(packages.get(where.id) ?? null)) },
    voucher: {
      count: vi.fn().mockResolvedValue(0), findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const voucher = { id: `draw-voucher-${vouchers.length + 1}`, qr_token: `draw-token-${vouchers.length + 1}`, ...data };
        vouchers.push(voucher);
        return Promise.resolve(voucher);
      }),
    },
    voucherGrant: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    menuItem: { findMany: vi.fn().mockResolvedValue(rows.menuItems) },
    matchaPowder: { findMany: vi.fn().mockResolvedValue(rows.powders) },
    milkType: { findMany: vi.fn().mockResolvedValue(rows.baseLiquids) },
    addonOption: { findMany: vi.fn().mockResolvedValue(rows.addonOptions) },
  };
  const transaction = vi.fn().mockImplementation((callback: (client: unknown) => Promise<unknown>) => callback(tx));
  return { db: { $transaction: transaction } as WelcomeRewardDatabase, tx, transaction, vouchers };
}

describe("Mở welcome reward GACHA", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mở khóa threshold theo draw đã commit và lưu draw_number kế tiếp", async () => {
    const { db, vouchers } = drawDatabase(pendingReward(), [{ pool_item_id: "normal", _count: { _all: 1 } }], "menu-on");

    const result = await openWelcomeReward(
      db,
      { userId: USER_ID, rewardId: REWARD_ID, boxId: BOX_ID, requestId: REQUEST_ID },
      () => 0,
    );

    expect(vouchers).toEqual([expect.objectContaining({ package_id: "rare-package", issued_via: "GACHA_REWARD" })]);
    expect(result.outcome).toMatchObject({ pool_item_id: "rare", draw_number: 2, request_id: REQUEST_ID });
  });

  it("bỏ candidate unavailable rồi phát hành thật candidate usable và bind đủ outcome", async () => {
    const { db, tx, vouchers } = drawDatabase();
    const result = await openWelcomeReward(db, { userId: USER_ID, rewardId: REWARD_ID, boxId: BOX_ID, requestId: REQUEST_ID }, () => 0);
    expect(tx.voucherPackage.findUnique).toHaveBeenCalledTimes(2);
    expect(vouchers).toEqual([expect.objectContaining({
      id: "draw-voucher-1", package_id: "normal-package", issued_via: "GACHA_REWARD", menu_item_id: "menu-on",
    })]);
    expect(result.outcome).toMatchObject({
      kind: "VOUCHER", voucher_id: "draw-voucher-1", pool_item_id: "normal", campaign_id: CAMPAIGN_ID,
      box_id: BOX_ID, draw_number: 2, request_id: REQUEST_ID,
    });
  });

  it("giữ pending khi mọi candidate unlocked đều tạm unavailable", async () => {
    const { db, tx } = drawDatabase();
    tx.menuItem.findMany.mockResolvedValue(catalogRows().menuItems.map((item) => ({ ...item, is_available: false })));
    await expect(openWelcomeReward(db, { userId: USER_ID, rewardId: REWARD_ID, boxId: BOX_ID, requestId: REQUEST_ID }, () => 0))
      .rejects.toMatchObject({ reason: "REWARD_TEMPORARILY_UNAVAILABLE" });
    expect(tx.rewardOutcome.create).not.toHaveBeenCalled();
    expect(tx.menuItem.findMany).toHaveBeenCalledTimes(1);
    expect(tx.voucherPackage.findUnique).toHaveBeenCalledTimes(2);
  });

  it("entitlement đã hoàn tất trả outcome gốc dù box khác", async () => {
    const completed = pendingReward({ outcome: {
      welcome_reward_id: REWARD_ID, user_id: USER_ID, campaign_id: CAMPAIGN_ID,
      pool_item_id: null, box_id: BOX_ID, draw_number: null, kind: "POINTS", points_log_id: "log", voucher: null,
      pointsLog: { user_id: USER_ID, delta: 5, reason: "welcome_bonus" },
    } });
    const { db, tx } = drawDatabase(completed);
    await expect(openWelcomeReward(db, { userId: USER_ID, rewardId: REWARD_ID, boxId: "other", requestId: REQUEST_ID })).resolves.toBe(completed);
    expect(tx.rewardOutcome.groupBy).not.toHaveBeenCalled();
    expect(tx.menuItem.findMany).not.toHaveBeenCalled();
  });

  it("campaign PAUSED giữ pending và trả business reason", async () => {
    const reward = pendingReward({ campaign: { ...pendingReward().campaign, status: "PAUSED" } });
    const { db } = drawDatabase(reward);
    await expect(openWelcomeReward(db, { userId: USER_ID, rewardId: REWARD_ID, boxId: BOX_ID, requestId: REQUEST_ID }))
      .rejects.toMatchObject({ reason: "REWARD_PAUSED" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("campaign ENDED trao 5 điểm gắn campaign và box mà không có draw_number", async () => {
    const reward = pendingReward({ campaign: { ...pendingReward().campaign, status: "ENDED" } });
    const { db, tx } = drawDatabase(reward);
    const result = await openWelcomeReward(db, { userId: USER_ID, rewardId: REWARD_ID, boxId: BOX_ID, requestId: REQUEST_ID });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { points_balance: { increment: 5 } } });
    expect(result.outcome).toMatchObject({ kind: "POINTS", campaign_id: CAMPAIGN_ID, box_id: BOX_ID, request_id: REQUEST_ID });
    expect(result.outcome).toMatchObject({ draw_number: null });
    expect(tx.menuItem.findMany).not.toHaveBeenCalled();
  });

  it("campaign ACTIVE đã depleted fallback điểm mà không load catalog", async () => {
    const reward = pendingReward({ campaign: {
      ...pendingReward().campaign,
      poolItems: [{ id: "normal", voucher_package_id: "normal-package", quantity: 1, unlock_after_draws: 0 }],
    } });
    const { db } = drawDatabase(reward, [{ pool_item_id: "normal", _count: { _all: 1 } }]);

    await expect(openWelcomeReward(db, {
      userId: USER_ID, rewardId: REWARD_ID, boxId: BOX_ID, requestId: REQUEST_ID,
    })).resolves.toMatchObject({ outcome: { kind: "POINTS" } });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("request id đã gắn outcome khác trả CONFLICT trước draw", async () => {
    const { db, tx } = drawDatabase();
    tx.rewardOutcome.findUnique.mockResolvedValue({ welcome_reward_id: "another-reward" });
    await expect(openWelcomeReward(db, { userId: USER_ID, rewardId: REWARD_ID, boxId: BOX_ID, requestId: REQUEST_ID }))
      .rejects.toMatchObject({ reason: "CONFLICT" });
    expect(tx.rewardOutcome.groupBy).not.toHaveBeenCalled();
  });

  it.each(["P2034", "P2002"])("retry tối đa ba lần khi transaction xung đột %s rồi trả CONFLICT", async (code) => {
    const transaction = vi.fn().mockRejectedValue(Object.assign(new Error("conflict"), { code }));
    const db = { $transaction: transaction } as unknown as WelcomeRewardDatabase;
    await expect(openWelcomeReward(db, { userId: USER_ID, rewardId: REWARD_ID, boxId: BOX_ID, requestId: REQUEST_ID }))
      .rejects.toSatisfy((error: unknown) => error instanceof WelcomeRewardError && error.reason === "CONFLICT");
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});

function persistedReward(overrides: Record<string, unknown> = {}) {
  return {
    ...pendingReward(),
    outcome: {
      welcome_reward_id: REWARD_ID,
      user_id: USER_ID,
      kind: "VOUCHER",
      campaign_id: CAMPAIGN_ID,
      pool_item_id: "normal",
      box_id: BOX_ID,
      draw_number: 2,
      voucher: { user_id: USER_ID, issued_via: "GACHA_REWARD", package_id: "normal-package" },
      pointsLog: null,
    },
    ...overrides,
  };
}

describe("Kiểm chứng outcome đã lưu trước replay", () => {
  it.each([
    {
      name: "GACHA outcome không có campaign",
      reward: persistedReward({ campaign_id: null, campaign: null }),
    },
    {
      name: "voucher sai nguồn",
      reward: persistedReward({ outcome: { ...persistedReward().outcome, voucher: { user_id: USER_ID, issued_via: "WELCOME_GIFT" } } }),
    },
    {
      name: "voucher sai chủ sở hữu",
      reward: persistedReward({ outcome: { ...persistedReward().outcome, voucher: {
        user_id: "other", issued_via: "GACHA_REWARD", package_id: "normal-package",
      } } }),
    },
    {
      name: "voucher đúng chủ và nguồn nhưng sai package của pool item",
      reward: persistedReward({ outcome: { ...persistedReward().outcome, voucher: {
        user_id: USER_ID, issued_via: "GACHA_REWARD", package_id: "other-package",
      } } }),
    },
    {
      name: "points log sai chủ, delta và reason",
      reward: persistedReward({ outcome: {
        ...persistedReward().outcome,
        kind: "POINTS", pool_item_id: null, draw_number: null, voucher: null,
        pointsLog: { user_id: "other", delta: 4, reason: "manual_adjustment" },
      } }),
    },
    {
      name: "POINTS entitlement mang voucher outcome",
      reward: persistedReward({ mode: "POINTS", campaign_id: null, campaign: null, outcome: {
        ...persistedReward().outcome,
        campaign_id: null, pool_item_id: null, box_id: null, draw_number: null,
        voucher: { user_id: USER_ID, issued_via: "WELCOME_GIFT" },
      } }),
    },
  ])("từ chối $name", async ({ reward }) => {
    const tx = { welcomeReward: { findFirst: vi.fn().mockResolvedValue(reward) } };
    await expect(getWelcomeReward(tx as never, USER_ID)).rejects.toThrow("Welcome reward identity invariant violated");
  });
});
