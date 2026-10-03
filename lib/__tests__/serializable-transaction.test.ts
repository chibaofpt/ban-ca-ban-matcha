import { describe, expect, it, vi } from "vitest";
import { runSerializableTransaction } from "@/lib/serializableTransaction";

describe("transaction tạo đơn", () => {
  it("giữ timeout mặc định 10 giây cho các workflow ngắn", async () => {
    const transaction = vi.fn(async (
      operation: (tx: object) => Promise<string>,
      options: { isolationLevel: string; maxWait: number; timeout: number },
    ) => operation({ options }));

    await runSerializableTransaction(
      { $transaction: transaction } as never,
      async () => "ok",
    );

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 5_000,
      timeout: 10_000,
    });
  });

  it("cho luồng bundle nhiều truy vấn tối đa 30 giây", async () => {
    const transaction = vi.fn(async (
      operation: (tx: object) => Promise<string>,
      options: { isolationLevel: string; maxWait: number; timeout: number },
    ) => operation({ options }));

    const result = await runSerializableTransaction(
      { $transaction: transaction } as never,
      async () => "ok",
      { timeoutMs: 30_000 },
    );

    expect(result).toBe("ok");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 5_000,
      timeout: 30_000,
    });
  });
});
