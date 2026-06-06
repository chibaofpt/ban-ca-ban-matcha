"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  Menu,
  X,
  LogIn,
  LogOut,
  Home,
  Info,
  UtensilsCrossed,
  ClipboardList,
  UserCircle,
} from "lucide-react";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NavLink } from "@/src/components/common/NavLink";
import { useCartStore, useCartTotalItems } from "@/src/lib/store/cartStore";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";

/**
 * Navbar — fixed top bar with desktop links and mobile drawer.
 * Auth state and modal control come from Zustand stores (no Provider needed).
 */
const Navbar = () => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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

  const handleLogout = () => {
    logout();
    setOpen(false);
    router.push("/");
  };

  const close = () => setOpen(false);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
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
            href="/about"
            className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center gap-1.5"
            activeClassName="text-primary"
          >
            <Info className="w-3.5 h-3.5" />
            Câu Chuyện
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
                href="/profile"
                className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center gap-1.5"
                activeClassName="text-primary"
              >
                <UserCircle className="w-3.5 h-3.5" />
                Tài khoản (QR)
              </NavLink>

              <NavLink
                href="/history"
                className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors flex items-center gap-1.5"
                activeClassName="text-primary"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Đơn hàng &amp; Voucher
              </NavLink>

              <button
                onClick={handleLogout}
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
            onClick={() => setCartOpen(true)}
            className="relative p-2 rounded-full hover:bg-secondary transition-colors"
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
            onClick={() => setCartOpen(true)}
            className="relative p-2"
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
            className="p-2"
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
            className="md:hidden overflow-hidden bg-white/98 backdrop-blur-md border-t border-border/40"
          >
            <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-1">
              <NavLink
                href="/"
                onClick={close}
                className="text-sm font-medium py-2.5 flex items-center gap-2 text-foreground/80 hover:text-primary transition-colors"
                activeClassName="text-primary"
              >
                <Home className="w-4 h-4" />
                Trang chủ
              </NavLink>

              <NavLink
                href="/about"
                onClick={close}
                className="text-sm font-medium py-2.5 flex items-center gap-2 text-foreground/80 hover:text-primary transition-colors"
                activeClassName="text-primary"
              >
                <Info className="w-4 h-4" />
                Câu Chuyện
              </NavLink>

              <NavLink
                href="/menu"
                onClick={close}
                className="text-sm font-medium py-2.5 flex items-center gap-2 text-foreground/80 hover:text-primary transition-colors"
                activeClassName="text-primary"
              >
                <UtensilsCrossed className="w-4 h-4" />
                Menu
              </NavLink>

              {isLoggedIn ? (
                <>
                  <NavLink
                    href="/profile"
                    onClick={close}
                    className="text-sm font-medium py-2.5 flex items-center gap-2 text-foreground/80 hover:text-primary transition-colors"
                    activeClassName="text-primary"
                  >
                    <UserCircle className="w-4 h-4" />
                    Tài khoản (QR)
                  </NavLink>

                  <NavLink
                    href="/history"
                    onClick={close}
                    className="text-sm font-medium py-2.5 flex items-center gap-2 text-foreground/80 hover:text-primary transition-colors"
                    activeClassName="text-primary"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Đơn hàng &amp; Voucher
                  </NavLink>

                  <button
                    onClick={handleLogout}
                    className="text-sm font-medium py-2.5 flex items-center gap-2 text-destructive hover:text-destructive/80 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Đăng xuất
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { openLogin(); close(); }}
                  className="text-sm font-medium py-2.5 flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
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
  );
};

export default Navbar;
