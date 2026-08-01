"use client";

import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { ShoppingBag, Menu, X, LogIn, LogOut, Home, UtensilsCrossed, ClipboardList, UserCircle } from "lucide-react";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NavLink } from "@/src/components/common/NavLink";
import { NavbarOverlays } from "@/src/components/common/NavbarOverlays";
import { useCartStore, useCartTotalItems } from "@/src/lib/store/cartStore";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { logout as serverLogout } from "@/src/services/authService";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Navbar — fixed top bar with desktop links and mobile drawer.
 * Auto-hides on scroll down, shows on scroll up.
 */
const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() || 0;
    if (latest > previous && latest > 150) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  });

  // Auth
  const isLoggedIn = useAuthStore((s) => s.user !== null);
  const logout = useAuthStore((s) => s.logout);
  const openLogin = useAuthModalStore((s) => s.openLogin);

  // Cart
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const count = useCartTotalItems();

  if (pathname.startsWith("/admin") || pathname.startsWith("/staff")) {
    return null;
  }

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      await serverLogout();
    } catch {
      /* best-effort */
    }
    logout();
    queryClient.removeQueries({ queryKey: ["customer"] });
    setOpen(false);
    router.push("/");
  };

  const close = () => setOpen(false);

  const handleCartClick = () => {
    if (pathname !== "/menu") {
      router.push("/menu");
    }
    if (count > 0) {
      setCartOpen(true);
    }
  };

  return (
    <>
      <motion.nav
        variants={{
          visible: { y: 0 },
          hidden: { y: "-100%" },
        }}
        animate={hidden ? "hidden" : "visible"}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-border/40"
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
          {/* Brand */}
          <NavLink
            href="/"
            className="font-playfair text-2xl font-bold text-primary tracking-tight"
          >
            Bạn Cá Bán Matcha
          </NavLink>

          {/* ── Desktop links ── */}
          <div className="hidden md:flex items-center gap-6">
            <NavLink
              href="/"
              className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center gap-1.5"
              activeClassName="text-primary"
            >
              <Home className="w-3.5 h-3.5" />
              Trang chủ
            </NavLink>

            <NavLink
              href="/menu"
              className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center gap-1.5"
              activeClassName="text-primary"
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              Menu
            </NavLink>

            {isLoggedIn ? (
              <>
                <NavLink
                  href="/history"
                  className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center gap-1.5"
                  activeClassName="text-primary"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Đơn hàng và điểm
                </NavLink>

                <NavLink
                  href="/profile"
                  className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center gap-1.5"
                  activeClassName="text-primary"
                >
                  <UserCircle className="w-3.5 h-3.5" />
                  Tài khoản
                </NavLink>

                <button
                  onClick={handleLogoutClick}
                  className="text-sm font-medium text-foreground/80 hover:text-destructive transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Đăng xuất
                </button>
              </>
            ) : (
              <button
                onClick={openLogin}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                Đăng nhập
              </button>
            )}

            {/* Cart button */}
            <button
              onClick={handleCartClick}
              className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-secondary"
              aria-label="Giỏ hàng"
            >
              <ShoppingBag className="w-5 h-5 text-primary" />
              <AnimatePresence>
                {count > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[10px] rounded-full flex items-center justify-center font-bold border-2 border-white"
                  >
                    {count}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>

          {/* ── Mobile: cart + hamburger ── */}
          <div className="flex md:hidden items-center gap-3">
            <button
              onClick={handleCartClick}
              className="relative flex h-11 w-11 items-center justify-center rounded-full"
              aria-label="Giỏ hàng"
            >
              <ShoppingBag className="w-5 h-5 text-primary" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </button>

            <button
              onClick={() => setOpen(!open)}
              className="flex h-11 w-11 items-center justify-center rounded-full"
              aria-label={open ? "Đóng menu" : "Mở menu"}
            >
              {open ? (
                <X className="w-5 h-5 text-primary" />
              ) : (
                <Menu className="w-5 h-5 text-primary" />
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ── */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden absolute top-full left-0 right-0 z-50 overflow-hidden bg-white/98 backdrop-blur-md border-t border-border/40 shadow-lg"
            >
              <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col items-end gap-1 text-right">
                <NavLink
                  href="/"
                  onClick={close}
                  className="flex min-h-11 w-full flex-row-reverse items-center justify-end gap-2 text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
                  activeClassName="text-primary"
                >
                  <Home className="w-4 h-4" />
                  Trang chủ
                </NavLink>

                <NavLink
                  href="/menu"
                  onClick={close}
                  className="flex min-h-11 w-full flex-row-reverse items-center justify-end gap-2 text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
                  activeClassName="text-primary"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  Menu
                </NavLink>

                {isLoggedIn ? (
                  <>
                    <NavLink
                      href="/history"
                      onClick={close}
                      className="flex min-h-11 w-full flex-row-reverse items-center justify-end gap-2 text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
                      activeClassName="text-primary"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Đơn hàng và điểm
                    </NavLink>

                    <NavLink
                      href="/profile"
                      onClick={close}
                      className="flex min-h-11 w-full flex-row-reverse items-center justify-end gap-2 text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
                      activeClassName="text-primary"
                    >
                      <UserCircle className="w-4 h-4" />
                      Tài khoản
                    </NavLink>

                    <button
                      onClick={handleLogoutClick}
                      className="flex min-h-11 w-full flex-row-reverse items-center justify-end gap-2 text-sm font-medium text-destructive transition-colors hover:text-destructive/80"
                    >
                      <LogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      openLogin();
                      close();
                    }}
                    className="flex min-h-11 w-full flex-row-reverse items-center justify-end gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    <LogIn className="w-4 h-4" />
                    Đăng nhập
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      <NavbarOverlays
        drawerOpen={open}
        logoutConfirmOpen={showLogoutConfirm}
        onCloseDrawer={close}
        onConfirmLogout={handleConfirmLogout}
        onCancelLogout={() => setShowLogoutConfirm(false)}
      />
    </>
  );
};

export default Navbar;
