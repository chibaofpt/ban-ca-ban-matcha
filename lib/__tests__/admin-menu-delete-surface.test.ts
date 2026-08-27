import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("app/api/admin/menu/[id]/route.ts", "utf8");
const serviceSource = readFileSync("src/services/adminMenuService.ts", "utf8");
const pageSource = readFileSync("src/views/admin/AdminMenuPage.tsx", "utf8");

describe("Admin menu — không cung cấp hành động xoá món", () => {
  it("route món không export DELETE", () => {
    expect(routeSource).not.toMatch(/export\s+async\s+function\s+DELETE\b/);
  });

  it("service admin không gửi DELETE cho món", () => {
    expect(serviceSource).not.toMatch(/apiClient\.delete\b/);
    expect(serviceSource).not.toMatch(/deleteMenuItem/);
  });

  it("trang admin không hiển thị thao tác hoặc hộp thoại xoá món", () => {
    expect(pageSource).not.toMatch(/deleteMenuItem|deleteTarget|handleDeleteClick/);
    expect(pageSource).not.toMatch(/Trash2|Xoá món|ConfirmModal/);
  });
});
