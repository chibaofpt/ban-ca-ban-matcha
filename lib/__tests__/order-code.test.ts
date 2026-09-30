import type { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateOrderCode } from "@/lib/orders/orderCode";

function database(findUnique: ReturnType<typeof vi.fn>): Pick<Prisma.TransactionClient, "order"> {
  return { order: { findUnique } } as unknown as Pick<Prisma.TransactionClient, "order">;
}

describe("generateOrderCode", () => {
  afterEach(() => vi.restoreAllMocks());

  it("tạo đúng format, ánh xạ charset và query uniqueness tối thiểu", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const charsetIndexes = [0, 7, 8, 22, 23, 30];
    const random = vi.spyOn(Math, "random");
    charsetIndexes.forEach((index) => random.mockReturnValueOnce((index + 0.25) / 31));

    const result = await generateOrderCode(database(findUnique));

    expect(result).toBe("BCBM-AHJZ29");
    expect(result).toMatch(/^BCBM-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { order_code: "BCBM-AHJZ29" },
      select: { id: true },
    });
  });

  it("thử lại sau collision rồi trả code mới", async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce({ id: "collision" })
      .mockResolvedValueOnce(null);
    let randomCall = 0;
    vi.spyOn(Math, "random").mockImplementation(() => randomCall++ < 6 ? 0 : 0.999999);

    const result = await generateOrderCode(database(findUnique));

    expect(result).toBe("BCBM-999999");
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { order_code: "BCBM-AAAAAA" },
      select: { id: true },
    });
    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { order_code: "BCBM-999999" },
      select: { id: true },
    });
  });

  it("ném đúng lỗi sau mười collision", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "collision" });
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(generateOrderCode(database(findUnique))).rejects.toThrow(
      "[generateOrderCode] Failed to generate unique order code after 10 attempts",
    );
    expect(findUnique).toHaveBeenCalledTimes(10);
  });
});
