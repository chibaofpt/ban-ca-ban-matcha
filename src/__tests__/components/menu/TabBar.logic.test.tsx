import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TabBar from "@/src/components/menu/TabBar";

describe("TabBar menu — Seasonal đứng riêng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nhóm ba danh mục chính và giữ Seasonal thành nút độc lập", () => {
    const setActiveTab = vi.fn();
    render(<TabBar activeTab="latte" setActiveTab={setActiveTab} />);

    const primaryGroup = screen.getByRole("group", { name: "Danh mục chính" });
    expect(within(primaryGroup).getAllByRole("button")).toHaveLength(3);
    expect(within(primaryGroup).getByRole("button", { name: "Latte" })).not.toBeNull();
    expect(within(primaryGroup).getByRole("button", { name: "Fusion" })).not.toBeNull();
    expect(within(primaryGroup).getByRole("button", { name: "Add-on" })).not.toBeNull();

    const seasonalButton = screen.getByRole("button", { name: "Seasonal" });
    expect(primaryGroup.contains(seasonalButton)).toBe(false);

    fireEvent.click(seasonalButton);
    expect(setActiveTab).toHaveBeenCalledWith("seasonal");
  });
});
