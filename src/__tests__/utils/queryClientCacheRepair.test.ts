import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { clearPrivateQueryCaches } from "@/src/lib/queryClient";

describe("dọn cache riêng tư theo phiên", () => {
  it("xóa cache customer staff admin nhưng giữ menu và bột công khai", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["customer", "vouchers"], ["customer"]);
    queryClient.setQueryData(["my_vouchers"], ["legacy-customer"]);
    queryClient.setQueryData(["staff", "orders"], ["staff"]);
    queryClient.setQueryData(["admin", "settings"], ["admin"]);
    queryClient.setQueryData(["menu"], ["menu"]);
    queryClient.setQueryData(["powders"], ["powders"]);

    clearPrivateQueryCaches(queryClient);

    expect(queryClient.getQueryData(["customer", "vouchers"])).toBeUndefined();
    expect(queryClient.getQueryData(["my_vouchers"])).toBeUndefined();
    expect(queryClient.getQueryData(["staff", "orders"])).toBeUndefined();
    expect(queryClient.getQueryData(["admin", "settings"])).toBeUndefined();
    expect(queryClient.getQueryData(["menu"])).toEqual(["menu"]);
    expect(queryClient.getQueryData(["powders"])).toEqual(["powders"]);
  });
});
