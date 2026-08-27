import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoginRequest = vi.fn();
const mockLoginStore = vi.fn();
const mockClose = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockRemoveQueries = vi.fn();
let mockPathname = "/menu";

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: { children: React.ReactNode }) => createElement("div", null, children) },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ removeQueries: mockRemoveQueries }),
}));

vi.mock("@/src/services/authService", () => ({
  login: (payload: unknown) => mockLoginRequest(payload),
}));

vi.mock("@/src/lib/store/authStore", () => ({
  useAuthStore: (selector: (state: { login: typeof mockLoginStore }) => unknown) => selector({ login: mockLoginStore }),
}));

vi.mock("@/src/lib/store/authModalStore", () => ({
  useAuthModalStore: (selector: (state: { close: typeof mockClose; switchTo: () => void }) => unknown) =>
    selector({ close: mockClose, switchTo: vi.fn() }),
}));

vi.mock("@/src/lib/api/client", () => ({ resetForceLogout: vi.fn() }));

import LoginForm from "@/src/components/common/LoginForm";

describe("LoginForm — giữ ngữ cảnh menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/menu";
    window.scrollTo = vi.fn();
    mockLoginRequest.mockResolvedValue({
      role: "CUSTOMER",
      phone_number: "+84901234567",
      name: "Bạn Cá",
    });
  });

  it("đăng nhập customer tại menu không điều hướng hoặc refresh", async () => {
    render(createElement(LoginForm));

    fireEvent.change(screen.getByLabelText("Số điện thoại hoặc Instagram"), { target: { value: "0901234567" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "matkhau123" } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(mockLoginStore).toHaveBeenCalledWith("+84901234567", "Bạn Cá"));
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ["customer"] });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
