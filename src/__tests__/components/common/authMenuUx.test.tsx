import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ComponentProps, type ElementType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockServerLogout = vi.fn();
const mockClientLogout = vi.fn();
const mockRemoveQueries = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockCloseAuth = vi.fn();
let mockPathname = "/menu";
let mockAuthOpen = false;

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy({}, {
    get: (_target, tag: string) => ({ children, ...props }: ComponentProps<ElementType>) => {
      const domProps = { ...props } as Record<string, unknown>;
      for (const key of ["initial", "animate", "exit", "transition", "variants"]) delete domProps[key];
      return createElement(tag, domProps, children);
    },
  }),
  useScroll: () => ({ scrollY: { getPrevious: () => 0 } }),
  useMotionValueEvent: () => undefined,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ removeQueries: mockRemoveQueries }),
}));

vi.mock("@/src/services/authService", () => ({
  logout: () => mockServerLogout(),
}));

vi.mock("@/src/lib/store/authStore", () => ({
  useAuthStore: (selector: (state: { user: { phone: string } | null; logout: typeof mockClientLogout }) => unknown) =>
    selector({ user: { phone: "+84901234567" }, logout: mockClientLogout }),
}));

vi.mock("@/src/lib/store/authModalStore", () => ({
  useAuthModalStore: (selector: (state: {
    open: boolean;
    mode: "login";
    close: typeof mockCloseAuth;
    openLogin: () => void;
  }) => unknown) => selector({ open: mockAuthOpen, mode: "login", close: mockCloseAuth, openLogin: vi.fn() }),
}));

vi.mock("@/src/lib/store/cartStore", () => ({
  useCartStore: (selector: (state: { setCartOpen: () => void }) => unknown) => selector({ setCartOpen: vi.fn() }),
  useCartTotalItems: () => 0,
}));

vi.mock("@/src/components/common/NavLink", () => ({
  NavLink: ({ children, ...props }: ComponentProps<"a"> & { activeClassName?: string }) => {
    const linkProps = { ...props };
    delete linkProps.activeClassName;
    return createElement("a", linkProps, children);
  },
}));

vi.mock("@/src/components/common/NavbarOverlays", () => ({
  NavbarOverlays: ({ logoutConfirmOpen, onConfirmLogout }: { logoutConfirmOpen: boolean; onConfirmLogout: () => Promise<void> }) =>
    logoutConfirmOpen ? createElement("button", { onClick: onConfirmLogout }, "Xác nhận đăng xuất") : null,
}));

vi.mock("@/src/hooks/useBodyScrollLock", () => ({ useBodyScrollLock: vi.fn() }));
vi.mock("@/src/components/common/LoginForm", () => ({ default: () => createElement("div", null, "Login form") }));
vi.mock("@/src/components/common/RegisterForm", () => ({ default: () => null }));

import AuthModal from "@/src/components/common/AuthModal";
import Navbar from "@/src/components/common/Navbar";

describe("Auth UX trên trang menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/menu";
    mockAuthOpen = false;
    mockServerLogout.mockResolvedValue(undefined);
  });

  it("đăng xuất tại menu không điều hướng và chỉ xóa cache customer", async () => {
    render(createElement(Navbar));

    fireEvent.click(screen.getAllByRole("button", { name: "Đăng xuất" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận đăng xuất" }));

    await waitFor(() => expect(mockClientLogout).toHaveBeenCalledOnce());
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ["customer"] });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("đăng xuất ngoài trang menu vẫn điều hướng về trang chủ", async () => {
    mockPathname = "/history";
    render(createElement(Navbar));

    fireEvent.click(screen.getAllByRole("button", { name: "Đăng xuất" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận đăng xuất" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("đánh dấu login modal là overlay không được làm đóng drawer nền", () => {
    mockAuthOpen = true;
    const { container } = render(createElement(AuthModal));

    expect(container.querySelector('[data-prevent-drawer-close="true"]')).not.toBeNull();
  });
});
